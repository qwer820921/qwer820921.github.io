// bobaSurvivors 型別定義
// 由於 iframe 嵌入，主要型別僅用於前端與可能未來的 postMessage 溝通
export interface BobaSurvivorsMessage {
  type: "GAME_READY" | "GAME_OVER" | "SCORE_UPDATE";
  payload?: any;
}
