// 神馬三國 GAS API Wrapper v2
// GAS 不支援 CORS preflight，所以不設定 Content-Type header
// body 傳純字串，GAS 用 e.postData.contents 讀取
import { ReadWait, useReadWaitStore } from "../store/readWaitStore";

// 建置時可用環境變數 NEXT_PUBLIC_SHENMA_GAS_URL 改成測試用的部署（例如試算表副本的 exec 網址）；沒有設定時是正式的後端。
// 網址會包進前端程式，只能放公開的部署網址，不能放任何密碼
export const SHENMA_SANGUO_GAS_URL =
  process.env.NEXT_PUBLIC_SHENMA_GAS_URL ||
  "https://script.google.com/macros/s/AKfycbwp4fh9r832zzUwY6x1HnvxrhuKxGAb0cluL_89ydsqSLQAwHHxMkUt_8mJQO1xDpue/exec";

const GAS_URL = SHENMA_SANGUO_GAS_URL;

/**
 * GAS 已處理請求並回傳錯誤（status ≠ 200）。
 * 和網路錯誤、無法解析的回應不同：這代表伺服器明確拒絕，而不是結果不明。
 * response 是後端回應的完整內容（例如版本衝突時附上雲端目前的 rev 與 data）
 */
export class GasError extends Error {
  readonly response: Record<string, unknown>;
  constructor(code: string, response: Record<string, unknown> = {}) {
    super(code);
    this.response = response;
  }
}

/**
 * 唯讀請求沒有拿到後端的明確回應（重試用完之後才丟出）：
 * NETWORK_ERROR（連不上、平台錯誤頁沒有 CORS 標頭）、TIMEOUT（等太久）、BAD_RESPONSE（平台的錯誤頁等無法解析的回應）。
 * 和 GasError 不同，這不是後端的拒絕；訊息只有代碼，不帶網址或回應內容
 */
export class GasTransportError extends Error {
  constructor(code: "NETWORK_ERROR" | "TIMEOUT" | "BAD_RESPONSE") {
    super(code);
  }
}

/** 完整結算獎勵的契約版本：請求與後端的回應都帶這個值才算新契約（見 saveResult） */
export const SETTLE_CONTRACT = 2;

// ── 唯讀請求的自動重試 ──
// GAS 一律用 POST，不能用 HTTP 方法判斷會不會寫入：只有這裡明列的 action 會自動重試。
// 建檔、保存、結算、升級與所有管理寫入不在清單內，一律只送一次（結果不明時由各自的待確認流程處理）
export const READ_ONLY_ACTIONS: ReadonlySet<string> = new Set([
  "get_settings",
  "get_heroes_config",
  "get_enemies_config",
  "get_all_maps",
  "get_map_config",
  "get_profile",
]);
/** 單次讀取最多等多久（測試部署曾出現 26 秒才回的正常回應） */
export const READ_TIMEOUT_MS = 30_000;
/** 第一次失敗後的重試間隔：最多重試 2 次（一次讀取最多 3 次請求） */
export const READ_RETRY_DELAYS_MS = [1_000, 2_000];
/** 等超過這個時間還沒回應：畫面說明「回應較慢」 */
export const SLOW_READ_NOTICE_MS = 8_000;
/**
 * 後端明確回報、但只是暫時的錯誤（讀取不會寫入任何資料，可以再讀一次）：
 * 拿不到鎖（BUSY）與執行時的例外（SERVER_ERROR）。其他錯誤（找不到存檔、權限、資料損毀等）照原流程，不重試
 */
const TRANSIENT_GAS_ERRORS = new Set(["BUSY", "SERVER_ERROR"]);

/** 玩家正在等的讀取：回應較慢、正在自動重試時，畫面據此說明（見 store/readWaitStore） */
export type ReadOptions = {
  /** 回傳 false 時不再重試（換帳號、有較新的讀取、元件卸載等，這次讀取已經過期） */
  active?: () => boolean;
  /** 玩家正在等這個結果（登入、切換、手動同步、首次載入設定）；背景讀取不傳 */
  foreground?: boolean;
};

/** 有數字時才帶 base_rev（舊版後端或版本不明時不帶） */
const withBase = (payload: object, baseRev?: number | null) =>
  typeof baseRev === "number" ? { ...payload, base_rev: baseRev } : payload;

// 不設 Content-Type，避免 CORS preflight（GAS 不處理 OPTIONS）
const requestBody = (action: string, key?: string, payload?: object) =>
  JSON.stringify({ action, key, payload });

async function callGAS(
  action: string,
  key?: string,
  payload?: object,
  options?: ReadOptions
) {
  if (READ_ONLY_ACTIONS.has(action)) {
    return readWithRetry(action, key, payload, options ?? {});
  }
  // 寫入：只送一次，錯誤照原樣交給呼叫端判斷（網路錯誤代表結果不明）
  const res = await fetch(GAS_URL, {
    method: "POST",
    body: requestBody(action, key, payload),
  });
  const data = await res.json();
  if (data.status !== 200) {
    throw new GasError(data.error || "GAS_ERROR", data);
  }
  return data;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

let _readWaitSeq = 0;
/** 等待中的前景讀取各自的 active：過期的讀取（換了帳號、有較新的讀取）請求可能還在等，但不再說明它慢或正在重試 */
const _readWaitActive = new Map<number, () => boolean>();
const withoutStale = (waits: Record<number, ReadWait>) => {
  const out = { ...waits };
  for (const [id, active] of _readWaitActive) if (!active()) delete out[id];
  return out;
};
/** 拿掉過期讀取的等待說明（新的讀取取代舊的讀取時呼叫；不影響請求本身） */
export function dropStaleReadWaits() {
  useReadWaitStore.setState((s) => ({ waits: withoutStale(s.waits) }));
}

/** 記錄一筆前景讀取的等待狀態（畫面說明「回應較慢」「正在重試」用）；結束時一定要呼叫 end */
function beginReadWait(active?: () => boolean) {
  const id = ++_readWaitSeq;
  let slowTimer: ReturnType<typeof setTimeout> | undefined;
  if (active) _readWaitActive.set(id, active);
  const put = (w: ReadWait | null) =>
    useReadWaitStore.setState((s) => {
      const waits = { ...s.waits };
      if (w) waits[id] = w;
      else delete waits[id];
      return { waits: withoutStale(waits) };
    });
  return {
    /** 開始第 n 次請求（0 是第一次）：等超過 SLOW_READ_NOTICE_MS 時標為較慢 */
    attempt(n: number) {
      clearTimeout(slowTimer);
      put({ retry: n, slow: false });
      slowTimer = setTimeout(
        () => put({ retry: n, slow: true }),
        SLOW_READ_NOTICE_MS
      );
    },
    /** 失敗後等待第 n 次重試 */
    retrying(n: number) {
      clearTimeout(slowTimer);
      put({ retry: n, slow: false });
    },
    end() {
      clearTimeout(slowTimer);
      _readWaitActive.delete(id);
      put(null);
    },
  };
}

/** 送出一次唯讀請求；逾時、連線失敗、無法解析的回應都轉成 GasTransportError */
async function readOnce(action: string, key?: string, payload?: object) {
  const controller =
    typeof AbortController === "undefined" ? null : new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new GasTransportError("TIMEOUT"));
      controller?.abort();
    }, READ_TIMEOUT_MS);
  });
  const request = (async () => {
    let res: Response;
    try {
      res = await fetch(GAS_URL, {
        method: "POST",
        body: requestBody(action, key, payload),
        ...(controller ? { signal: controller.signal } : {}),
      });
    } catch {
      throw new GasTransportError("NETWORK_ERROR");
    }
    // 前端伺服器忙碌或暫時錯誤（後端程式的回應一律是 200，錯誤寫在內容的 status）
    if (res.status === 429 || res.status >= 500) {
      throw new GasTransportError("BAD_RESPONSE");
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      // 平台的錯誤頁（HTML，例如 404）：不是後端的回應，和「找不到存檔」完全不同
      throw new GasTransportError("BAD_RESPONSE");
    }
    if (
      !data ||
      typeof data !== "object" ||
      typeof (data as { status?: unknown }).status !== "number"
    ) {
      throw new GasTransportError("BAD_RESPONSE");
    }
    const body = data as Record<string, unknown> & { status: number };
    if (body.status !== 200) {
      throw new GasError(
        typeof body.error === "string" && body.error ? body.error : "GAS_ERROR",
        body
      );
    }
    return body;
  })();
  try {
    // 逾時之後才到的回應不採用（下一次重試會重新讀取）
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const retryable = (e: unknown) =>
  e instanceof GasTransportError ||
  (e instanceof GasError && TRANSIENT_GAS_ERRORS.has(e.message));

/**
 * 唯讀請求：暫時的失敗最多重試 READ_RETRY_DELAYS_MS 次，之後丟出最後一次的錯誤。
 * 後端明確的回應（例如找不到存檔）直接交給呼叫端；讀取已經過期（active 回傳 false）時不再重試
 */
async function readWithRetry(
  action: string,
  key: string | undefined,
  payload: object | undefined,
  { active, foreground }: ReadOptions
) {
  const wait = foreground ? beginReadWait(active) : null;
  try {
    for (let attempt = 0; ; attempt++) {
      wait?.attempt(attempt);
      try {
        return await readOnce(action, key, payload);
      } catch (e) {
        if (
          !retryable(e) ||
          attempt >= READ_RETRY_DELAYS_MS.length ||
          (active && !active())
        ) {
          throw e;
        }
        wait?.retrying(attempt + 1);
        await delay(READ_RETRY_DELAYS_MS[attempt]);
        if (active && !active()) throw e;
      }
    }
  } finally {
    wait?.end();
  }
}

export const gameApi = {
  // ── 玩家 ──

  /**
   * 建立新玩家存檔
   * GAS 會自動給予初始武將，不需從 Web 端傳入
   */
  createProfile: (key: string, nickname: string) =>
    callGAS("create_profile", key, { nickname }),

  /**
   * 讀取玩家完整資料
   * 回傳：{ status: 200, data: { nickname, level, gold, heroes, team, ... } }
   * 唯讀：暫時的失敗會自動重試（見 READ_ONLY_ACTIONS）
   */
  getProfile: (key: string, options?: ReadOptions) =>
    callGAS("get_profile", key, undefined, options),

  /**
   * 覆寫玩家完整 data（隊伍變更、debounce 同步時使用）
   * baseRev：這份資料根據的雲端版本；雲端在這之後被改過時後端回 REV_CONFLICT（附雲端目前的 rev 與 data），不寫入
   * 回傳：{ status: 200, success: true, rev?, prev_rev? }（舊版後端沒有 rev）
   */
  saveProfile: (key: string, data: object, baseRev?: number | null) =>
    callGAS("save_profile", key, withBase({ data }, baseRev)),

  // ── 存檔 ──

  /**
   * 戰鬥結算：GAS 伺服器端更新存檔並寫入 battle_logs
   * requestId：這一場的識別碼；新版後端用它辨識重送（同一場只記錄一次），舊版後端忽略
   * baseRev：送出時本機的雲端版本；新版後端只在它等於寫入前的版本時才回傳新的 rev
   * fullReward：帶 settle_contract: 2，要求後端在同一次寫入保存完整獎勵（點數、經驗、等級、容量、進度）。
   *   支援的後端回應也帶 settle_contract: 2（附 request_id、reward、after）；舊後端不認得，照舊只記進度
   * 回傳：{ status: 200, success: true, log_id, prev_rev?, rev?, base_mismatch?, duplicate?, settle_contract?, reward?, after? }
   */
  saveResult: (
    key: string,
    result: object,
    requestId?: string,
    baseRev?: number | null,
    fullReward = false
  ) =>
    callGAS(
      "save_result",
      key,
      withBase(
        {
          ...result,
          ...(requestId ? { request_id: requestId } : {}),
          ...(fullReward ? { settle_contract: SETTLE_CONTRACT } : {}),
        },
        baseRev
      )
    ),

  // ── 武將升級 ──

  /**
   * 武將升級：GAS 伺服器端計算費用、扣金幣、更新屬性
   * baseRev：送出時本機的雲端版本；新版後端在雲端版本不同時回 REV_CONFLICT，不扣點數
   * 回傳：{ status: 200, hero: {...}, gold_remaining: number, cost?, rev?, prev_rev? }
   * 失敗：{ status: 400, error: "GOLD_NOT_ENOUGH" }
   */
  upgradeHero: (key: string, heroId: string, baseRev?: number | null) =>
    callGAS("upgrade_hero", key, withBase({ hero_id: heroId }, baseRev)),

  // ── 靜態設定（讀取）──

  // 唯讀：暫時的失敗會自動重試（見 READ_ONLY_ACTIONS）
  getSettings: (options?: ReadOptions) =>
    callGAS("get_settings", undefined, undefined, options),
  getHeroesConfig: (options?: ReadOptions) =>
    callGAS("get_heroes_config", undefined, undefined, options),
  getEnemiesConfig: (options?: ReadOptions) =>
    callGAS("get_enemies_config", undefined, undefined, options),
  getAllMaps: (options?: ReadOptions) =>
    callGAS("get_all_maps", undefined, undefined, options),
  getMapConfig: (mapId: string, options?: ReadOptions) =>
    callGAS("get_map_config", undefined, { map_id: mapId }, options),

  // ── 靜態設定（寫入）──

  /**
   * 批次覆寫整張 enemies_config sheet（需要管理密碼；密碼錯誤或後端沒設定時回 ADMIN_REQUIRED）
   */
  saveEnemiesConfig: (enemies: object[], adminToken: string) =>
    callGAS("save_enemies_config", undefined, {
      enemies,
      admin_token: adminToken,
    }),

  /**
   * 批次覆寫整張 heroes_config sheet（需要管理密碼；密碼錯誤或後端沒設定時回 ADMIN_REQUIRED）
   */
  saveHeroesConfig: (heroes: object[], adminToken: string) =>
    callGAS("save_heroes_config", undefined, {
      heroes,
      admin_token: adminToken,
    }),
};

// ── localStorage key 管理 ──

/**
 * 讀取目前的玩家 key（玩家自行設定，由設定頁寫入）
 * 尚未設定時回傳 null
 */
export function getPlayerKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("shenma_player_key");
}

/**
 * 將玩家 key 寫入 localStorage（設定頁確認後呼叫）
 */
export function setPlayerKey(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("shenma_player_key", key);
}
