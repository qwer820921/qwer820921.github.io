/**
 * useJsPlayerStore.ts
 * 神馬三國 JS 純渲染版專屬玩家帳號、資產、隊伍與存檔 Zustand Store
 * 支援本機離線雙層快取、Google Apps Script (GAS) 雲端存檔同步、30s Debounce 自動保存
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
import { getNextStage, stageToNum, getStageDataProblem } from "../utils/stagePlayability";

const GAS_URL =
  process.env.NEXT_PUBLIC_SHENMA_GAS_URL ||
  "https://script.google.com/macros/s/AKfycbwp4fh9r832zzUwY6x1HnvxrhuKxGAb0cluL_89ydsqSLQAwHHxMkUt_8mJQO1xDpue/exec";

export const LOCAL_PLAYER_KEY = "shenma_js_player_key";
export const COMPAT_PLAYER_KEY = "shenma_player_key";
export const SESSION_SAVE_PREFIX = "shenma_js_session_state_";
export const LOCAL_SAVE_PREFIX = "shenma_js_local_state_";

const DEBOUNCE_DELAY_MS = 30_000;

let _debounceSaveTimer: ReturnType<typeof setTimeout> | null = null;

// 建立初始預設玩家資料
export function createDefaultPlayerProfile(key: string, nickname = "主公"): PlayerState {
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
    gold: 1500, // 初始給予 1500 世界金幣，方便玩家體驗武將升級
    capacity: 65,
    max_stage: "chapter1_1",
    cleared_stages: {},
    heroes,
    team: defaultTeam,
    serverRev: 1,
    updatedAt: Date.now(),
  };
}

interface JsPlayerStoreState {
  player: PlayerState | null;
  isLoading: boolean;
  syncStatus: SyncStatusType;
  error: string | null;
  hasCheckedStorage: boolean;

  // 帳號與登入
  init: () => Promise<void>;
  loginWithKey: (key: string) => Promise<{ success: boolean; error?: string }>;
  startGuestMode: () => Promise<void>;
  logout: () => void;
  updateNickname: (nickname: string) => void;

  // 隊伍與武將養成
  updateTeam: (team: TeamSlot[]) => void;
  upgradeHero: (heroId: string) => { success: boolean; error?: string; cost?: number };

  // 戰鬥結算與進度推進
  settleBattle: (stageId: string, baseHp: number, maxHp: number) => BattleRewardResult;

  // 雲端同步與備份
  forceSync: () => Promise<{ success: boolean; error?: string }>;
  exportBackup: () => string;
  importBackup: (jsonStr: string) => { success: boolean; error?: string };
}

// 輔助函式：寫入本地與 Session 快取
function saveToLocalCache(player: PlayerState) {
  if (typeof window === "undefined") return;
  try {
    const json = JSON.stringify(player);
    localStorage.setItem(LOCAL_SAVE_PREFIX + player.key, json);
    sessionStorage.setItem(SESSION_SAVE_PREFIX + player.key, json);
    localStorage.setItem(LOCAL_PLAYER_KEY, player.key);
    localStorage.setItem(COMPAT_PLAYER_KEY, player.key);
  } catch (err) {
    console.warn("[JsPlayerStore] 快取儲存失敗", err);
  }
}

// 輔助函式：自本地讀取快取
function loadFromLocalCache(key: string): PlayerState | null {
  if (typeof window === "undefined") return null;
  try {
    const sess = sessionStorage.getItem(SESSION_SAVE_PREFIX + key);
    if (sess) return JSON.parse(sess);
    const loc = localStorage.getItem(LOCAL_SAVE_PREFIX + key);
    if (loc) return JSON.parse(loc);
  } catch {
    return null;
  }
  return null;
}

// 輔助函式：呼叫 GAS
async function callGasApi(action: string, key?: string, payload?: object) {
  const res = await fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({ action, key, payload }),
  });
  const data = await res.json();
  return data;
}

export const useJsPlayerStore = create<JsPlayerStoreState>((set, get) => ({
  player: null,
  isLoading: false,
  syncStatus: "idle",
  error: null,
  hasCheckedStorage: false,

  // 初始化：讀取儲存的金鑰並恢復存檔
  init: async () => {
    if (typeof window === "undefined") return;
    set({ isLoading: true, error: null });

    // 優先讀取 JS 版專用金鑰，無則檢查原版金鑰以相容
    let key = localStorage.getItem(LOCAL_PLAYER_KEY);
    if (!key) {
      key = localStorage.getItem(COMPAT_PLAYER_KEY);
    }

    if (!key) {
      set({ isLoading: false, hasCheckedStorage: true });
      return;
    }

    // 1. 0 延遲秒開：先從本機快取還原
    const cached = loadFromLocalCache(key);
    if (cached) {
      set({
        player: cached,
        isLoading: false,
        syncStatus: "idle",
        hasCheckedStorage: true,
      });

      // 2. 背景靜默向 GAS 核實最新雲端存檔
      try {
        const gasRes = await callGasApi("get_profile", key);
        if (gasRes.status === 200 && gasRes.data) {
          const cloudData = gasRes.data;
          // 若雲端有更新的版本號或資料，合併更新
          if (!cached.updatedAt || (cloudData.updatedAt && cloudData.updatedAt > cached.updatedAt)) {
            const merged: PlayerState = {
              ...cached,
              ...cloudData,
              key,
              serverRev: gasRes.rev ?? cached.serverRev ?? 1,
            };
            saveToLocalCache(merged);
            set({ player: merged, syncStatus: "idle" });
          }
        }
      } catch {
        // 背景連線失敗保持本地離線可用
        set({ syncStatus: "offline" });
      }
      return;
    }

    // 3. 本地無快取，向 GAS 獲取或建立存檔
    try {
      set({ syncStatus: "syncing" });
      const gasRes = await callGasApi("get_profile", key);
      if (gasRes.status === 200 && gasRes.data) {
        const profile: PlayerState = {
          ...createDefaultPlayerProfile(key),
          ...gasRes.data,
          key,
          serverRev: gasRes.rev ?? 1,
        };
        saveToLocalCache(profile);
        set({ player: profile, isLoading: false, syncStatus: "idle", hasCheckedStorage: true });
      } else {
        // 404 或查無資料，自動生成初始新存檔
        const newProfile = createDefaultPlayerProfile(key);
        saveToLocalCache(newProfile);
        set({ player: newProfile, isLoading: false, syncStatus: "idle", hasCheckedStorage: true });
        // 背景寫入 GAS
        void callGasApi("save_profile", key, { data: newProfile }).catch(() => {});
      }
    } catch {
      // 網路失敗，建立本地離線存檔
      const offlineProfile = createDefaultPlayerProfile(key);
      saveToLocalCache(offlineProfile);
      set({
        player: offlineProfile,
        isLoading: false,
        syncStatus: "offline",
        hasCheckedStorage: true,
      });
    }
  },

  // 登入自訂金鑰
  loginWithKey: async (rawKey: string) => {
    const key = rawKey.trim();
    if (!key) return { success: false, error: "金鑰不能為空" };

    set({ isLoading: true, error: null, syncStatus: "syncing" });
    try {
      localStorage.setItem(LOCAL_PLAYER_KEY, key);
      localStorage.setItem(COMPAT_PLAYER_KEY, key);

      // 先查快取
      const cached = loadFromLocalCache(key);
      if (cached) {
        set({ player: cached, isLoading: false, syncStatus: "idle" });
        return { success: true };
      }

      // 查 GAS
      const res = await callGasApi("get_profile", key);
      if (res.status === 200 && res.data) {
        const profile: PlayerState = {
          ...createDefaultPlayerProfile(key),
          ...res.data,
          key,
          serverRev: res.rev ?? 1,
        };
        saveToLocalCache(profile);
        set({ player: profile, isLoading: false, syncStatus: "idle" });
        return { success: true };
      } else {
        // 建立新檔
        const newProfile = createDefaultPlayerProfile(key);
        saveToLocalCache(newProfile);
        set({ player: newProfile, isLoading: false, syncStatus: "idle" });
        void callGasApi("save_profile", key, { data: newProfile }).catch(() => {});
        return { success: true };
      }
    } catch {
      // 網路異常仍可使用本機離線新檔
      const offlineProfile = createDefaultPlayerProfile(key);
      saveToLocalCache(offlineProfile);
      set({ player: offlineProfile, isLoading: false, syncStatus: "offline" });
      return { success: true };
    }
  },

  // 一鍵訪客快速模式
  startGuestMode: async () => {
    const guestKey = `guest_${Date.now().toString(36)}`;
    const guestProfile = createDefaultPlayerProfile(guestKey, "遊俠主公");
    saveToLocalCache(guestProfile);
    set({ player: guestProfile, isLoading: false, syncStatus: "idle", hasCheckedStorage: true });
  },

  // 登出 / 清除目前金鑰與所有相關快取
  logout: () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(LOCAL_PLAYER_KEY);
        localStorage.removeItem(COMPAT_PLAYER_KEY);
        const sessionKeysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith(SESSION_SAVE_PREFIX)) {
            sessionKeysToRemove.push(k);
          }
        }
        sessionKeysToRemove.forEach((k) => sessionStorage.removeItem(k));
      } catch (err) {
        console.warn("[JsPlayerStore] 登出清除快取失敗", err);
      }
    }
    if (_debounceSaveTimer) {
      clearTimeout(_debounceSaveTimer);
      _debounceSaveTimer = null;
    }
    set({ player: null, syncStatus: "idle", error: null });
  },

  // 修改暱稱
  updateNickname: (nickname: string) => {
    const { player } = get();
    if (!player) return;
    const updated: PlayerState = {
      ...player,
      nickname: nickname.trim() || player.nickname,
      updatedAt: Date.now(),
    };
    saveToLocalCache(updated);
    set({ player: updated, syncStatus: "pending" });

    // 排程 Debounce 保存
    if (_debounceSaveTimer) clearTimeout(_debounceSaveTimer);
    _debounceSaveTimer = setTimeout(() => {
      void get().forceSync();
    }, DEBOUNCE_DELAY_MS);
  },

  // 隊伍調整 (5 個槽位)
  updateTeam: (team: TeamSlot[]) => {
    const { player } = get();
    if (!player) return;
    const updated: PlayerState = {
      ...player,
      team,
      updatedAt: Date.now(),
    };
    saveToLocalCache(updated);
    set({ player: updated, syncStatus: "pending" });

    if (_debounceSaveTimer) clearTimeout(_debounceSaveTimer);
    _debounceSaveTimer = setTimeout(() => {
      void get().forceSync();
    }, DEBOUNCE_DELAY_MS);
  },

  // 武將升級 (消耗世界金幣提升等級與三圍屬性)
  upgradeHero: (heroId: string) => {
    const { player } = get();
    if (!player) return { success: false, error: "尚未登入" };

    const heroIndex = player.heroes.findIndex((h) => h.hero_id === heroId);
    if (heroIndex === -1) return { success: false, error: "查無此武將" };

    const hero = player.heroes[heroIndex];
    const cost = 100 * hero.level;

    if (player.gold < cost) {
      return { success: false, error: `金幣不足！升級需 ${cost} 金幣，當前僅有 ${player.gold}` };
    }

    const cfg = BUILTIN_HEROES_CONFIG.find((c) => c.hero_id === heroId);
    const atkGrowth = cfg?.atk_growth ?? 15;
    const defGrowth = cfg?.def_growth ?? 8;
    const hpGrowth = cfg?.hp_growth ?? 100;

    const updatedHero: PlayerHeroState = {
      ...hero,
      level: hero.level + 1,
      atk: hero.atk + atkGrowth,
      def: hero.def + defGrowth,
      hp: hero.hp + hpGrowth,
    };

    const newHeroes = [...player.heroes];
    newHeroes[heroIndex] = updatedHero;

    const updatedPlayer: PlayerState = {
      ...player,
      gold: player.gold - cost,
      heroes: newHeroes,
      updatedAt: Date.now(),
    };

    saveToLocalCache(updatedPlayer);
    set({ player: updatedPlayer, syncStatus: "pending" });

    // 觸發 Debounce 保存
    if (_debounceSaveTimer) clearTimeout(_debounceSaveTimer);
    _debounceSaveTimer = setTimeout(() => {
      void get().forceSync();
    }, DEBOUNCE_DELAY_MS);

    return { success: true, cost };
  },

  // 戰鬥勝利結算 (EXP、金幣、關卡解鎖推進)
  settleBattle: (stageId: string, baseHp: number, maxHp: number): BattleRewardResult => {
    const { player } = get();
    if (!player) {
      return { stars: 1, expEarned: 0, goldEarned: 0, leveledUp: false, newLevel: 1 };
    }

    // 計算星數
    const hpRatio = baseHp / maxHp;
    let stars = 1;
    if (hpRatio >= 1.0) stars = 3;
    else if (hpRatio >= 0.5) stars = 2;

    // 依關卡發放獎勵
    const stageNum = stageToNum(stageId);
    const chapter = Math.floor(stageNum / 100) || 1;
    const stageIdx = (stageNum % 100) || 1;
    const chapterMult = Math.max(1, (chapter - 1) * 10 + stageIdx);
    const expEarned = 100 * chapterMult;
    const goldEarned = 200 * chapterMult;

    // 計算主公升級
    let currentExp = player.exp + expEarned;
    let currentLevel = player.level;
    let currentCapacity = player.capacity;
    let leveledUp = false;

    const expNeeded = currentLevel * 250;
    if (currentExp >= expNeeded) {
      currentLevel += 1;
      currentExp -= expNeeded;
      currentCapacity += 5; // 升級擴充出征 Cost 容量
      leveledUp = true;
    }

    // 更新通關星級
    const currentStars = player.cleared_stages[stageId] || 0;
    const newClearedStages = {
      ...player.cleared_stages,
      [stageId]: Math.max(currentStars, stars),
    };

    // 若通關當前最高關卡，推進解鎖下一關 (檢查下一關是否真實存在且資料完整)
    let nextStageId = player.max_stage;
    let stageUnlocked: string | undefined = undefined;
    if (stageId === player.max_stage) {
      const nextCandidateId = getNextStage(stageId);
      const stageMgr = StageDataManager.getInstance();
      const nextStageObj = stageMgr.getStageById(nextCandidateId);
      if (nextStageObj && !getStageDataProblem(nextStageObj)) {
        nextStageId = nextCandidateId;
        stageUnlocked = nextStageObj.name;
      }
    }

    const updatedPlayer: PlayerState = {
      ...player,
      exp: currentExp,
      level: currentLevel,
      gold: player.gold + goldEarned,
      capacity: currentCapacity,
      max_stage: nextStageId,
      cleared_stages: newClearedStages,
      updatedAt: Date.now(),
    };

    saveToLocalCache(updatedPlayer);
    set({ player: updatedPlayer, syncStatus: "syncing" });

    // 戰鬥結算重要操作，立即嘗試同步至雲端
    if (_debounceSaveTimer) clearTimeout(_debounceSaveTimer);
    void callGasApi("save_result", player.key, {
      stage_id: stageId,
      stars,
      reward: { exp: expEarned, gold: goldEarned },
      after: {
        level: currentLevel,
        exp: currentExp,
        gold: updatedPlayer.gold,
        max_stage: nextStageId,
      },
    })
      .then(() => set({ syncStatus: "idle" }))
      .catch(() => set({ syncStatus: "offline" }));

    return {
      stars,
      expEarned,
      goldEarned,
      leveledUp,
      newLevel: currentLevel,
      stageUnlocked,
    };
  },

  // 強制手動立即雲端同步
  forceSync: async () => {
    const { player } = get();
    if (!player) return { success: false, error: "未登入" };

    set({ syncStatus: "syncing", error: null });
    try {
      const res = await callGasApi("save_profile", player.key, {
        data: player,
      });

      if (res.status === 200 || res.success) {
        set({ syncStatus: "idle" });
        return { success: true };
      } else {
        set({ syncStatus: "error", error: res.error || "同步失敗" });
        return { success: false, error: res.error };
      }
    } catch (err: any) {
      set({ syncStatus: "offline", error: err?.message || "網路連線中斷" });
      return { success: false, error: "網路連線中斷，已保留於本機" };
    }
  },

  // 匯出 JSON 備份檔
  exportBackup: () => {
    const { player } = get();
    if (!player) return "";
    return JSON.stringify(player, null, 2);
  },

  // 匯入 JSON 備份檔
  importBackup: (jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr) as PlayerState;
      if (!parsed.key || !parsed.nickname || !Array.isArray(parsed.heroes)) {
        return { success: false, error: "存檔格式不符合規格" };
      }
      parsed.updatedAt = Date.now();
      saveToLocalCache(parsed);
      set({ player: parsed, syncStatus: "pending" });
      void get().forceSync();
      return { success: true };
    } catch {
      return { success: false, error: "無法解析 JSON 存檔內容" };
    }
  },
}));
