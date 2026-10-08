/**
 * useJsPlayerStore.ts
 * 神馬三國 JS 純渲染版的玩家帳號、資產、隊伍與存檔 Zustand Store
 *
 * 兩種模式：
 * - 共用帳號（shared）：和 Godot 版共用同一個 shenma_player_key 與同一份雲端存檔。讀寫一律用 Godot 版的 api/gameApi.ts，
 *   保存格式就是後端／Godot 的存檔（canonical，原樣保留），畫面用 utils/sharedProfile 的顯示投影（不寫回）。
 *   - 金鑰只有在明確登入、建立成功時寫入，登出時清掉；載入、保存、匯入都不改它，也不讀舊的 shenma_js_player_key 或舊的 JS 本機快取
 *   - 後端找不到存檔時不自動建立：要使用者再按一次「建立新存檔」才 create_profile；其他錯誤一律不建檔
 *   - 暱稱與隊伍：只改 canonical 的這兩個欄位、帶 base_rev 整份保存；升級：upgrade_hero（伺服器計費）後唯讀讀回完整存檔
 *   - 版本衝突（409）改用雲端回應的資料，不重送；結果不明（網路）不重送，標記待確認，手動同步（唯讀讀回）前不開下一個寫入
 *   - 換帳號、登出時換新世代，舊帳號遲到的回應不套用
 *   - 戰鬥結算：兩版的結算規則對齊前，結果不寫入共用進度（沒有獎勵、不解鎖），結算視窗另外說明
 *   - 匯入覆蓋停用（可以匯出 canonical 備份）
 * - 訪客（guest）：只存在這個瀏覽器自己的 guest 存檔，不連雲端、不碰共用金鑰；規則照 JS 版原本的本機規則
 */

import { create } from "zustand";
import {
  PlayerState,
  PlayerHeroState,
  TeamSlot,
  SyncStatusType,
  BattleRewardResult,
} from "../types/player";
import { BUILTIN_HEROES_CONFIG } from "../engine/builtinData";
import { StageDataManager } from "../engine/StageDataManager";
import {
  getNextStage,
  stageToNum,
  getStageDataProblem,
} from "../utils/stagePlayability";
import { gameApi, GasError } from "../../shenmaSanguo/api/gameApi";
import {
  CanonicalProfile,
  HeroIdMap,
  SharedHeroConfig,
  buildHeroIdMap,
  patchNickname,
  patchTeam,
  projectSharedProfile,
  upgradeCostOf,
  upgradeGrowthOf,
} from "../utils/sharedProfile";
import {
  classifyWriteError,
  createEpoch,
  revOf,
} from "../utils/sharedProfileSync";

/** 共用帳號的金鑰（和 Godot 版相同） */
export const COMPAT_PLAYER_KEY = "shenma_player_key";
/** 舊版 JS 專用的金鑰：不再用來決定帳號，只在登出時清掉 */
export const LOCAL_PLAYER_KEY = "shenma_js_player_key";
/** 舊版 JS 的本機快取前綴：共用帳號不讀也不寫，登出時清掉 session 的部分 */
export const SESSION_SAVE_PREFIX = "shenma_js_session_state_";
export const LOCAL_SAVE_PREFIX = "shenma_js_local_state_";
/** 訪客模式自己的存檔與「目前是訪客」的標記（只在這個瀏覽器、不連雲端） */
export const GUEST_STATE_KEY = "shenma_js_guest_state";
export const GUEST_ACTIVE_KEY = "shenma_js_guest_active";

export type AccountMode = "none" | "shared" | "guest";

// 建立訪客的初始資料（只用於訪客模式；共用帳號不使用、不寫入雲端）
export function createDefaultPlayerProfile(
  key: string,
  nickname = "主公"
): PlayerState {
  const heroes: PlayerHeroState[] = BUILTIN_HEROES_CONFIG.map((cfg) => {
    return {
      hero_id: cfg.hero_id,
      level: 1,
      star: 1,
      atk: 100 + (cfg.atk_growth ?? 15),
      def: 50 + (cfg.def_growth ?? 8),
      hp: 1000 + (cfg.hp_growth ?? 100),
    };
  });

  const defaultTeam: TeamSlot[] = [
    { slot: 0, hero_id: "hero_ma_chao" },
    { slot: 1, hero_id: "hero_zhao_yun" },
    { slot: 2, hero_id: "hero_guan_yu" },
    { slot: 3, hero_id: "hero_zhang_fei" },
    { slot: 4, hero_id: "hero_huang_zhong" },
  ];

  return {
    key,
    nickname,
    level: 1,
    exp: 0,
    gold: 1500, // 訪客初始 1500 金幣，方便體驗武將升級（只在本機）
    capacity: 65,
    max_stage: "chapter1_1",
    cleared_stages: {},
    heroes,
    team: defaultTeam,
    serverRev: 1,
    updatedAt: Date.now(),
  };
}

type Result = { success: boolean; error?: string };

interface JsPlayerStoreState {
  /** 畫面用的玩家資料（共用帳號時是顯示投影，不能拿去保存） */
  player: PlayerState | null;
  isLoading: boolean;
  syncStatus: SyncStatusType;
  error: string | null;
  hasCheckedStorage: boolean;

  mode: AccountMode;
  /** 共用帳號：雲端存檔原樣（保存的唯一依據） */
  canonical: CanonicalProfile | null;
  /** 共用帳號：雲端存檔的版本（寫入時當 base_rev） */
  rev: number | null;
  /** 存檔格式不對，只能看 */
  readOnly: boolean;
  /** 雲端的隊伍這裡能完整表示（否則原樣保留，暫停修改與出征） */
  teamEditable: boolean;
  /** 給畫面的說明（衝突、結果不明、不支援的資料等） */
  notice: string | null;
  /** 正在寫入（暱稱、隊伍、升級、建立） */
  busy: boolean;
  /** 上一個寫入結果不明：手動同步（唯讀讀回）前不開下一個寫入 */
  writeBlocked: boolean;
  /** 後端找不到這把金鑰的存檔，等使用者明確建立 */
  pendingCreateKey: string | null;
  /** 後端的武將設定（共用帳號的武將與隊伍 cost 依它） */
  heroesConfig: SharedHeroConfig[];
  /** 存檔裡這裡對照不到或重複的武將（原樣保留、不可編輯） */
  lockedHeroIds: string[];

  // 帳號與登入
  init: () => Promise<void>;
  loginWithKey: (
    key: string
  ) => Promise<{ success: boolean; error?: string; needsCreate?: boolean }>;
  createProfile: (key: string, nickname: string) => Promise<Result>;
  startGuestMode: () => Promise<void>;
  logout: () => void;
  updateNickname: (nickname: string) => Promise<Result>;

  // 隊伍與武將養成
  updateTeam: (team: TeamSlot[]) => Promise<Result>;
  /** 舊介面（同步）：訪客在本機升級；共用帳號要等伺服器，請用 requestHeroUpgrade */
  upgradeHero: (heroId: string) => {
    success: boolean;
    error?: string;
    cost?: number;
  };
  /** 共用帳號：伺服器升級（upgrade_hero）並讀回；訪客：本機升級 */
  requestHeroUpgrade: (
    heroId: string
  ) => Promise<{ success: boolean; error?: string; cost?: number }>;
  /** 升級預覽（只給畫面看）：共用帳號照後端武將設定與伺服器的費用公式；訪客照本機規則；不支援的武將回 null */
  upgradePreview: (
    heroId: string
  ) => { cost: number | null; atk: number; def: number; hp: number } | null;
  /** 共用帳號：這位武將在後端設定的 cost（隊伍容量用）；訪客或查不到時回 null */
  heroCostOf: (heroId: string) => number | null;

  // 戰鬥結算與進度推進
  settleBattle: (
    stageId: string,
    baseHp: number,
    maxHp: number
  ) => BattleRewardResult;

  // 雲端同步與備份
  /** 共用帳號：唯讀讀回雲端存檔（確認結果不明的寫入、取得最新版本）；不寫入 */
  forceSync: () => Promise<Result>;
  exportBackup: () => string;
  importBackup: (jsonStr: string) => Result;
}

const epoch = createEpoch();
let idMap: HeroIdMap = buildHeroIdMap([], []);
/** 目前「正在保存」是哪個世代開始的寫入（0＝沒有）：切換帳號後舊寫入的回應不會解除新帳號的狀態 */
let busyOwner = 0;

const ls = {
  get(k: string): string | null {
    try {
      return typeof window === "undefined" ? null : localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      if (typeof window !== "undefined") localStorage.setItem(k, v);
    } catch {
      /* 儲存空間不能用時只影響訪客存檔 */
    }
  },
  del(k: string) {
    try {
      if (typeof window !== "undefined") localStorage.removeItem(k);
    } catch {
      /* 同上 */
    }
  },
};

function loadGuest(): PlayerState | null {
  const raw = ls.get(GUEST_STATE_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PlayerState;
    return p && typeof p.key === "string" && Array.isArray(p.heroes) ? p : null;
  } catch {
    return null;
  }
}
const saveGuest = (p: PlayerState) =>
  ls.set(GUEST_STATE_KEY, JSON.stringify(p));

const ERROR_TEXT: Record<string, string> = {
  GOLD_NOT_ENOUGH: "點數不足",
  PROFILE_NOT_FOUND: "雲端找不到這份存檔",
  DATA_CORRUPT: "雲端存檔損毀",
  INVALID_DATA: "存檔格式不符合後端規則",
  DATA_TOO_LARGE: "存檔太大",
  BAD_BASE_REV: "版本號格式不對",
  BASE_REV_REQUIRED: "後端要求版本號",
  HERO_CONFIG_NOT_FOUND: "後端找不到這位武將的設定",
  KEY_ALREADY_EXISTS: "這把金鑰已經有存檔",
  BUSY: "伺服器忙碌中",
};
const errorText = (code: string) => ERROR_TEXT[code] ?? code;

export const useJsPlayerStore = create<JsPlayerStoreState>((set, get) => {
  /** 後端武將設定（共用帳號第一次需要時讀取；讀不到時對照表是空的，武將與隊伍不可編輯） */
  async function ensureHeroesConfig(token: number): Promise<boolean> {
    if (get().heroesConfig.length > 0) return true;
    try {
      const res = await gameApi.getHeroesConfig({
        active: () => epoch.isCurrent(token),
      });
      const heroes = Array.isArray(res.heroes)
        ? (res.heroes as unknown[]).filter(
            (h): h is SharedHeroConfig =>
              !!h &&
              typeof h === "object" &&
              typeof (h as { hero_id?: unknown }).hero_id === "string"
          )
        : [];
      if (!epoch.isCurrent(token) || heroes.length === 0) return false;
      idMap = buildHeroIdMap(
        heroes.map((h) => h.hero_id),
        BUILTIN_HEROES_CONFIG.map((c) => c.hero_id)
      );
      set({ heroesConfig: heroes });
      return true;
    } catch {
      return false;
    }
  }

  /** 套用雲端的存檔（原樣）與版本到畫面 */
  function applyProfile(
    key: string,
    data: unknown,
    rev: number | null,
    configOk: boolean
  ) {
    const proj = projectSharedProfile(
      key,
      data,
      rev,
      get().heroesConfig,
      idMap
    );
    const readOnly = proj.readOnly || !configOk || rev === null;
    const notices: string[] = [];
    if (proj.readOnly)
      notices.push("雲端存檔的格式這裡無法安全處理：可以查看，但不會寫入。");
    if (!configOk)
      notices.push("武將設定讀不到：暫時只能查看，請稍後手動同步。");
    if (rev === null)
      notices.push("雲端存檔的版本不明：暫時不能保存，請稍後手動同步。");
    if (proj.teamNote) notices.push(proj.teamNote);
    if (proj.lockedHeroIds.length > 0) {
      notices.push(
        `存檔另有 ${proj.lockedHeroIds.length} 位武將這裡不能顯示（這裡還不支援，或同一位有重複的紀錄）：原樣保留，不能在這裡升級或出征。`
      );
    }
    set({
      mode: "shared",
      player: proj.display,
      canonical:
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as CanonicalProfile)
          : null,
      rev,
      readOnly,
      teamEditable: proj.teamEditable && !readOnly,
      lockedHeroIds: proj.lockedHeroIds,
      notice: notices.length ? notices.join(" ") : null,
      syncStatus: readOnly ? "readonly" : "idle",
      writeBlocked: false,
      pendingCreateKey: null,
      isLoading: false,
      hasCheckedStorage: true,
      error: null,
    });
  }

  type LoadResult =
    /** 讀到並套用到畫面；rev 不是合法版本時是 null（畫面已改成唯讀） */
    | { kind: "ok"; rev: number | null }
    /** 讀到的版本比畫面上的舊（同一個帳號較早的讀取）：不套用，畫面已是較新的版本 */
    | { kind: "older" }
    | { kind: "missing" }
    | { kind: "error"; message: string }
    /** 讀取期間換了世代（切換帳號、登出、重新載入）：不套用 */
    | { kind: "stale" };

  /** 讀回確認了雲端的資料與合法版本（寫入之後的確認用） */
  const confirmed = (r: LoadResult) =>
    (r.kind === "ok" && r.rev !== null) || r.kind === "older";

  /** 唯讀讀取共用存檔並套用（不寫入任何東西） */
  async function loadShared(
    key: string,
    token: number,
    foreground: boolean
  ): Promise<LoadResult> {
    const [cfgOk, prof] = await Promise.all([
      ensureHeroesConfig(token),
      gameApi
        .getProfile(key, { active: () => epoch.isCurrent(token), foreground })
        .then((body) => ({ ok: true as const, body }))
        .catch((e: unknown) => ({ ok: false as const, e })),
    ]);
    if (!epoch.isCurrent(token)) return { kind: "stale" };
    if (!prof.ok) {
      if (prof.e instanceof GasError && prof.e.message === "PROFILE_NOT_FOUND")
        return { kind: "missing" };
      const code = prof.e instanceof Error ? prof.e.message : "UNKNOWN";
      return {
        kind: "error",
        message: `讀取雲端存檔失敗（${errorText(code)}），沒有建立或修改任何資料。`,
      };
    }
    const incoming = revOf(prof.body.rev);
    const cur = get();
    // 同一個帳號較舊的讀取（版本比畫面上的舊，例如保存的回應先回來）不蓋掉較新的資料
    if (
      cur.mode === "shared" &&
      cur.player?.key === key &&
      cur.rev !== null &&
      incoming !== null &&
      incoming < cur.rev
    ) {
      return { kind: "older" };
    }
    applyProfile(key, prof.body.data, incoming, cfgOk);
    return { kind: "ok", rev: incoming };
  }

  /** 開始一個寫入（記下開始的世代） */
  function beginWrite(token: number) {
    busyOwner = token;
    set({ busy: true, syncStatus: "syncing", notice: null });
  }

  /** 寫入結束：只有開始這個寫入的世代才解除「正在保存」，並一起更新同步狀態與說明 */
  function endWrite(token: number, patch: Partial<JsPlayerStoreState> = {}) {
    if (busyOwner !== token) return;
    busyOwner = 0;
    set({ busy: false, ...patch });
  }

  /** 寫入的結果沒有確認：標記待確認，手動同步（唯讀讀回）前不開下一個寫入；不重送 */
  function unknownWrite(token: number, label: string, why: string): Result {
    endWrite(token, {
      syncStatus: "unknown",
      writeBlocked: true,
      notice: `${label}的結果待確認（${why}）：請按「手動同步」確認雲端的資料，確認前不會再寫入。`,
    });
    return {
      success: false,
      error: `${label}的結果待確認，請先手動同步確認`,
    };
  }

  /**
   * 寫入的回應回來時已換了世代（切換帳號、重新載入）：結果不套用。
   * 畫面還是同一個帳號時結果不明，要手動同步確認；已換成其他帳號時只結束「正在保存」
   */
  function staleWrite(key: string, token: number): Result {
    if (busyOwner === token) {
      busyOwner = 0;
      const s = get();
      if (s.mode === "shared" && s.player?.key === key) {
        set({
          busy: false,
          syncStatus: "unknown",
          writeBlocked: true,
          notice:
            "剛才的保存在重新讀取時中斷，結果不明：請按「手動同步」確認，確認前不會再寫入。",
        });
      } else {
        set({ busy: false });
      }
    }
    return { success: false, error: "帳號已切換，這次的結果不套用" };
  }

  function guardWrite(): string | null {
    const s = get();
    if (s.mode !== "shared" || !s.player || !s.canonical)
      return "尚未登入共用帳號";
    if (s.busy) return "正在保存，請稍候";
    if (s.writeBlocked)
      return "上一個保存的結果不明：請先按「手動同步」確認雲端的資料";
    if (s.readOnly) return "雲端存檔目前只能查看，不能寫入";
    if (revOf(s.rev) === null) return "雲端存檔的版本不明，暫時不能保存";
    return null;
  }

  /**
   * 寫入失敗的處理（每次 await 之後都重新核世代；換了世代就交給 staleWrite，不碰新帳號的狀態）：
   * - 衝突：回應附了雲端的資料與合法版本就改用；沒附就唯讀讀回，讀到才改用，讀不到標記待確認
   * - 確定沒寫入的拒絕：說明原因
   * - 其他（網路、平台錯誤、SERVER_ERROR 等）：結果不明，標記待確認
   */
  async function handleWriteFailure(
    e: unknown,
    key: string,
    token: number,
    label: string
  ): Promise<Result> {
    const f = classifyWriteError(e);
    if (!epoch.isCurrent(token)) return staleWrite(key, token);
    if (f.kind === "conflict") {
      const notice = `雲端已有較新的存檔（可能在另一個分頁或 Godot 版改過）：已改用雲端的資料，剛才的${label}沒有保存。`;
      const fail: Result = {
        success: false,
        error: `雲端已有較新的存檔，剛才的${label}沒有保存`,
      };
      if (
        f.serverRev !== null &&
        f.serverData &&
        typeof f.serverData === "object" &&
        !Array.isArray(f.serverData)
      ) {
        applyProfile(
          key,
          f.serverData,
          f.serverRev,
          get().heroesConfig.length > 0
        );
        endWrite(token, { syncStatus: "conflict", notice });
        return fail;
      }
      const r = await loadShared(key, token, false);
      if (r.kind === "stale" || !epoch.isCurrent(token))
        return staleWrite(key, token);
      if (confirmed(r)) {
        endWrite(token, { syncStatus: "conflict", notice });
        return fail;
      }
      endWrite(token, {
        syncStatus: "unknown",
        writeBlocked: true,
        notice: `雲端已有較新的存檔，剛才的${label}沒有保存；但讀回雲端的資料失敗：請按「手動同步」確認，確認前不會再寫入。`,
      });
      return fail;
    }
    if (f.kind === "rejected") {
      const detail =
        f.code === "GOLD_NOT_ENOUGH" && typeof f.response.required === "number"
          ? `點數不足：需要 ${f.response.required}，目前 ${String(f.response.current)}`
          : errorText(f.code);
      endWrite(token, {
        syncStatus: "error",
        notice: `${label}沒有保存：${detail}`,
      });
      return { success: false, error: detail };
    }
    return unknownWrite(
      token,
      label,
      `網路、伺服器錯誤或沒有回應：${errorText(f.reason)}`
    );
  }

  /** 帶 base_rev 整份保存 canonical 的副本（只改過明列的欄位） */
  async function writeProfile(
    data: CanonicalProfile,
    label: string
  ): Promise<Result> {
    const s = get();
    const key = s.player!.key;
    const rev = s.rev as number;
    const token = epoch.current();
    beginWrite(token);
    let res: Record<string, unknown>;
    try {
      res = await gameApi.saveProfile(key, data, rev);
    } catch (e) {
      return handleWriteFailure(e, key, token, label);
    }
    if (!epoch.isCurrent(token)) return staleWrite(key, token);
    const newRev = revOf(res.rev);
    if (newRev !== null) {
      applyProfile(key, data, newRev, get().heroesConfig.length > 0);
      endWrite(token);
      return { success: true };
    }
    // 保存的回應沒有合法的新版本：唯讀讀回確認；確認前不算保存成功、不開下一個寫入、不重送
    const r = await loadShared(key, token, false);
    if (r.kind === "stale" || !epoch.isCurrent(token))
      return staleWrite(key, token);
    if (confirmed(r)) {
      endWrite(token);
      return { success: true };
    }
    return unknownWrite(token, label, "保存的回應沒有版本，讀回也沒有確認");
  }

  // ── 訪客（只在本機） ──
  function guestUpdate(updated: PlayerState) {
    const p = { ...updated, updatedAt: Date.now() };
    saveGuest(p);
    set({ player: p, syncStatus: "offline" });
  }

  function guestUpgrade(heroId: string): {
    success: boolean;
    error?: string;
    cost?: number;
  } {
    const { player } = get();
    if (!player) return { success: false, error: "尚未登入" };
    const heroIndex = player.heroes.findIndex((h) => h.hero_id === heroId);
    if (heroIndex === -1) return { success: false, error: "查無此武將" };
    const hero = player.heroes[heroIndex];
    const cost = 100 * hero.level;
    if (player.gold < cost) {
      return {
        success: false,
        error: `金幣不足！升級需 ${cost} 金幣，當前僅有 ${player.gold}`,
      };
    }
    const cfg = BUILTIN_HEROES_CONFIG.find((c) => c.hero_id === heroId);
    const newHeroes = [...player.heroes];
    newHeroes[heroIndex] = {
      ...hero,
      level: hero.level + 1,
      atk: hero.atk + (cfg?.atk_growth ?? 15),
      def: hero.def + (cfg?.def_growth ?? 8),
      hp: hero.hp + (cfg?.hp_growth ?? 100),
    };
    guestUpdate({ ...player, gold: player.gold - cost, heroes: newHeroes });
    return { success: true, cost };
  }

  function guestSettle(
    stageId: string,
    baseHp: number,
    maxHp: number
  ): BattleRewardResult {
    const player = get().player as PlayerState;
    const hpRatio = baseHp / maxHp;
    let stars = 1;
    if (hpRatio >= 1.0) stars = 3;
    else if (hpRatio >= 0.5) stars = 2;
    const stageNum = stageToNum(stageId);
    const chapter = Math.floor(stageNum / 100) || 1;
    const stageIdx = stageNum % 100 || 1;
    const chapterMult = Math.max(1, (chapter - 1) * 10 + stageIdx);
    const expEarned = 100 * chapterMult;
    const goldEarned = 200 * chapterMult;
    let currentExp = player.exp + expEarned;
    let currentLevel = player.level;
    let currentCapacity = player.capacity;
    let leveledUp = false;
    const expNeeded = currentLevel * 250;
    if (currentExp >= expNeeded) {
      currentLevel += 1;
      currentExp -= expNeeded;
      currentCapacity += 5;
      leveledUp = true;
    }
    const currentStars = player.cleared_stages[stageId] ?? 0;
    const newClearedStages = {
      ...player.cleared_stages,
      [stageId]: Math.max(currentStars, stars),
    };
    let nextStageId = player.max_stage;
    let stageUnlocked: string | undefined = undefined;
    if (stageId === player.max_stage) {
      const nextCandidateId = getNextStage(stageId);
      const nextStageObj =
        StageDataManager.getInstance().getStageById(nextCandidateId);
      if (nextStageObj && !getStageDataProblem(nextStageObj)) {
        nextStageId = nextCandidateId;
        stageUnlocked = nextStageObj.name;
      }
    }
    guestUpdate({
      ...player,
      exp: currentExp,
      level: currentLevel,
      gold: player.gold + goldEarned,
      capacity: currentCapacity,
      max_stage: nextStageId,
      cleared_stages: newClearedStages,
    });
    return {
      stars,
      expEarned,
      goldEarned,
      leveledUp,
      newLevel: currentLevel,
      stageUnlocked,
    };
  }

  const clearedState = {
    player: null,
    mode: "none" as AccountMode,
    canonical: null,
    rev: null,
    readOnly: false,
    teamEditable: true,
    notice: null,
    busy: false,
    writeBlocked: false,
    lockedHeroIds: [],
  };

  return {
    ...clearedState,
    isLoading: false,
    syncStatus: "idle",
    error: null,
    hasCheckedStorage: false,
    pendingCreateKey: null,
    heroesConfig: [],

    // 初始化：訪客標記 → 訪客；否則有共用金鑰就唯讀讀取雲端存檔；都沒有就等使用者登入
    init: async () => {
      if (typeof window === "undefined") return;
      const token = epoch.next();
      busyOwner = 0;
      if (ls.get(GUEST_ACTIVE_KEY) === "1") {
        const guest = loadGuest();
        if (guest) {
          set({
            ...clearedState,
            mode: "guest",
            player: guest,
            syncStatus: "offline",
            hasCheckedStorage: true,
            isLoading: false,
          });
          return;
        }
      }
      const key = ls.get(COMPAT_PLAYER_KEY);
      if (!key) {
        set({ ...clearedState, isLoading: false, hasCheckedStorage: true });
        return;
      }
      set({ ...clearedState, isLoading: true, error: null });
      const r = await loadShared(key, token, true);
      if (r.kind === "missing") {
        set({
          ...clearedState,
          isLoading: false,
          hasCheckedStorage: true,
          pendingCreateKey: key,
          error: "雲端找不到這把金鑰的存檔。",
        });
      } else if (r.kind === "error") {
        set({
          ...clearedState,
          isLoading: false,
          hasCheckedStorage: true,
          error: r.message,
        });
      }
    },

    // 明確登入：讀到雲端存檔才記住金鑰；找不到時不建立，等使用者按「建立新存檔」
    loginWithKey: async (rawKey: string) => {
      const key = rawKey.trim();
      if (!key) return { success: false, error: "金鑰不能為空" };
      const token = epoch.next();
      set({ isLoading: true, error: null, syncStatus: "syncing" });
      const r = await loadShared(key, token, true);
      if (r.kind === "ok" || r.kind === "older") {
        ls.set(COMPAT_PLAYER_KEY, key);
        ls.del(GUEST_ACTIVE_KEY);
        // 已換成這個帳號：前一個帳號還沒回來的寫入不再讓這裡顯示「正在保存」
        busyOwner = 0;
        set({ busy: false, isLoading: false });
        return { success: true };
      }
      if (r.kind === "stale")
        return { success: false, error: "已改用其他帳號" };
      set({
        isLoading: false,
        syncStatus: get().mode === "shared" ? get().syncStatus : "idle",
      });
      if (r.kind === "missing") {
        const message =
          "雲端找不到這把金鑰的存檔：要用它建立新存檔，請再按「建立新存檔」。";
        // 金鑰視窗依 pendingCreateKey／error 重新開啟時，帶入這把金鑰與說明（不會因為重新開啟而失去「建立新存檔」）
        set({ pendingCreateKey: key, error: message });
        return { success: false, needsCreate: true, error: message };
      }
      return { success: false, error: r.message };
    },

    // 明確建立新存檔：成功後唯讀讀回；結果不明時只唯讀查一次，不自動再建立
    createProfile: async (rawKey: string, nickname: string) => {
      const key = rawKey.trim();
      if (!key) return { success: false, error: "金鑰不能為空" };
      const nick = nickname.trim() || "主公";
      const token = epoch.next();
      busyOwner = token;
      set({ busy: true, isLoading: true, error: null });
      let created = false;
      let outcome: Result | null = null;
      try {
        await gameApi.createProfile(key, nick);
        created = true;
      } catch (e) {
        const f = classifyWriteError(e);
        if (f.kind === "rejected" && f.code !== "KEY_ALREADY_EXISTS") {
          outcome = { success: false, error: `建立失敗：${errorText(f.code)}` };
        } else if (f.kind === "rejected") {
          outcome = null; // 已經有存檔：改為讀取它
        } else if (f.kind === "unknown") {
          outcome = null; // 結果不明：下面唯讀查一次
        }
      }
      if (!epoch.isCurrent(token)) {
        endWrite(token);
        return { success: false, error: "已改用其他帳號" };
      }
      if (outcome) {
        endWrite(token);
        set({ isLoading: false });
        return outcome;
      }
      const r = await loadShared(key, token, true);
      endWrite(token);
      if (epoch.isCurrent(token)) set({ isLoading: false });
      if (r.kind === "ok" || r.kind === "older") {
        ls.set(COMPAT_PLAYER_KEY, key);
        ls.del(GUEST_ACTIVE_KEY);
        return {
          success: true,
          error: created ? undefined : "這把金鑰已經有存檔，已改為讀取它",
        };
      }
      if (r.kind === "missing") {
        return {
          success: false,
          error:
            "建立的結果不明：雲端還沒有這份存檔，請稍後再試（不會自動重送）",
        };
      }
      if (r.kind === "stale")
        return { success: false, error: "已改用其他帳號" };
      return { success: false, error: r.message };
    },

    // 訪客：只用這個瀏覽器的 guest 存檔，不連雲端、不改共用金鑰
    startGuestMode: async () => {
      epoch.next();
      busyOwner = 0;
      const guest =
        loadGuest() ??
        createDefaultPlayerProfile(
          `guest_${Date.now().toString(36)}`,
          "遊俠主公"
        );
      saveGuest(guest);
      ls.set(GUEST_ACTIVE_KEY, "1");
      set({
        ...clearedState,
        mode: "guest",
        player: guest,
        syncStatus: "offline",
        isLoading: false,
        hasCheckedStorage: true,
        pendingCreateKey: null,
        error: null,
      });
    },

    // 登出：清掉共用金鑰、舊 JS 金鑰、訪客標記與舊 JS 的 session 快取；換新世代
    logout: () => {
      epoch.next();
      busyOwner = 0;
      ls.del(COMPAT_PLAYER_KEY);
      ls.del(LOCAL_PLAYER_KEY);
      ls.del(GUEST_ACTIVE_KEY);
      if (typeof window !== "undefined") {
        try {
          const sessionKeysToRemove: string[] = [];
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k && k.startsWith(SESSION_SAVE_PREFIX))
              sessionKeysToRemove.push(k);
          }
          sessionKeysToRemove.forEach((k) => sessionStorage.removeItem(k));
        } catch (err) {
          console.warn("[JsPlayerStore] 登出清除快取失敗", err);
        }
      }
      set({
        ...clearedState,
        syncStatus: "idle",
        error: null,
        pendingCreateKey: null,
        hasCheckedStorage: true,
      });
    },

    updateNickname: async (nickname: string) => {
      const s = get();
      if (s.mode === "guest" && s.player) {
        guestUpdate({
          ...s.player,
          nickname: nickname.trim() || s.player.nickname,
        });
        return { success: true };
      }
      const blocked = guardWrite();
      if (blocked) {
        set({ notice: blocked });
        return { success: false, error: blocked };
      }
      const p = patchNickname(get().canonical as CanonicalProfile, nickname);
      if (!p.ok) return { success: false, error: p.error };
      return writeProfile(p.data, "暱稱");
    },

    updateTeam: async (team: TeamSlot[]) => {
      const s = get();
      if (s.mode === "guest" && s.player) {
        guestUpdate({ ...s.player, team });
        return { success: true };
      }
      const blocked = guardWrite();
      if (blocked) {
        set({ notice: blocked });
        return { success: false, error: blocked };
      }
      if (!s.teamEditable)
        return {
          success: false,
          error: "雲端的隊伍這裡還不支援，暫時不能修改",
        };
      const p = patchTeam(
        s.canonical as CanonicalProfile,
        team,
        s.heroesConfig,
        idMap
      );
      if (!p.ok) return { success: false, error: p.error };
      return writeProfile(p.data, "隊伍");
    },

    upgradeHero: (heroId: string) => {
      if (get().mode === "guest") return guestUpgrade(heroId);
      return {
        success: false,
        error: "共用帳號的升級要等伺服器回應，請用武將視窗的升級按鈕",
      };
    },

    requestHeroUpgrade: async (heroId: string) => {
      const s = get();
      if (s.mode === "guest") return guestUpgrade(heroId);
      const blocked = guardWrite();
      if (blocked) {
        set({ notice: blocked });
        return { success: false, error: blocked };
      }
      const g = idMap.toCanonical.get(heroId);
      if (!g || s.lockedHeroIds.includes(g))
        return { success: false, error: "這位武將這裡還不支援升級" };
      const key = s.player!.key;
      const token = epoch.current();
      beginWrite(token);
      let cost: number | undefined;
      try {
        const res = await gameApi.upgradeHero(key, g, s.rev);
        cost = typeof res.cost === "number" ? res.cost : undefined;
      } catch (e) {
        return handleWriteFailure(e, key, token, "武將升級");
      }
      if (!epoch.isCurrent(token)) return staleWrite(key, token);
      // 伺服器回了成功：唯讀讀回完整存檔（不在本機自己加屬性或扣點數）；讀回確認前不算完成、不開下一個寫入
      const r = await loadShared(key, token, false);
      if (r.kind === "stale" || !epoch.isCurrent(token))
        return staleWrite(key, token);
      if (!confirmed(r)) {
        return unknownWrite(
          token,
          "武將升級",
          "伺服器回了成功，但讀回雲端存檔失敗"
        );
      }
      endWrite(token);
      return { success: true, cost };
    },

    upgradePreview: (heroId: string) => {
      const s = get();
      const hero = s.player?.heroes.find((h) => h.hero_id === heroId);
      if (!hero) return null;
      if (s.mode === "guest") {
        const cfg = BUILTIN_HEROES_CONFIG.find((c) => c.hero_id === heroId);
        return {
          cost: 100 * hero.level,
          atk: cfg?.atk_growth ?? 15,
          def: cfg?.def_growth ?? 8,
          hp: cfg?.hp_growth ?? 100,
        };
      }
      const g = idMap.toCanonical.get(heroId);
      if (!g || !s.canonical || s.lockedHeroIds.includes(g)) return null;
      const growth = upgradeGrowthOf(g, s.heroesConfig);
      if (!growth) return null;
      return { cost: upgradeCostOf(s.canonical, g, s.heroesConfig), ...growth };
    },

    heroCostOf: (heroId: string) => {
      const s = get();
      if (s.mode !== "shared") return null;
      const g = idMap.toCanonical.get(heroId);
      const cfg = g ? s.heroesConfig.find((h) => h.hero_id === g) : undefined;
      const n = cfg ? Number(cfg.cost) : NaN;
      return Number.isFinite(n) ? n : null;
    },

    // 共用帳號：兩版的結算規則對齊前，結果不寫入共用進度；訪客照本機規則
    settleBattle: (
      stageId: string,
      baseHp: number,
      maxHp: number
    ): BattleRewardResult => {
      const s = get();
      if (!s.player)
        return {
          stars: 1,
          expEarned: 0,
          goldEarned: 0,
          leveledUp: false,
          newLevel: 1,
        };
      if (s.mode === "guest") return guestSettle(stageId, baseHp, maxHp);
      // 星數只是這場戰鬥的顯示（JS 版原本的算法）；沒有寫入、沒有獎勵、沒有解鎖
      const hpRatio = baseHp / maxHp;
      const stars = hpRatio >= 1.0 ? 3 : hpRatio >= 0.5 ? 2 : 1;
      return {
        stars,
        expEarned: 0,
        goldEarned: 0,
        leveledUp: false,
        newLevel: s.player.level,
        notSaved: true,
      };
    },

    forceSync: async () => {
      const s = get();
      if (s.mode === "guest") return { success: true };
      if (s.mode !== "shared" || !s.player)
        return { success: false, error: "未登入" };
      const key = s.player.key;
      const token = epoch.current();
      set({ syncStatus: "syncing", error: null });
      const r = await loadShared(key, token, true);
      if (r.kind === "ok") return { success: true };
      if (r.kind === "stale")
        return { success: false, error: "已改用其他帳號" };
      if (r.kind === "older") {
        // 讀到的版本比畫面舊（較早送出的讀取晚回來）：畫面不變；有待確認的寫入時仍要再同步
        if (!get().writeBlocked) {
          set({ syncStatus: s.readOnly ? "readonly" : "idle" });
          return { success: true };
        }
        set({ syncStatus: "unknown" });
        return {
          success: false,
          error: "讀到的雲端版本比畫面上的舊，請再按一次手動同步",
        };
      }
      const message = r.kind === "missing" ? "雲端找不到這份存檔" : r.message;
      set({
        syncStatus: s.writeBlocked ? "unknown" : "error",
        notice: message,
      });
      return { success: false, error: message };
    },

    // 匯出：共用帳號匯出雲端存檔原樣（canonical 與版本）；訪客匯出本機存檔
    exportBackup: () => {
      const s = get();
      if (s.mode === "shared" && s.player) {
        return JSON.stringify(
          { key: s.player.key, rev: s.rev, data: s.canonical },
          null,
          2
        );
      }
      return s.player ? JSON.stringify(s.player, null, 2) : "";
    },

    // 匯入覆蓋：共用帳號停用；訪客只寫本機
    importBackup: (jsonStr: string) => {
      if (get().mode === "shared") {
        return {
          success: false,
          error: "共用帳號不能用匯入覆蓋雲端存檔（可以匯出備份）",
        };
      }
      try {
        const parsed = JSON.parse(jsonStr) as PlayerState;
        if (!parsed.key || !parsed.nickname || !Array.isArray(parsed.heroes)) {
          return { success: false, error: "存檔格式不符合規格" };
        }
        guestUpdate(parsed);
        ls.set(GUEST_ACTIVE_KEY, "1");
        set({ mode: "guest" });
        return { success: true };
      } catch {
        return { success: false, error: "無法解析 JSON 存檔內容" };
      }
    },
  };
});
