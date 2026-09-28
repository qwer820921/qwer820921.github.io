/**
 * Web ↔ Godot 橋接協定的版本（和 Godot WebBridge.gd 的 BRIDGE_PROTOCOL 相同）
 * Godot 的 game_ready 帶這個版本；版本相同才送出關卡資料
 * 2：update_stats 與結算帶 battle_id（Round 9）
 * 3：防禦塔目標優先（Round 17）：set_tower_target 命令與 tower_target_changed 回覆。
 *    舊版遊戲不認得這個命令，所以提升版本：網頁對舊版遊戲顯示更新提示，不讓面板的選項默默失效
 */
export const BRIDGE_PROTOCOL = 3;

/**
 * 遊戲引擎的狀態
 * - loading：還沒收到 game_ready（遊戲載入中，只是慢不代表版本不對）
 * - ready：協定版本相同，可以送出關卡資料
 * - incompatible：已回覆 game_ready，但協定版本不同（通常是瀏覽器還在用舊版遊戲的快取）
 */
export type EngineStatus = "loading" | "ready" | "incompatible";

/** game_ready 的協定版本是否和網頁相同（舊版遊戲的 game_ready 沒有 protocol） */
export function isCompatibleEngine(data: { protocol?: unknown }): boolean {
  return data.protocol === BRIDGE_PROTOCOL;
}

/** 遊戲（Godot 匯出）的 Service Worker 範圍：它用快取提供遊戲檔案 */
const GAME_SW_SCOPE = "/games/shenmaSanguo/";

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | "timeout"> =>
  Promise.race([
    p,
    new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), ms)
    ),
  ]);

/** 等 Service Worker 進入指定狀態之一（逾時也回傳，由呼叫端看最後的狀態） */
const waitForWorker = (
  worker: ServiceWorker,
  states: ServiceWorkerState[],
  ms: number
) =>
  withTimeout(
    new Promise<void>((resolve) => {
      if (states.includes(worker.state)) return resolve();
      const onChange = () => {
        if (!states.includes(worker.state)) return;
        worker.removeEventListener("statechange", onChange);
        resolve();
      };
      worker.addEventListener("statechange", onChange);
    }),
    ms
  );

/**
 * 重新載入遊戲前，讓遊戲的 Service Worker 換成伺服器上的最新版本
 * 遊戲的 Service Worker 先用快取提供檔案；舊版本在有頁面使用時不會自己換掉，重新載入仍會拿到舊版遊戲。
 * - 只處理遊戲自己的 Service Worker，不動網站其他的 Service Worker、快取或儲存資料
 * - 檢查更新；新版本安裝完成後請它接管（接管時它會刪除舊版本的快取）
 * - 任何一步失敗或逾時都只回報結果：呼叫端照常重新載入遊戲，仍然不相符時再顯示提示，不會自動重試
 */
export async function activateLatestGameWorker(
  timeoutMs = 15000
): Promise<"none" | "unchanged" | "activated" | "failed"> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return "none";
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration(GAME_SW_SCOPE);
    // 沒有遊戲自己的註冊時，會拿到網站根目錄的 Service Worker：不處理
    if (!reg || !new URL(reg.scope).pathname.endsWith(GAME_SW_SCOPE)) {
      return "none";
    }
    if ((await withTimeout(reg.update(), timeoutMs)) === "timeout") {
      return "failed";
    }
    const pending = reg.installing ?? reg.waiting;
    if (!pending) return "unchanged";
    await waitForWorker(
      pending,
      ["installed", "activated", "redundant"],
      timeoutMs
    );
    if (pending.state === "installed") {
      // 遊戲的 Service Worker 收到 "claim" 會立即接管（skipWaiting＋clients.claim）
      pending.postMessage("claim");
      await waitForWorker(pending, ["activated", "redundant"], timeoutMs);
    }
    return pending.state === "activated" ? "activated" : "failed";
  } catch {
    return "failed";
  }
}
