import { create } from "zustand";
import { StaticConfig, MapConfig } from "../types";
import { gameApi } from "../api/gameApi";

const STATIC_SESSION_KEY = "shenma_static_config";

// ── sessionStorage helpers ─────────────────────────────────────
function readStaticSession(): StaticConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STATIC_SESSION_KEY);
    return raw ? (JSON.parse(raw) as StaticConfig) : null;
  } catch {
    return null;
  }
}

// ── Store 型別 ─────────────────────────────────────────────────
interface StaticConfigStore {
  config: StaticConfig | null;
  isLoading: boolean;
  error: string | null;
  /**
   * 載入靜態設定：先查 sessionStorage 快取，無則從 GAS 抓取並快取
   * 包含：heroesConfig、enemiesConfig、所有地圖完整設定（含 path_json + waves）
   */
  loadConfig: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  clearError: () => void;
}

// ── Zustand Store ──────────────────────────────────────────────
export const useStaticConfigStore = create<StaticConfigStore>((set, get) => ({
  config: null,
  isLoading: false,
  error: null,

  loadConfig: async () => {
    // 優先使用 session 快取（需有武將資料才算有效）
    const cached = readStaticSession();
    if (cached && cached.heroesConfig?.length > 0) {
      set({ config: cached });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      // 並行拉取 heroes / enemies / 全量地圖（含 path_json + waves）
      const [heroesRes, enemiesRes, allMapsRes] = await Promise.all([
        gameApi.getHeroesConfig(),
        gameApi.getEnemiesConfig(),
        gameApi.getAllMaps(),
      ]);

      const config: StaticConfig = {
        heroesConfig: heroesRes.heroes,
        enemiesConfig: enemiesRes.enemies,
        maps: allMapsRes.maps as MapConfig[],
      };

      sessionStorage.setItem(STATIC_SESSION_KEY, JSON.stringify(config));
      set({ config, isLoading: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "GAS_ERROR";
      set({ error: msg, isLoading: false });
    }
  },

  refreshConfig: async () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(STATIC_SESSION_KEY);
    }
    await get().loadConfig();
  },

  clearError: () => set({ error: null }),
}));
