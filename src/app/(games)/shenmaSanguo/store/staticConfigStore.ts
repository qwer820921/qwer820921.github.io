import { create } from "zustand";
import { StaticConfig, MapConfig } from "../types";
import { dropStaleReadWaits, gameApi } from "../api/gameApi";
import { normalizeStaticConfig } from "../utils/heroStats";

const STATIC_LOCAL_KEY = "shenma_static_config";
const STATIC_TS_KEY = "shenma_static_ts";
const CACHE_TTL_MS = 60_000; // 60 秒內不重新打 GAS

// 讀取序號：每次 fetchAll +1，只有最新一次讀取可以寫入結果（舊的回應不蓋掉新的設定，也不再重試）
let _fetchSeq = 0;
// 進行中的載入：同時再呼叫 loadConfig（例如連按重試）時共用同一次，不另外開一套重試
let _loadInFlight: Promise<void> | null = null;

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
    const seq = ++_fetchSeq;
    // 三支任一失敗（重試用完）後，其餘的不再重試；有較新的讀取時也不再重試
    // （過期的讀取也不再說明回應較慢或正在重試）
    let failed = false;
    dropStaleReadWaits();
    const read = {
      active: () => seq === _fetchSeq && !failed,
      foreground: blocking,
    };
    const progress = <T>(r: T) => {
      if (blocking && seq === _fetchSeq)
        set((s) => ({ fetchProgress: s.fetchProgress + 1 }));
      return r;
    };
    try {
      const [heroesRes, enemiesRes, allMapsRes] = await Promise.all(
        [
          gameApi.getHeroesConfig(read),
          gameApi.getEnemiesConfig(read),
          gameApi.getAllMaps(read),
        ].map((p) =>
          p.then(progress, (e: unknown) => {
            failed = true;
            dropStaleReadWaits();
            throw e;
          })
        )
      );
      if (seq !== _fetchSeq) return;

      const config: StaticConfig = {
        heroesConfig: heroesRes.heroes,
        enemiesConfig: enemiesRes.enemies,
        maps: allMapsRes.maps as MapConfig[],
      };

      // 快取保留 API 的原始內容；store 裡的一律是正規化後的設定（攻速成長欄位名稱，見 utils/heroStats）
      writeCache(config);
      set({
        config: normalizeStaticConfig(config),
        ...(blocking ? { isLoading: false } : {}),
      });
    } catch (e: unknown) {
      if (seq !== _fetchSeq) return;
      if (blocking) {
        // 錯誤代碼（NETWORK_ERROR、TIMEOUT、BAD_RESPONSE 或後端的錯誤），不帶網址或回應內容
        const msg = e instanceof Error && e.message ? e.message : "GAS_ERROR";
        set({ error: msg, isLoading: false });
      }
      // 背景刷新失敗靜默忽略
    }
  };
  const share = (run: () => Promise<void>) => {
    const promise = run().finally(() => {
      if (_loadInFlight === promise) _loadInFlight = null;
    });
    _loadInFlight = promise;
    return promise;
  };

  return {
    config: null,
    isLoading: false,
    fetchProgress: 0,
    error: null,

    loadConfig: async () => {
      // 防止重複呼叫：進行中的載入（含自動重試）共用同一次
      if (_loadInFlight) return _loadInFlight;
      if (get().isLoading) return;
      return share(async () => {
        const raw = readStaticLocal();
        const hasCachedConfig = !!raw?.heroesConfig?.length;

        if (raw && hasCachedConfig) {
          // 已存在的快取可能是舊格式（只有 speed_growth）：和 API 回應一樣先正規化，不需要玩家清除快取
          const cached = normalizeStaticConfig(raw);
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
      });
    },

    // 手動同步：清掉快取重新讀取（進行中的舊讀取作廢，它的回應不再採用）
    refreshConfig: () =>
      share(async () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem(STATIC_LOCAL_KEY);
          localStorage.removeItem(STATIC_TS_KEY);
        }
        set({ config: null, fetchProgress: 0, isLoading: true, error: null });
        await fetchAll(true);
      }),

    clearError: () => set({ error: null }),
  };
});
