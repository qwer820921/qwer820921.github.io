import { create } from "zustand";
import {
  SessionPlayerState,
  SyncStatus,
  TeamSlot,
  HeroConfig,
  BattleResultPayload,
  BattleResult,
} from "../types";
import { gameApi } from "../api/gameApi";
import { stageToNum, getNextStage } from "../utils/stageUtils";

// ── 常數 ──────────────────────────────────────────────────────
const PLAYER_SESSION_KEY = "shenma_player_state";
const DEBOUNCE_MS = 30_000;
const GAS_URL = process.env.NEXT_PUBLIC_SHENMA_SANGUO_GAS_URL!;

// Module-level debounce timer（跨 render 持久）
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

// ── sessionStorage helpers ─────────────────────────────────────
function readSession(): SessionPlayerState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PLAYER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionPlayerState;
    // 頁面關閉時若正在 Syncing，下次載入重設為 Idle
    if (parsed.syncStatus === SyncStatus.Syncing) {
      parsed.syncStatus = SyncStatus.Idle;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(state: SessionPlayerState) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PLAYER_SESSION_KEY, JSON.stringify(state));
}

function clearDebounce() {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
}

// ── Store 型別 ─────────────────────────────────────────────────
interface PlayerStore {
  player: SessionPlayerState | null;
  isLoading: boolean;
  error: string | null;

  /** 從 sessionStorage 載入，有資料回傳 true */
  loadFromSession: () => boolean;
  /** 從 GAS 讀取（找不到時自動建立新存檔） */
  initFromGAS: (key: string) => Promise<void>;
  /** 強制清除快取並重新與伺服器同步存檔 */
  refreshProfile: () => Promise<void>;

  /** 暱稱變更 → 30s debounce 同步 */
  updateNickname: (nickname: string) => void;
  /** 隊伍變更 → 30s debounce 同步 */
  updateTeam: (team: TeamSlot[]) => void;
  /**
   * 武將升級
   * - syncStatus === Idle：立即呼叫 GAS upgrade_hero（伺服器計算）
   * - syncStatus === Pending/Syncing：本地計算，重置 debounce timer
   */
  upgradeHero: (
    heroId: string,
    heroConfig: HeroConfig
  ) => Promise<{ success: boolean; error?: string }>;
  /** 戰鬥結算：立即同步 save_result + save_profile */
  applyBattleResult: (result: BattleResultPayload) => void;

  clearError: () => void;

  // 內部方法（以 _ 前綴標示，不應在 UI 直接呼叫）
  _scheduleSync: () => void;
  _syncNow: () => Promise<void>;
}

// ── Zustand Store ──────────────────────────────────────────────
export const usePlayerStore = create<PlayerStore>((set, get) => ({
  player: null,
  isLoading: false,
  error: null,

  // ── 初始化 ───────────────────────────────────────────────────

  loadFromSession: () => {
    const session = readSession();
    if (session) {
      set({ player: session });
      return true;
    }
    return false;
  },

  initFromGAS: async (key: string) => {
    set({ isLoading: true, error: null });

    /** 確認 GAS 回傳的 data 有必要欄位，防止 players 表尚未改造 */
    function validateData(data: unknown): data is Record<string, unknown> {
      if (!data || typeof data !== "object") return false;
      const d = data as Record<string, unknown>;
      return (
        typeof d.gold === "number" &&
        typeof d.nickname === "string" &&
        Array.isArray(d.heroes) &&
        (d.team === undefined || Array.isArray(d.team))
      );
    }

    try {
      const res = await gameApi.getProfile(key);
      if (!validateData(res.data)) {
        set({
          error:
            "存檔格式異常：請確認 players 表已改造為新版欄位（key / created_at / updated_at / data），並重新部署 GAS。",
          isLoading: false,
        });
        return;
      }
      const player: SessionPlayerState = {
        key,
        syncStatus: SyncStatus.Idle,
        ...res.data,
        team: res.data.team || [],
        heroes: res.data.heroes || [],
      };
      writeSession(player);
      set({ player, isLoading: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "GAS_ERROR";
      if (msg === "PROFILE_NOT_FOUND") {
        // 新玩家：建立存檔後重新 getProfile 讀取（不依賴 createProfile 回傳格式）
        try {
          await gameApi.createProfile(key, "旅行者");
          const profileRes = await gameApi.getProfile(key);
          if (!validateData(profileRes.data)) {
            set({
              error:
                "存檔格式異常：請確認 players 表已改造為新版欄位（key / created_at / updated_at / data），且 GAS 已重新部署新版本。",
              isLoading: false,
            });
            return;
          }
          const player: SessionPlayerState = {
            key,
            syncStatus: SyncStatus.Idle,
            ...profileRes.data,
            team: profileRes.data.team || [],
            heroes: profileRes.data.heroes || [],
          };
          writeSession(player);
          set({ player, isLoading: false });
        } catch (createErr: unknown) {
          const createMsg =
            createErr instanceof Error ? createErr.message : "GAS_ERROR";
          set({ error: createMsg, isLoading: false });
        }
      } else {
        set({ error: msg, isLoading: false });
      }
    }
  },

  // ── 玩家操作 ─────────────────────────────────────────────────

  updateNickname: (nickname: string) => {
    const { player, _scheduleSync } = get();
    if (!player) return;
    const updated: SessionPlayerState = {
      ...player,
      nickname,
      syncStatus: SyncStatus.Pending,
    };
    writeSession(updated);
    set({ player: updated });
    _scheduleSync();
  },

  updateTeam: (team: TeamSlot[]) => {
    const { player, _scheduleSync } = get();
    if (!player) return;

    const updated: SessionPlayerState = {
      ...player,
      team,
      syncStatus: SyncStatus.Pending,
    };
    writeSession(updated);
    set({ player: updated });
    _scheduleSync();
  },

  upgradeHero: async (heroId: string, heroConfig: HeroConfig) => {
    const { player, _scheduleSync } = get();
    if (!player) return { success: false, error: "NOT_LOADED" };

    // 武將預設全部可用；heroes 陣列只記錄升級過的，找不到代表仍為初始值
    const heroIndex = player.heroes.findIndex((h) => h.hero_id === heroId);
    const currentHero =
      heroIndex !== -1
        ? player.heroes[heroIndex]
        : {
            hero_id: heroId,
            level: 1,
            star: 0,
            atk: heroConfig.base_atk,
            def: heroConfig.base_def,
            hp: heroConfig.base_hp,
          };

    const cost = heroConfig.upgrade_cost_base * currentHero.level;
    if (player.gold < cost) return { success: false, error: "GOLD_NOT_ENOUGH" };

    if (player.syncStatus === SyncStatus.Idle) {
      // ── 首次：立即呼叫 GAS（伺服器計算，防竄改）────────────
      set({ player: { ...player, syncStatus: SyncStatus.Syncing } });
      try {
        const res = await gameApi.upgradeHero(player.key, heroId);
        // 若原本 heroes 沒有該武將，GAS 回傳後新增；否則就地更新
        const updatedHeroes =
          heroIndex !== -1
            ? player.heroes.map((h, i) => (i === heroIndex ? res.hero : h))
            : [...player.heroes, res.hero];
        const updated: SessionPlayerState = {
          ...player,
          heroes: updatedHeroes,
          gold: res.gold_remaining,
          syncStatus: SyncStatus.Pending,
        };
        writeSession(updated);
        set({ player: updated });
        _scheduleSync();
        return { success: true };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "GAS_ERROR";
        set({ player: { ...player, syncStatus: SyncStatus.Idle } });
        return { success: false, error: msg };
      }
    } else {
      // ── Debounce 進行中：本地計算，重置 timer ───────────────
      const upgradedHero = {
        ...currentHero,
        level: currentHero.level + 1,
        atk: currentHero.atk + heroConfig.atk_growth,
        def: currentHero.def + heroConfig.def_growth,
        hp: currentHero.hp + heroConfig.hp_growth,
      };
      const updatedHeroes =
        heroIndex !== -1
          ? player.heroes.map((h, i) => (i === heroIndex ? upgradedHero : h))
          : [...player.heroes, upgradedHero];
      const updated: SessionPlayerState = {
        ...player,
        heroes: updatedHeroes,
        gold: player.gold - cost,
        syncStatus: SyncStatus.Pending,
      };
      writeSession(updated);
      set({ player: updated });
      _scheduleSync();
      return { success: true };
    }
  },

  refreshProfile: async () => {
    const { player, initFromGAS } = get();
    if (!player) return;
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(PLAYER_SESSION_KEY);
    }
    await initFromGAS(player.key);
  },

  applyBattleResult: (result: BattleResultPayload) => {
    const { player, _scheduleSync } = get();
    if (!player) return;

    clearDebounce(); // 取消 pending debounce，結算後統一處理

    // 1. 本地立即計算 (Optimistic Update)
    const isWin = result.result === BattleResult.Win;
    const pointsReward = isWin
      ? result.loots
          .filter((l) => l.item === "battle_points" || l.item === "gold")
          .reduce((sum, l) => sum + l.count, 0)
      : 10; // 失敗低保
    const nextStage = getNextStage(result.stage_id);
    const shouldUpdateStage =
      isWin && stageToNum(nextStage) > stageToNum(player.max_stage);

    const updated: SessionPlayerState = {
      ...player, // 保留 pending 的 heroes / team 變更
      gold: player.gold + pointsReward,
      max_stage: shouldUpdateStage ? nextStage : player.max_stage,
      syncStatus: SyncStatus.Syncing,
    };

    // 立即更新本地狀態與架構
    writeSession(updated);
    set({ player: updated });

    // 2. 背景非同步執行 (Background Sync)
    // 我們不在這裡 await，讓呼叫者（UI）可以立即跳轉
    void (async () => {
      try {
        // 第一步：通知 GAS 戰鬥結算（寫入 log）
        await gameApi.saveResult(player.key, result);

        // 第二步：保存完整 Profile（排除內部位標、同步狀態）
        const data = { ...updated } as any;
        const storageKey = data.key;
        delete data.key;
        delete data.syncStatus;
        await gameApi.saveProfile(storageKey, data);

        // 確認目前的 Store 同步狀態，成功則設為 Idle
        const current = get().player;
        if (current) {
          const final: SessionPlayerState = {
            ...current,
            syncStatus: SyncStatus.Idle,
          };
          writeSession(final);
          set({ player: final });
        }
      } catch (err) {
        console.error("[Background Sync] 戰鬥結算同步失敗:", err);
        // 失敗：退回 Pending，等 debounce 或手動重試
        const current = get().player;
        if (current) {
          const fallback: SessionPlayerState = {
            ...current,
            syncStatus: SyncStatus.Pending,
          };
          writeSession(fallback);
          set({ player: fallback });
          _scheduleSync();
        }
      }
    })();
  },

  // ── 內部：Debounce 同步 ──────────────────────────────────────

  _scheduleSync: () => {
    clearDebounce();
    _debounceTimer = setTimeout(() => {
      get()._syncNow();
    }, DEBOUNCE_MS);
  },

  _syncNow: async () => {
    const { player } = get();
    if (!player || player.syncStatus !== SyncStatus.Pending) return;

    set({ player: { ...player, syncStatus: SyncStatus.Syncing } });
    try {
      const data = { ...player } as any;
      const storageKey = data.key;
      delete data.key;
      delete data.syncStatus;
      await gameApi.saveProfile(storageKey, data);

      const current = get().player;
      if (current) {
        const updated = { ...current, syncStatus: SyncStatus.Idle };
        writeSession(updated);
        set({ player: updated });
      }
    } catch {
      // 失敗：退回 Pending，重啟 debounce 重試
      const current = get().player;
      if (current) {
        set({ player: { ...current, syncStatus: SyncStatus.Pending } });
        get()._scheduleSync();
      }
    }
  },

  clearError: () => set({ error: null }),
}));

// ── beforeunload：頁面關閉前 best-effort 同步 ──────────────────
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    const { player } = usePlayerStore.getState();
    if (!player || player.syncStatus !== SyncStatus.Pending) return;

    const data = { ...player } as any;
    const storageKey = data.key;
    delete data.key;
    delete data.syncStatus;

    // keepalive 讓 fetch 在頁面關閉後繼續執行
    fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "save_profile",
        key: storageKey,
        payload: { data },
      }),
      keepalive: true,
    }).catch(() => {});
  });
}
