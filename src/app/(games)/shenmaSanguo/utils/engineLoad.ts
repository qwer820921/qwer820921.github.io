/**
 * 遊戲引擎的載入進度：從同源的遊戲 iframe（Godot 匯出的外殼頁，目錄見 gameEngine.ts 的 GAME_ENTRY）讀取外殼頁自己顯示的狀態，
 * 不改遊戲產物。外殼頁的狀態：
 * - #status-progress 顯示：下載引擎（index.wasm）與遊戲資料（index.pck）。value／max 是已下載／總共的位元組（解壓縮後的大小），
 *   還不知道大小時沒有 value
 * - #status-notice 顯示：引擎無法啟動（Godot 的錯誤訊息，英文）
 * - #status 已移除：引擎已啟動，等遊戲送出 game_ready
 * - #status 還在但兩者都沒顯示：還沒開始下載（瀏覽器缺少需要的功能時外殼頁不會啟動引擎，也不顯示任何訊息）
 * 下載完成到引擎啟動之間（編譯 WebAssembly，手機上可能要十幾秒）進度停在最後，算成啟動中
 */
export type EngineLoadPhase =
  | "page" // 外殼頁還沒載入
  | "waiting" // 外殼頁已載入，還沒開始下載
  | "download" // 下載中
  | "starting" // 下載完成、引擎啟動中，或已啟動在等 game_ready
  | "failed" // 外殼頁顯示錯誤訊息
  | "unsupported"; // 瀏覽器缺少需要的功能

export interface EngineShellState {
  phase: EngineLoadPhase;
  /** 已下載的位元組（download 才有；不知道時是 0） */
  loaded: number;
  /** 總共的位元組（download 才有；不知道時是 0） */
  total: number;
  /** failed：外殼頁的錯誤訊息；unsupported：缺少的功能 */
  notice: string;
}

const state = (
  phase: EngineLoadPhase,
  loaded = 0,
  total = 0,
  notice = ""
): EngineShellState => ({ phase, loaded, total, notice });

/** 讀取遊戲 iframe 外殼頁目前的狀態（讀不到時是 page） */
export function readEngineShell(
  frame: HTMLIFrameElement | null
): EngineShellState {
  let doc: Document | null = null;
  try {
    doc = frame?.contentDocument ?? null;
  } catch {
    doc = null;
  }
  if (!doc || !doc.getElementById("canvas")) return state("page");
  const status = doc.getElementById("status");
  if (!status) return state("starting");
  const notice = doc.getElementById("status-notice");
  if (notice && notice.style.display === "block") {
    return state(
      "failed",
      0,
      0,
      (notice.textContent || "").replace(/\s+/g, " ").trim()
    );
  }
  const bar = doc.getElementById("status-progress") as HTMLProgressElement;
  if (bar && bar.style.display === "block") {
    const total = bar.hasAttribute("max") ? Number(bar.max) : 0;
    const loaded = bar.hasAttribute("value") ? Number(bar.value) : 0;
    if (total > 0 && loaded >= total) return state("starting");
    return state("download", loaded, total);
  }
  return state("waiting");
}

/**
 * 這個瀏覽器缺少的、執行遊戲需要的功能（和 Godot 外殼頁沒有多執行緒時的檢查相同：WebGL2、fetch、安全連線）。
 * 檢查 WebGL2 會建立一個暫時的繪圖環境，用完立即釋放；只在外殼頁一直沒有開始下載時呼叫
 */
export function missingEngineFeatures(): string[] {
  const missing: string[] = [];
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) missing.push("WebGL2");
    else gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    missing.push("WebGL2");
  }
  if (typeof fetch !== "function") missing.push("fetch");
  if (!window.isSecureContext) missing.push("安全連線（HTTPS）");
  return missing;
}

/** 多久沒有進展算是停住了（秒）：下載與等待時 30 秒；啟動中（手機編譯 WebAssembly 較久）90 秒 */
export const ENGINE_STALL_SEC = 30;
export const ENGINE_START_STALL_SEC = 90;
/** 外殼頁已載入卻一直沒有開始下載，等這麼久（毫秒）才檢查瀏覽器缺少的功能 */
export const ENGINE_FEATURE_CHECK_MS = 5000;

const mb = (bytes: number) => (bytes / 1048576).toFixed(1);

/** 載入畫面上遊戲引擎那一行的文字 */
export function engineLoadText(s: EngineShellState, ready: boolean): string {
  if (ready) return "遊戲引擎：完成";
  switch (s.phase) {
    case "download":
      return s.total > 0
        ? `遊戲引擎：下載中 ${mb(s.loaded)} / ${mb(s.total)} MB`
        : "遊戲引擎：下載中";
    case "starting":
      return "遊戲引擎：啟動中";
    default:
      return "遊戲引擎：準備下載";
  }
}

/** 遊戲引擎占整體進度的比例（0～1）：下載依位元組，下載完成、啟動中算 0.95，就緒才是 1 */
export function engineLoadRatio(s: EngineShellState, ready: boolean): number {
  if (ready) return 1;
  if (s.phase === "starting") return 0.95;
  if (s.phase === "download" && s.total > 0) {
    return Math.min(0.9, (s.loaded / s.total) * 0.9);
  }
  return 0;
}
