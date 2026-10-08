/**
 * sharedProfile.ts
 * 神馬三國 JS 版和 Godot 版共用同一份雲端存檔（同一個 shenma_player_key）時的格式規則（純函式：不連網、不讀寫瀏覽器儲存）。
 * - 唯一的保存格式是後端／Godot 的存檔（canonical）：原樣保留，包含不認得的欄位、武將與隊伍項目與原本的數值（0 也保留）
 * - JS 版的畫面另用顯示投影（display）：沒升級過的武將用武將設定的基礎值補上，只給畫面用，絕不寫回
 * - 武將 ID 只用明確的對照表轉換：後端武將設定的 guan_yu ↔ JS 版內建的 hero_guan_yu，兩邊都有設定、各只出現一次才算；不對任意字串加減前綴
 * - 暱稱與隊伍的保存：只在 canonical 的副本上改這兩個欄位，其他原樣保留；隊伍用後端武將設定的 cost 與存檔的 capacity 檢查
 * - 存檔的欄位缺少或格式不對：整份唯讀（看得到、不寫入），不補值再保存
 */
import type { PlayerHeroState, PlayerState, TeamSlot } from "../types/player";

/** 後端存檔的 data（get_profile 回應的 data），原樣保存 */
export type CanonicalProfile = Record<string, unknown>;

/** 後端武將設定（get_heroes_config 的一列）裡這裡用到的欄位；其他欄位不管 */
export interface SharedHeroConfig {
  hero_id: string;
  cost?: unknown;
  base_atk?: unknown;
  base_def?: unknown;
  base_hp?: unknown;
  upgrade_cost_base?: unknown;
  atk_growth?: unknown;
  def_growth?: unknown;
  hp_growth?: unknown;
}

/** JS 版一次出征最多 5 位（畫面的槽位數） */
export const MAX_TEAM_SIZE = 5;
/** 暱稱長度上限（和後端建立存檔時截斷的長度相同） */
export const NICKNAME_MAX = 50;

export interface HeroIdMap {
  /** 後端的 hero_id → JS 版的 hero_id */
  toCanvas: ReadonlyMap<string, string>;
  /** JS 版的 hero_id → 後端的 hero_id */
  toCanonical: ReadonlyMap<string, string>;
}

const counts = (xs: readonly string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};

/**
 * 武將 ID 對照表：後端設定的 g 和 JS 版內建的 c，只有 c === "hero_" + g、兩邊各只出現一次、g 本身沒有 hero_ 前綴時才配對。
 * 其他（只在一邊、重複、格式不同）都不配對：那些武將原樣保留，JS 版不能顯示或編輯
 */
export function buildHeroIdMap(
  canonicalIds: readonly string[],
  canvasIds: readonly string[]
): HeroIdMap {
  const cc = counts(canonicalIds);
  const vc = counts(canvasIds);
  const toCanvas = new Map<string, string>();
  const toCanonical = new Map<string, string>();
  for (const [g, n] of cc) {
    if (n !== 1 || !g || g.startsWith("hero_")) continue;
    const c = "hero_" + g;
    if (vc.get(c) === 1) {
      toCanvas.set(g, c);
      toCanonical.set(c, g);
    }
  }
  return { toCanvas, toCanonical };
}

export interface ProfileIssue {
  code: string;
  detail?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isNonNegInt = (v: unknown): v is number =>
  isFiniteNum(v) && v >= 0 && Math.floor(v) === v;

/**
 * 檢查共用存檔能不能安全地顯示與寫入。回傳的問題任何一項都讓整份存檔唯讀（不補值再保存）。
 * 後端只檢查 gold／nickname／heroes／team 的型別（team 可以沒有）；這裡另外要求 JS 版畫面用到的 level／exp／capacity／max_stage，
 * 缺少或格式不對時只能看、不能寫
 */
export function checkCanonical(data: unknown): ProfileIssue[] {
  if (!isObj(data)) return [{ code: "NOT_OBJECT" }];
  const issues: ProfileIssue[] = [];
  if (typeof data.nickname !== "string") issues.push({ code: "NICKNAME" });
  if (!isFiniteNum(data.gold) || data.gold < 0) issues.push({ code: "GOLD" });
  if (!isNonNegInt(data.level) || data.level < 1)
    issues.push({ code: "LEVEL" });
  if (!isFiniteNum(data.exp) || data.exp < 0) issues.push({ code: "EXP" });
  if (!isFiniteNum(data.capacity) || data.capacity < 0)
    issues.push({ code: "CAPACITY" });
  if (typeof data.max_stage !== "string") issues.push({ code: "MAX_STAGE" });
  if (!Array.isArray(data.heroes)) {
    issues.push({ code: "HEROES" });
  } else {
    data.heroes.forEach((h, i) => {
      if (!isObj(h) || typeof h.hero_id !== "string" || !h.hero_id) {
        issues.push({ code: "HERO_ENTRY", detail: String(i) });
        return;
      }
      for (const f of ["level", "star", "atk", "def", "hp"]) {
        if (h[f] !== undefined && !isFiniteNum(h[f])) {
          issues.push({ code: "HERO_VALUE", detail: `${h.hero_id}.${f}` });
        }
      }
    });
  }
  if (data.team !== undefined && !Array.isArray(data.team))
    issues.push({ code: "TEAM" });
  return issues;
}

/** 武將設定的數值欄位：有限數字才用，否則是 0（只給顯示用） */
const cfgNum = (v: unknown) => {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim() !== ""
        ? Number(v)
        : NaN;
  return Number.isFinite(n) ? n : 0;
};

export interface SharedProjection {
  /** 只給畫面用的玩家資料（JS 版的形狀）；不能拿去保存 */
  display: PlayerState;
  /** 整份唯讀：存檔有問題（見 issues），只能看、不能寫 */
  readOnly: boolean;
  issues: ProfileIssue[];
  /** 雲端的隊伍 JS 版能完整表示；否則原樣保留，暫停在這裡修改隊伍與出征 */
  teamEditable: boolean;
  /** 隊伍不能表示的原因（給畫面說明）；可以表示時是 null */
  teamNote: string | null;
  /** 存檔裡 JS 版不能對照或重複的武將 ID（原樣保留、不可編輯） */
  lockedHeroIds: string[];
}

/**
 * 把共用存檔投影成 JS 版的畫面資料。
 * - 武將：依後端武將設定的順序，只列兩邊都有的武將；存檔有一筆升級紀錄就用它的數值（0 照樣是 0），沒有紀錄就用設定的基礎值（等級 1、星 0）
 * - 存檔裡對照不到或重複（同一位兩筆以上）的武將不列在畫面上、不猜數值，記在 lockedHeroIds
 * - 隊伍：依 slot 排序後逐一對照；有任何一項對照不到、有 hero_id／slot 以外的欄位、slot 不是正整數或重複、同一位武將出現兩次、超過 MAX_TEAM_SIZE，
 *   就整份不能表示（teamEditable=false，畫面的隊伍是空的），不自動換成預設隊伍
 */
export function projectSharedProfile(
  key: string,
  canonical: unknown,
  rev: number | null,
  heroesConfig: readonly SharedHeroConfig[],
  idMap: HeroIdMap
): SharedProjection {
  const issues = checkCanonical(canonical);
  const data: Record<string, unknown> = isObj(canonical) ? canonical : {};
  const rawHeroes: unknown[] = Array.isArray(data.heroes) ? data.heroes : [];
  const byId = new Map<string, Record<string, unknown>[]>();
  for (const h of rawHeroes) {
    if (!isObj(h) || typeof h.hero_id !== "string") continue;
    const list = byId.get(h.hero_id) ?? [];
    list.push(h);
    byId.set(h.hero_id, list);
  }
  const lockedHeroIds: string[] = [];
  for (const [id, list] of byId) {
    if (!idMap.toCanvas.has(id) || list.length > 1) lockedHeroIds.push(id);
  }
  const num = (v: unknown, fallback: number) => (isFiniteNum(v) ? v : fallback);
  const heroes: PlayerHeroState[] = [];
  for (const cfg of heroesConfig) {
    const c = idMap.toCanvas.get(cfg.hero_id);
    if (!c) continue;
    const list = byId.get(cfg.hero_id) ?? [];
    // 同一位武將在存檔裡有兩筆以上的紀錄：不知道哪一筆才對，不猜數值、不列成一般武將（原樣保留在 canonical，記在 lockedHeroIds）
    if (list.length > 1) continue;
    const own = list.length === 1 ? list[0] : null;
    heroes.push({
      hero_id: c,
      level: num(own?.level, 1),
      star: num(own?.star, 0),
      atk: num(own?.atk, cfgNum(cfg.base_atk)),
      def: num(own?.def, cfgNum(cfg.base_def)),
      hp: num(own?.hp, cfgNum(cfg.base_hp)),
    });
  }
  let team: TeamSlot[] = [];
  let teamEditable = true;
  let teamNote: string | null = null;
  if (Array.isArray(data.team)) {
    const entries = data.team.slice();
    const ok =
      entries.length <= MAX_TEAM_SIZE &&
      entries.every(
        (t) =>
          isObj(t) &&
          Object.keys(t).every((k) => k === "hero_id" || k === "slot") &&
          typeof t.hero_id === "string" &&
          idMap.toCanvas.has(t.hero_id) &&
          !lockedHeroIds.includes(t.hero_id) &&
          isNonNegInt(t.slot) &&
          (t.slot as number) >= 1
      ) &&
      new Set(entries.map((t) => (t as { slot: number }).slot)).size ===
        entries.length &&
      new Set(entries.map((t) => (t as { hero_id: string }).hero_id)).size ===
        entries.length;
    if (ok) {
      team = (entries as { hero_id: string; slot: number }[])
        .slice()
        .sort((a, b) => a.slot - b.slot)
        .map((t, i) => ({
          slot: i,
          hero_id: idMap.toCanvas.get(t.hero_id) as string,
        }));
    } else {
      teamEditable = false;
      teamNote =
        "雲端的出征隊伍有這裡還不支援的武將或格式：原樣保留，暫時不能在這裡修改或出征。";
    }
  }
  const cleared: Record<string, number> = {};
  if (isObj(data.cleared_stages)) {
    for (const [k, v] of Object.entries(data.cleared_stages))
      if (isFiniteNum(v)) cleared[k] = v;
  }
  const display: PlayerState = {
    key,
    nickname: typeof data.nickname === "string" ? data.nickname : "",
    level: num(data.level, 1),
    exp: num(data.exp, 0),
    gold: num(data.gold, 0),
    capacity: num(data.capacity, 0),
    max_stage:
      typeof data.max_stage === "string" ? data.max_stage : "chapter1_1",
    cleared_stages: cleared,
    heroes,
    team,
    serverRev: rev ?? undefined,
  };
  return {
    display,
    readOnly: issues.length > 0,
    issues,
    teamEditable,
    teamNote,
    lockedHeroIds,
  };
}

export type PatchResult =
  | { ok: true; data: CanonicalProfile }
  | { ok: false; error: string };

/** 只改暱稱：canonical 的副本，其他欄位原樣保留 */
export function patchNickname(
  canonical: CanonicalProfile,
  nickname: string
): PatchResult {
  const nick = nickname.trim();
  if (!nick) return { ok: false, error: "暱稱不能是空白" };
  if (nick.length > NICKNAME_MAX)
    return { ok: false, error: `暱稱最多 ${NICKNAME_MAX} 個字` };
  return { ok: true, data: { ...canonical, nickname: nick } };
}

/** 隊伍用掉的 cost（後端武將設定的 cost；設定裡沒有的武將算不出來時回 null） */
export function teamCost(
  team: readonly TeamSlot[],
  heroesConfig: readonly SharedHeroConfig[],
  idMap: HeroIdMap
): number | null {
  let sum = 0;
  for (const t of team) {
    const g = idMap.toCanonical.get(t.hero_id);
    const cfg = g ? heroesConfig.find((h) => h.hero_id === g) : undefined;
    if (!cfg || !isFiniteNum(Number(cfg.cost))) return null;
    sum += Number(cfg.cost);
  }
  return sum;
}

/**
 * 只改隊伍：JS 版的槽位（0 起）依順序換成後端的格式（hero_id 對照、slot 從 1 起），其他欄位原樣保留。
 * 檢查：1～MAX_TEAM_SIZE 位、不重複、都對照得到、總 cost 不超過存檔的 capacity
 */
export function patchTeam(
  canonical: CanonicalProfile,
  team: readonly TeamSlot[],
  heroesConfig: readonly SharedHeroConfig[],
  idMap: HeroIdMap
): PatchResult {
  if (team.length === 0) return { ok: false, error: "至少要有一位武將出征" };
  if (team.length > MAX_TEAM_SIZE)
    return { ok: false, error: `最多 ${MAX_TEAM_SIZE} 位武將出征` };
  if (new Set(team.map((t) => t.hero_id)).size !== team.length)
    return { ok: false, error: "同一位武將不能重複出征" };
  const ordered = team.slice().sort((a, b) => a.slot - b.slot);
  const converted: { hero_id: string; slot: number }[] = [];
  for (const [i, t] of ordered.entries()) {
    const g = idMap.toCanonical.get(t.hero_id);
    if (!g) return { ok: false, error: "隊伍裡有這裡還不支援的武將" };
    converted.push({ hero_id: g, slot: i + 1 });
  }
  const cost = teamCost(ordered, heroesConfig, idMap);
  if (cost === null)
    return { ok: false, error: "武將設定還沒有讀到，暫時不能保存隊伍" };
  const capacity = canonical.capacity;
  if (!isFiniteNum(capacity))
    return { ok: false, error: "存檔的容量格式不對，不能保存隊伍" };
  if (cost > capacity)
    return { ok: false, error: `隊伍 Cost ${cost} 超過容量 ${capacity}` };
  return { ok: true, data: { ...canonical, team: converted } };
}

/** 升級這位武將需要的點數（只給畫面看；實際由伺服器計算與扣除）：設定的 upgrade_cost_base（沒有時 100）× 目前等級 */
export function upgradeCostOf(
  canonical: CanonicalProfile,
  canonicalHeroId: string,
  heroesConfig: readonly SharedHeroConfig[]
): number | null {
  const cfg = heroesConfig.find((h) => h.hero_id === canonicalHeroId);
  if (!cfg) return null;
  const heroes = Array.isArray(canonical.heroes) ? canonical.heroes : [];
  const owned = heroes.filter(
    (h) => isObj(h) && h.hero_id === canonicalHeroId
  ) as Record<string, unknown>[];
  // 同一位武將有兩筆以上的紀錄：不知道伺服器會用哪一筆，不給預覽
  if (owned.length > 1) return null;
  const own = owned[0];
  const level =
    isFiniteNum(own?.level) && (own?.level as number) > 0
      ? (own?.level as number)
      : 1;
  const base = cfgNum(cfg.upgrade_cost_base) || 100;
  return base * level;
}

/** 升級一級的屬性成長（只給畫面看；和後端 upgrade_hero 相同：設定的成長值，不是數字時 0） */
export function upgradeGrowthOf(
  canonicalHeroId: string,
  heroesConfig: readonly SharedHeroConfig[]
): { atk: number; def: number; hp: number } | null {
  const cfg = heroesConfig.find((h) => h.hero_id === canonicalHeroId);
  if (!cfg) return null;
  return {
    atk: cfgNum(cfg.atk_growth),
    def: cfgNum(cfg.def_growth),
    hp: cfgNum(cfg.hp_growth),
  };
}
