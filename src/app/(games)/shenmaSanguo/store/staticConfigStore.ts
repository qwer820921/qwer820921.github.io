import { create } from "zustand";
import { StaticConfig, MapConfig } from "../types";
import { gameApi } from "../api/gameApi";

const STATIC_LOCAL_KEY = "shenma_static_config";
const STATIC_VERSION_KEY = "shenma_static_version";

// ── localStorage helpers ─────────────────────────────────────
function readStaticLocal(): StaticConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STATIC_LOCAL_KEY);
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
    set({ isLoading: true, error: null });
    try {
      // 1. 抓取遠端版本號
      const settingsRes = await gameApi.getSettings();
      // 我們預期遠端回傳的格式為： { status: 200, settings: { version: "V1.0.1", ... } }
      const remoteVersion = settingsRes?.settings?.version || "unknown";

      // 2. 取得本地快取與版本號
      let localVersion = null;
      if (typeof window !== "undefined") {
        localVersion = localStorage.getItem(STATIC_VERSION_KEY);
      }
      const cached = readStaticLocal();

      // 如果版本一致，且快取有效，直接使用快取
      if (
        localVersion === remoteVersion &&
        cached &&
        cached.heroesConfig?.length > 0
      ) {
        console.log(
          `[StaticConfig] Version match (${remoteVersion}). Using local cache.`
        );
        set({ config: cached, isLoading: false });
        return;
      }

      console.log(
        `[StaticConfig] Version mismatch or missing cache (Local: ${localVersion}, Remote: ${remoteVersion}). Fetching new data...`
      );

      // 3. 版本不同或無快取，並行拉取所有資料
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

      if (typeof window !== "undefined") {
        localStorage.setItem(STATIC_LOCAL_KEY, JSON.stringify(config));
        localStorage.setItem(STATIC_VERSION_KEY, remoteVersion);
      }

      set({ config, isLoading: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "GAS_ERROR";
      console.error("[StaticConfig] Error loading config:", msg);
      set({ error: msg, isLoading: false });
    }
  },

  refreshConfig: async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STATIC_LOCAL_KEY);
      localStorage.removeItem(STATIC_VERSION_KEY);
    }
    await get().loadConfig();
  },

  clearError: () => set({ error: null }),
}));
