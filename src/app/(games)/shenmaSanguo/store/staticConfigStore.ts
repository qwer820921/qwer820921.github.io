import { create } from "zustand";
import { StaticConfig, MapConfig } from "../types";
import { gameApi } from "../api/gameApi";

const STATIC_LOCAL_KEY = "shenma_static_config";
const STATIC_TS_KEY = "shenma_static_ts";
const CACHE_TTL_MS = 60_000; // 60 秒內不重新打 GAS

function readStaticLocal(): StaticConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STATIC_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as StaticConfig) : null;
  } catch {
    return null;
  }
}

function readTimestamp(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(STATIC_TS_KEY) || "0");
}

function writeCache(config: StaticConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STATIC_LOCAL_KEY, JSON.stringify(config));
  localStorage.setItem(STATIC_TS_KEY, String(Date.now()));
}

interface StaticConfigStore {
  config: StaticConfig | null;
  isLoading: boolean;
  /** 0–3：已完成的 API 數（有快取時直接為 3） */
  fetchProgress: number;
  error: string | null;
  loadConfig: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  clearError: () => void;
}

export const useStaticConfigStore = create<StaticConfigStore>((set, get) => {
  /**
   * 實際呼叫 3 支 GAS API。
   * blocking=true  → 更新 fetchProgress + isLoading（首次無快取時）
   * blocking=false → 靜默背景刷新，不動 fetchProgress / isLoading
   */
  const fetchAll = async (blocking: boolean) => {
    try {
      const [heroesRes, enemiesRes, allMapsRes] = await Promise.all([
        gameApi.getHeroesConfig().then((r) => {
          if (blocking) set((s) => ({ fetchProgress: s.fetchProgress + 1 }));
          return r;
        }),
        gameApi.getEnemiesConfig().then((r) => {
          if (blocking) set((s) => ({ fetchProgress: s.fetchProgress + 1 }));
          return r;
        }),
        gameApi.getAllMaps().then((r) => {
          if (blocking) set((s) => ({ fetchProgress: s.fetchProgress + 1 }));
          return r;
        }),
      ]);

      const config: StaticConfig = {
        heroesConfig: heroesRes.heroes,
        enemiesConfig: enemiesRes.enemies,
        maps: allMapsRes.maps as MapConfig[],
      };

      writeCache(config);
      set({ config, ...(blocking ? { isLoading: false } : {}) });
    } catch (e: unknown) {
      if (blocking) {
        const msg = e instanceof Error ? e.message : "GAS_ERROR";
        set({ error: msg, isLoading: false });
      }
      // 背景刷新失敗靜默忽略
    }
  };

  return {
    config: null,
    isLoading: false,
    fetchProgress: 0,
    error: null,

    loadConfig: async () => {
      // 防止重複呼叫
      if (get().isLoading) return;

      const cached = readStaticLocal();
      const hasCachedConfig = !!cached?.heroesConfig?.length;

      if (hasCachedConfig) {
        const isExpired = Date.now() - readTimestamp() >= CACHE_TTL_MS;

        if (!isExpired) {
          // 快取新鮮：直接用，不打 GAS
          set({ config: cached, fetchProgress: 3 });
          return;
        }

        // 快取過期：立即用快取顯示（不卡 game start），同時打 API 更新進度條
        set({ config: cached, fetchProgress: 0 });
        await fetchAll(true);
        return;
      }

      // 無快取：阻塞式載入（顯示進度）
      set({ isLoading: true, fetchProgress: 0, error: null });
      await fetchAll(true);
    },

    refreshConfig: async () => {
      if (typeof window !== "undefined") {
        localStorage.removeItem(STATIC_LOCAL_KEY);
        localStorage.removeItem(STATIC_TS_KEY);
      }
      set({ config: null, fetchProgress: 0, isLoading: true, error: null });
      await fetchAll(true);
    },

    clearError: () => set({ error: null }),
  };
});
