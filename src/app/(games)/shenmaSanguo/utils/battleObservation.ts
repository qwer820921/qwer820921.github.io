/**
 * 戰況觀測（Godot 的 battle_observation，見遊戲的 Main.battle_observation）：兩個戰鬥入口共用的型別、驗證、採用規則與顯示文字。
 * - 只在 game_ready 的 capabilities 列出 battle_observation 時使用；舊版遊戲沒有列出時，武將面板保留選取時的快照與
 *   「重新點選可以更新」的說明，也不顯示即時的武將技能與敵軍查看（不猜遊戲有沒有這個功能）
 * - 只採用目前遊戲 iframe、目前這一場（battle_id）的觀測；同一場只採用比上一份新的（lifecycle 較大，或相同時 seq 較大）
 * - 欄位不合理（缺識別碼、NaN／無限大、負的剩下時間或生命、重複或格式不對的識別碼、敵人總數和列出的不同）時整份不採用
 * - 剩下的時間都是遊戲的戰鬥時間（暫停與備戰時不前進）：網頁不用牆鐘倒數，只顯示最新一份的數字
 * - 只是查看：不送任何命令給遊戲，不改目標、不改戰鬥狀態、不發 API、不寫存檔
 */
import { EnemyConfig, HeroConfig } from "../types";
import { heroSkillOf } from "./heroSkills";

/** game_ready 的 capabilities 裡代表戰況觀測的名稱 */
export const OBSERVATION_CAPABILITY = "battle_observation";

/** 遊戲有沒有宣告戰況觀測（game_ready 的 capabilities 是字串陣列而且列出它；沒有這個欄位的舊版遊戲是 false） */
export function hasObservationCapability(ready: unknown): boolean {
  if (!ready || typeof ready !== "object") return false;
  const caps = (ready as { capabilities?: unknown }).capabilities;
  return Array.isArray(caps) && caps.includes(OBSERVATION_CAPABILITY);
}

/** 武將技能此刻的狀態：id 之外的欄位依技能而定（見遊戲的 Main._hero_skill_observation） */
export interface ObsHeroSkill {
  id: string;
  used?: boolean;
  remaining?: number;
  cooldown?: number;
  active?: boolean;
  affected?: number;
  stacks?: number;
  max_stacks?: number;
  atk?: number;
  source?: boolean;
  kill_gold?: number;
  allies?: number;
  effective_mult?: number;
}

export interface ObsHero {
  /** 武將的識別碼（hero-流水號）：移位不換，撤除或陣亡後重新部署是新的 */
  uid: string;
  hero_id: string;
  cell: [number, number];
  hp: number;
  max_hp: number;
  /** 沒有啟用任何技能時是 null */
  skill: ObsHeroSkill | null;
}

export interface ObsEnemy {
  /** 「出兵世代-生成序號」：同一個遊戲 iframe 裡不會重複 */
  uid: string;
  seq: number;
  enemy_id: string;
  hp: number;
  max_hp: number;
  flying: boolean;
  /** 受控（魅惑）：仍然活著、照常計入波次，但不攻擊武將也不被當成目標 */
  charmed: boolean;
  charm_left: number;
  charm_source: string;
  /** 設定的對阻路武將攻擊力（沒有設定時 20）與此刻的有效值（含威壓）；不是漏城傷害 */
  atk: number;
  atk_eff: number;
  atk_down_left: number;
  /** 設定的移速（像素／秒）與此刻含減速的移速 */
  speed: number;
  speed_eff: number;
  slow_left: number;
  immune_slow: boolean;
  stun_left: number;
  burn_left: number;
}

export interface BattleObservation {
  battle_id: string;
  lifecycle: number;
  generation: number;
  seq: number;
  /** 0 等待關卡、1 備戰、2 戰鬥、3 結算 */
  state: number;
  paused: boolean;
  wave: number;
  heroes: ObsHero[];
  /** 依生成序號排序 */
  enemies: ObsEnemy[];
  /** 遊戲此刻計入波次的敵人數（和 enemies 的數量相同才採用） */
  enemy_total: number;
}

const MAX_HEROES = 64;
const MAX_ENEMIES = 5000;
const HERO_UID = /^hero-\d+$/;
const ENEMY_UID = /^\d+-\d+$/;

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isNonNeg = (v: unknown): v is number => isNum(v) && v >= 0;
const isInt = (v: unknown, min = 0): v is number =>
  isNum(v) && Number.isInteger(v) && v >= min && v <= Number.MAX_SAFE_INTEGER;
const isId = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 200;

/** 技能狀態：數字欄位有的話要合理（剩下時間、層數、人數不是負的；冷卻是正的） */
function parseSkill(raw: unknown): ObsHeroSkill | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const s = raw as Record<string, unknown>;
  // 沒有啟用技能時遊戲送空物件
  if (Object.keys(s).length === 0) return null;
  if (!isId(s.id)) return undefined;
  const out: ObsHeroSkill = { id: s.id };
  for (const k of ["used", "active", "source"] as const) {
    if (s[k] === undefined) continue;
    if (typeof s[k] !== "boolean") return undefined;
    out[k] = s[k] as boolean;
  }
  for (const k of ["remaining", "atk", "effective_mult"] as const) {
    if (s[k] === undefined) continue;
    if (!isNonNeg(s[k])) return undefined;
    out[k] = s[k] as number;
  }
  if (s.cooldown !== undefined) {
    if (!isNum(s.cooldown) || s.cooldown <= 0) return undefined;
    out.cooldown = s.cooldown;
  }
  for (const k of [
    "affected",
    "stacks",
    "max_stacks",
    "kill_gold",
    "allies",
  ] as const) {
    if (s[k] === undefined) continue;
    if (!isInt(s[k])) return undefined;
    out[k] = s[k] as number;
  }
  if (
    out.stacks !== undefined &&
    out.max_stacks !== undefined &&
    out.stacks > out.max_stacks
  )
    return undefined;
  return out;
}

function parseHero(raw: unknown): ObsHero | null {
  if (!raw || typeof raw !== "object") return null;
  const h = raw as Record<string, unknown>;
  if (typeof h.uid !== "string" || !HERO_UID.test(h.uid)) return null;
  if (!isId(h.hero_id)) return null;
  if (
    !Array.isArray(h.cell) ||
    h.cell.length !== 2 ||
    !h.cell.every((c) => isInt(c, -1000))
  )
    return null;
  if (!isNonNeg(h.hp) || !isNum(h.max_hp) || h.max_hp <= 0) return null;
  const skill = parseSkill(h.skill);
  if (skill === undefined) return null;
  return {
    uid: h.uid,
    hero_id: h.hero_id,
    cell: [h.cell[0] as number, h.cell[1] as number],
    hp: h.hp,
    max_hp: h.max_hp,
    skill,
  };
}

function parseEnemy(raw: unknown, generation: number): ObsEnemy | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (!isInt(e.seq)) return null;
  // 識別碼要和這一份的出兵世代與生成序號一致（不接受指到別的世代的敵人）
  if (
    typeof e.uid !== "string" ||
    !ENEMY_UID.test(e.uid) ||
    e.uid !== `${generation}-${e.seq}`
  )
    return null;
  if (!isId(e.enemy_id)) return null;
  if (!isNonNeg(e.hp) || !isNum(e.max_hp) || e.max_hp <= 0) return null;
  for (const k of ["flying", "charmed", "immune_slow"]) {
    if (typeof e[k] !== "boolean") return null;
  }
  for (const k of [
    "charm_left",
    "atk",
    "atk_eff",
    "atk_down_left",
    "speed",
    "speed_eff",
    "slow_left",
    "stun_left",
    "burn_left",
  ]) {
    if (!isNonNeg(e[k])) return null;
  }
  if (typeof e.charm_source !== "string") return null;
  // 受控的才有來源與剩下時間
  if (!e.charmed && ((e.charm_left as number) > 0 || e.charm_source !== ""))
    return null;
  return {
    uid: e.uid,
    seq: e.seq,
    enemy_id: e.enemy_id,
    hp: e.hp,
    max_hp: e.max_hp,
    flying: e.flying as boolean,
    charmed: e.charmed as boolean,
    charm_left: e.charm_left as number,
    charm_source: e.charm_source,
    atk: e.atk as number,
    atk_eff: e.atk_eff as number,
    atk_down_left: e.atk_down_left as number,
    speed: e.speed as number,
    speed_eff: e.speed_eff as number,
    slow_left: e.slow_left as number,
    immune_slow: e.immune_slow as boolean,
    stun_left: e.stun_left as number,
    burn_left: e.burn_left as number,
  };
}

/** 驗證一份觀測（遊戲送來的原始訊息）；任何一項不合理就整份不採用（回傳 null） */
export function parseBattleObservation(raw: unknown): BattleObservation | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (d.type !== "battle_observation") return null;
  if (!isId(d.battle_id)) return null;
  if (!isInt(d.lifecycle) || !isInt(d.generation) || !isInt(d.seq, 1))
    return null;
  if (!isInt(d.state) || d.state > 3) return null;
  if (typeof d.paused !== "boolean" || !isInt(d.wave)) return null;
  if (!Array.isArray(d.heroes) || d.heroes.length > MAX_HEROES) return null;
  if (!Array.isArray(d.enemies) || d.enemies.length > MAX_ENEMIES) return null;
  if (!isInt(d.enemy_total) || d.enemy_total !== d.enemies.length) return null;
  const heroes: ObsHero[] = [];
  const heroUids = new Set<string>();
  const heroIds = new Set<string>();
  for (const raw of d.heroes) {
    const h = parseHero(raw);
    if (!h || heroUids.has(h.uid) || heroIds.has(h.hero_id)) return null;
    heroUids.add(h.uid);
    heroIds.add(h.hero_id);
    heroes.push(h);
  }
  const enemies: ObsEnemy[] = [];
  const enemyUids = new Set<string>();
  let lastSeq = -1;
  for (const raw of d.enemies) {
    const e = parseEnemy(raw, d.generation);
    if (!e || enemyUids.has(e.uid) || e.seq <= lastSeq) return null;
    enemyUids.add(e.uid);
    lastSeq = e.seq;
    enemies.push(e);
  }
  return {
    battle_id: d.battle_id,
    lifecycle: d.lifecycle,
    generation: d.generation,
    seq: d.seq,
    state: d.state,
    paused: d.paused,
    wave: d.wave,
    heroes,
    enemies,
    enemy_total: d.enemy_total,
  };
}

/**
 * 要不要採用這一份：只採用目前這一場（battle_id 相同；還沒有這一場時都不採用）。
 * 同一場只採用比目前顯示的新的：lifecycle 較大，或 lifecycle 相同、出兵世代相同而且 seq 較大
 */
export function isNewerObservation(
  current: BattleObservation | null,
  next: BattleObservation,
  battleId: string | null
): boolean {
  if (!battleId || next.battle_id !== battleId) return false;
  if (!current || current.battle_id !== next.battle_id) return true;
  if (next.lifecycle !== current.lifecycle)
    return next.lifecycle > current.lifecycle;
  return next.generation === current.generation && next.seq > current.seq;
}

/**
 * 一個戰鬥入口的觀測狀態（放在 ref 裡，訊息處理不受 React 的狀態時序影響）：
 * capable 是目前這個 iframe 的 game_ready 有沒有宣告；換 iframe、換一場時 reset，之後只有新的一份才會顯示
 */
export class ObservationTracker {
  capable = false;
  private last: BattleObservation | null = null;

  /** 收到 game_ready（新的 iframe 或遊戲重新就緒）：記下能力，舊的觀測不再顯示 */
  onReady(ready: unknown): void {
    this.capable = hasObservationCapability(ready);
    this.last = null;
  }

  /** 換一場、離開這一場或換 iframe：清掉，之後要收到新的一份才顯示 */
  reset(capable?: boolean): void {
    if (capable !== undefined) this.capable = capable;
    this.last = null;
  }

  /** 收到一份觀測：沒有宣告能力、不合理、不是這一場或不比目前新時回傳 null（不改目前的） */
  accept(raw: unknown, battleId: string | null): BattleObservation | null {
    if (!this.capable) return null;
    const next = parseBattleObservation(raw);
    if (!next || !isNewerObservation(this.last, next, battleId)) return null;
    this.last = next;
    return next;
  }
}

/** 武將面板對應的即時資料：同一場（面板的 battle_id）、同一位武將（hero_uid）才有；其他（防禦塔、舊版遊戲的面板）是 null */
export function liveHeroFor(
  panel: { unit_type?: string; hero_uid?: unknown; battle_id?: unknown } | null,
  obs: BattleObservation | null
): ObsHero | null {
  if (!panel || !obs || panel.unit_type !== "hero") return null;
  if (typeof panel.hero_uid !== "string" || panel.hero_uid === "") return null;
  if (panel.battle_id !== obs.battle_id) return null;
  return obs.heroes.find((h) => h.uid === panel.hero_uid) ?? null;
}

/**
 * 面板的訊息要不要採用：帶 battle_id 的面板只採用目前這一場的（換關後晚到的舊面板不顯示）；
 * 舊版遊戲的武將面板沒有 battle_id，照舊採用
 */
export function isCurrentPanel(
  data: { battle_id?: unknown },
  battleId: string | null
): boolean {
  if (data.battle_id === undefined) return true;
  return typeof data.battle_id === "string" && data.battle_id === battleId;
}

// ── 顯示文字 ──────────────────────────────────────────────────

/** 技能 id 的名稱（隊伍裡的武將以 heroSkills 的名稱為準；找不到時用這裡的一般名稱） */
const SKILL_NAMES: Record<string, string> = {
  first_strike: "衝鋒",
  long_range: "百步穿楊",
  burn: "火攻",
  slow_aura: "減速光環",
  dodge: "閃避",
  def_aura: "防禦光環",
  stun: "暈眩",
  lifesteal: "吸血",
  atk_speed_aura: "指揮",
  counter: "反擊",
  tenacity: "堅韌",
  atk_down_aura: "威壓",
  double_shot: "連射",
  chain: "連環計",
  storm: "呼風喚雨",
  berserk: "戰神",
  supply: "補給",
  knockback: "怪力",
  guard_share: "護衛",
  base_guard: "守護",
  assassinate: "奇襲",
  charm: "魅惑",
};

export function skillName(heroId: string, skill: ObsHeroSkill): string {
  const known = heroSkillOf(heroId);
  if (known && known.id === skill.id) return known.name;
  return SKILL_NAMES[skill.id] ?? skill.id;
}

/** 秒數：一位小數（0.04 以下顯示 0） */
export const secText = (s: number) => String(Number(s.toFixed(1)));

/** 命中時觸發、常駐的技能：沒有冷卻，也沒有要即時顯示的狀態 */
const PASSIVE_TEXT: Record<string, string> = {
  long_range: "常駐：射程加長",
  burn: "命中時觸發（沒有冷卻）",
  dodge: "受到攻擊時判定（沒有冷卻）",
  stun: "命中時觸發（沒有冷卻）",
  lifesteal: "命中時觸發（沒有冷卻）",
  counter: "受到攻擊時觸發（沒有冷卻）",
  double_shot: "普通攻擊時判定（沒有冷卻）",
  chain: "命中時觸發（沒有冷卻）",
  storm: "命中時觸發（沒有冷卻）",
};

/** 技能此刻的狀態文字（遊戲送來的最新一份；不是選取時的快照） */
export function skillStateText(skill: ObsHeroSkill): string {
  const pass = PASSIVE_TEXT[skill.id];
  if (pass) return pass;
  switch (skill.id) {
    case "first_strike":
      return skill.used
        ? "這一場已經用過"
        : "這一場還沒用過（下一次有效的普通攻擊加倍）";
    case "assassinate":
      return skill.used
        ? "這一場已經用過（剩 0 次）"
        : "這一場還沒用過（剩 1 次）";
    case "knockback":
    case "charm":
      return (skill.remaining ?? 0) > 0
        ? `冷卻中，還剩 ${secText(skill.remaining ?? 0)} 秒`
        : skill.id === "charm"
          ? "可以控制"
          : "可以推動";
    case "berserk":
      return `${skill.stacks ?? 0}／${skill.max_stacks ?? 0} 層，攻擊力 ${String(Number((skill.atk ?? 0).toFixed(2)))}`;
    case "tenacity":
      return skill.active
        ? "生效中（生命不高於門檻）"
        : "未生效（生命高於門檻）";
    case "slow_aura":
    case "atk_down_aura":
      return skill.active
        ? `生效中，影響 ${skill.affected ?? 0} 個敵人`
        : "沒有作用（只在戰鬥中、範圍內有敵人時作用）";
    case "def_aura":
    case "atk_speed_aura":
      return skill.active
        ? `生效中，加成 ${skill.affected ?? 0} 名友軍`
        : "沒有作用（只在戰鬥中作用）";
    case "supply":
      return !skill.active
        ? "沒有提供"
        : skill.source
          ? `生效中，這一場每次擊殺戰鬥金幣 ${skill.kill_gold ?? 0}`
          : `可以提供（另有倍率更高的來源，每次擊殺 ${skill.kill_gold ?? 0}）`;
    case "guard_share":
      return skill.active
        ? `可以提供，範圍內 ${skill.allies ?? 0} 名友軍`
        : "沒有提供";
    case "base_guard":
      return !skill.active
        ? "沒有提供"
        : skill.source
          ? `生效中，漏城傷害每隻 ×${String(Number((skill.effective_mult ?? 1).toFixed(2)))}`
          : "可以提供（另有更強的來源）";
    default:
      return "狀態不明";
  }
}

// ── 敵軍 ──────────────────────────────────────────────────────

/** 每頁列出幾隻（網頁的提案；總數一律照遊戲的 enemy_total） */
export const ENEMY_PAGE_SIZE = 20;

export interface EnemyPage {
  page: number;
  pages: number;
  from: number;
  to: number;
  rows: ObsEnemy[];
}

/** 第 page 頁（從 0 起算；超出範圍時拉回最後一頁）；沒有敵人時是第 0 頁、0 列 */
export function enemyPage(
  list: ObsEnemy[],
  page: number,
  size = ENEMY_PAGE_SIZE
): EnemyPage {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  const rows = list.slice(p * size, p * size + size);
  return {
    page: p,
    pages,
    from: rows.length ? p * size + 1 : 0,
    to: p * size + rows.length,
    rows,
  };
}

/** 敵人的中文名稱：這一場送進遊戲的設定裡的名稱；設定裡沒有時是一般名稱（附 enemy_id） */
export function enemyName(
  enemyId: string,
  config: EnemyConfig[] | null | undefined
): string {
  const c = (config ?? []).find((x) => x.enemy_id === enemyId);
  const name = c && typeof c.name === "string" ? c.name.trim() : "";
  return name || `未知敵軍（${enemyId}）`;
}

/** 設定裡的護甲（只有正的有限數字才有；目前版本不會減少受到的傷害，只在說明裡標示） */
export function configArmor(
  enemyId: string,
  config: EnemyConfig[] | null | undefined
): number | null {
  const c = (config ?? []).find((x) => x.enemy_id === enemyId);
  const a = c ? Number(c.armor) : NaN;
  return Number.isFinite(a) && a > 0 ? a : null;
}

/** 武將名稱（受控來源用）：設定裡的名稱，沒有時用 hero_id */
export function heroNameOf(
  heroId: string,
  heroes: HeroConfig[] | null | undefined
): string {
  const h = (heroes ?? []).find((x) => x.hero_id === heroId);
  return (h && typeof h.name === "string" && h.name) || heroId;
}

/** 百分比（四捨五入到整數） */
export const pct = (ratio: number) => Math.round(ratio * 100);
