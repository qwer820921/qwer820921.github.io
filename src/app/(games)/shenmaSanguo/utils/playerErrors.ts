/**
 * 把 playerStore 回傳的錯誤代碼轉成玩家看得懂的文字。
 * 代碼另外顯示在訊息旁，方便回報問題；不把後端或試算表的設定說明當成玩家文案。
 */
export function describePlayerError(code: string | null | undefined): string {
  switch (code) {
    case "NETWORK_ERROR":
      return "無法連線到伺服器，請確認網路連線後再試一次。";
    case "BAD_RESPONSE":
      return "伺服器回應異常，請稍後再試。";
    case "PROFILE_FORMAT_INVALID":
      return "存檔資料格式異常，暫時無法讀取。";
    case "PROFILE_NOT_FOUND":
      return "找不到這組金鑰的存檔，請再試一次。";
    case "UNSYNCED_SAVE_FAILED":
      return "目前的存檔還有尚未保存的進度，這次保存失敗，所以先不繼續。資料都還在，請確認網路後再試。";
    case "NOT_LOADED":
      return "玩家資料尚未載入。";
    default:
      return "伺服器暫時無法處理，請稍後再試。";
  }
}
