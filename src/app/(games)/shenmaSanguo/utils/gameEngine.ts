import release from "./gameRelease.json";

/**
 * Web ↔ Godot 橋接協定的版本（和 Godot WebBridge.gd 的 BRIDGE_PROTOCOL 相同）
 * Godot 的 game_ready 帶這個版本；版本相同才送出關卡資料
 * 2：update_stats 與結算帶 battle_id（Round 9）
 * 3：防禦塔目標優先（Round 17）：set_tower_target 命令與 tower_target_changed 回覆。
 *    舊版遊戲不認得這個命令，所以提升版本：網頁對舊版遊戲顯示更新提示，不讓面板的選項默默失效
 * 4：備戰拆除防禦塔（Round 18）：sell_tower 命令與 tower_sell_result 回覆，面板多了投入與返還金額。
 *    舊版遊戲不認得拆除命令（網頁會等不到回覆），同樣提升版本
 * 5：戰鬥速度：set_game_speed 命令與 game_speed_result 回覆，update_stats 帶 speed／time_scale／deploy_slow；
 *    click_cell 帶 battle_id 與選單編號，關閉選單（resume_game）要帶回。舊版遊戲不認得速度命令（按鈕會默默沒有作用），同樣提升版本
 * 6：手動暫停：set_paused 命令 {battle_id, paused} 與 game_pause_result 回覆，update_stats 帶 paused。
 *    舊版遊戲不認得暫停命令（按鈕會默默沒有作用），同樣提升版本
 * 7：飛行敵人與對空：enemies_config 的 movement_type（flying 直線飛向終點、不被武將擋住），武將與防禦塔依職業／種類
 *    決定能不能攻擊飛行敵人（見 utils/antiAir）；show_upgrade_panel 帶 anti_air。舊版遊戲會把飛行敵人當成地面、
 *    所有單位都打得到，和網頁的說明不同，同樣提升版本。
 *    7 首次發布前另外加入（沒有再提升版本，網頁與遊戲產物必須同批發布）：敵人設定的 atk（對阻路武將的攻擊力）與
 *    trait 的 immune_slow（免疫減速）在遊戲裡生效（見 utils/enemyCombat）；關卡沒有波次時遊戲拒絕第 1 波，不再改用內建的測試波次
 */
export const BRIDGE_PROTOCOL = 7;

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

/**
 * 遊戲（Godot 匯出）目前入口的目錄：gameRelease.json 的 entry 是版本時是版本目錄 /games/shenmaSanguo-v/<版本>/
 * （每一版一個目錄，發布後內容不變），"legacy" 時是舊正式版的 /games/shenmaSanguo/（回退用）。
 * 發布與回退見 scripts/shenma-regression/tools/game-release.mjs
 */
export const GAME_DIR =
  release.entry === "legacy"
    ? "/games/shenmaSanguo/"
    : `/games/shenmaSanguo-v/${release.entry}/`;

/** 兩個入口（主頁、獨立戰鬥頁）的遊戲 iframe 網址 */
export const GAME_ENTRY = `${GAME_DIR}index.html`;

/** 遊戲的 Service Worker 範圍（遊戲目錄）：它用快取提供遊戲檔案 */
const GAME_SW_SCOPE = GAME_DIR;

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
