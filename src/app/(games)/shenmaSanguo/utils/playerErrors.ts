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
    case "UPGRADE_UNCONFIRMED":
      return "武將升級的結果還無法確認（連線中斷時，伺服器可能已完成，也可能沒有）。確認之前先不保存，以免蓋掉伺服器上的升級；本機的修改都還在。";
    case "UPGRADE_IN_PROGRESS":
      return "上一次升級還在處理中，請稍候。";
    case "UPGRADE_MERGE_CONFLICT":
      return "本機資料和待確認的升級無法自動合併，已保留本機資料，暫時不保存。";
    case "STALE_READ":
      return "讀到的資料比畫面上的舊，已保留目前的資料，請再試一次。";
    case "BATTLE_IN_PROGRESS":
      return "請先結算或離開目前戰鬥，再切換存檔。";
    case "BATTLE_ACCOUNT_CHANGED":
      return "這場戰鬥屬於切換前的存檔，結果沒有套用。";
    case "BATTLE_ALREADY_SETTLED":
      return "這場戰鬥已經結算過了。";
    case "BATTLE_NOT_CURRENT":
      return "這場戰鬥已經結束或離開，結果沒有套用。";
    case "ACCOUNT_CHANGED":
      return "存檔已切換，這次操作沒有套用。";
    case "SESSION_BLOCKED":
      return "網站更新的存檔處理還沒完成，暫停讀取與保存。請依畫面上方的提示重試。";
    case "REV_CONFLICT":
      return "雲端存檔在其他分頁或裝置更新過，這個分頁的修改先不保存。請用畫面下方的提示比較兩份資料後選擇要保留哪一份。";
    case "REV_CONFLICT_RELOADED":
      return "雲端存檔在其他分頁或裝置更新過，已載入雲端最新的資料，這次操作沒有套用。請確認後再試一次。";
    case "CONFLICT_CHANGED":
      return "雲端或這個分頁的資料在確認期間又有變化，比較內容已經更新，請重新確認。";
    case "NO_CONFLICT":
      return "目前沒有需要處理的存檔衝突。";
    case "RESOLVE_IN_PROGRESS":
      return "正在處理存檔衝突，請稍候。";
    case "WRITE_IN_PROGRESS":
      return "還有存檔正在寫入，請稍候再試。";
    case "UPGRADE_PENDING":
      return "武將升級的結果還在確認中，請先處理升級。";
    case "SETTLE_UNCONFIRMED":
      return "戰鬥結算的結果還無法確認（連線中斷時，伺服器可能已保存，也可能沒有）。確認之前先不保存也不切換，以免獎勵被寫兩次；本機的獎勵與修改都還在。請確認網路後按「重新確認」。";
    case "SETTLE_PENDING":
      return "戰鬥結算還在確認雲端是否已保存，請等確認完成後再處理。";
    case "SETTLE_MISMATCH":
      return "伺服器保存的戰鬥獎勵和畫面上的不同，已暫停保存；請用畫面下方的提示比較兩份資料後選擇。";
    case "RESULT_UNKNOWN":
      return "伺服器無法確認這場戰鬥是否已經結算過（時間太久），沒有再次發給獎勵；保存時請比較兩份資料後選擇。";
    case "REQUEST_ID_REUSED":
      return "伺服器上這場戰鬥的紀錄內容不同，沒有套用這次的結算；獎勵會隨一般的存檔保存。";
    case "INVALID_RESULT":
    case "INVALID_REWARD":
      return "戰鬥結果的資料不正確，這場沒有套用獎勵。";
    case "BUSY":
      return "伺服器忙碌中（同時有其他存檔正在寫入），請稍後再試。";
    case "DATA_CORRUPT":
      return "雲端存檔資料損毀，伺服器不接受讀取或覆寫；這個分頁的資料都還在，請匯出備份並回報問題。";
    case "INVALID_DATA":
      return "要保存的存檔格式不正確，伺服器沒有寫入。";
    case "DATA_TOO_LARGE":
      return "存檔太大，伺服器無法保存。";
    case "BASE_REV_REQUIRED":
      return "伺服器要求保存時附上存檔版本，這個分頁的版本不明。請用畫面下方的提示比較兩份資料後選擇。";
    case "BAD_BASE_REV":
      return "存檔版本的格式不正確，伺服器沒有寫入。請重新整理頁面。";
    case "NO_BACKUP":
      return "沒有可以放回的備份。";
    case "NO_VERSION":
      return "這份備份沒有雲端版本，無法安全地放回（放回後保存會直接覆蓋雲端），請改用匯出。";
    case "MIGRATION_HOLD":
      return "這個分頁的存檔暫停保存（網站更新時讀不回更新前的暫存，無法確認雲端上是否有較新的進度），這次操作沒有送出。";
    default:
      return "伺服器暫時無法處理，請稍後再試。";
  }
}
