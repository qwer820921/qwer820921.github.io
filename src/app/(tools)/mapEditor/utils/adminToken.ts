/**
 * 後端設定寫入（地圖、波次、武將、敵人）需要的管理密碼。
 * 只存在這個頁面的記憶體：不寫進程式、網址、localStorage、sessionStorage 或任何紀錄，重新整理後要重新輸入。
 * 後端回 ADMIN_REQUIRED（密碼錯誤或後端沒有設定）時清掉，下次儲存重新詢問
 */
let token: string | null = null;
let asker: (() => Promise<string | null>) | null = null;
let asking: Promise<string | null> | null = null;

/** 顯示輸入框的元件（AdminTokenPrompt）掛載時登記、卸載時取消 */
export function registerAdminTokenAsker(
  fn: (() => Promise<string | null>) | null
): void {
  asker = fn;
}

/**
 * 取得管理密碼：還沒輸入時跳出遮蔽的輸入框（同時只會有一個）。
 * 取消、空白或沒有輸入框時回傳 null，呼叫端不能送出請求
 */
export async function requireAdminToken(): Promise<string | null> {
  if (token) return token;
  if (!asker) return null;
  if (!asking) {
    asking = asker().finally(() => {
      asking = null;
    });
  }
  const input = await asking;
  const value = input?.trim() ?? "";
  if (value) token = value;
  return value || null;
}

/** 後端拒絕（ADMIN_REQUIRED）時清掉，下次重新詢問 */
export function forgetAdminToken(): void {
  token = null;
}

/** 沒有輸入管理密碼時的錯誤代碼（請求沒有送出） */
export const ADMIN_TOKEN_MISSING = "ADMIN_TOKEN_MISSING";

/** 設定寫入錯誤代碼的說明（其他代碼原樣顯示） */
export function adminErrorText(code: string): string {
  switch (code) {
    case ADMIN_TOKEN_MISSING:
      return "沒有輸入管理密碼，沒有送出";
    case "ADMIN_REQUIRED":
      return "管理密碼不正確（或後端沒有設定），已清除，下次儲存時重新輸入";
    case "BUSY":
      return "後端忙碌中，請稍後再試";
    case "BACKUP_FAILED":
      return "寫入前的備份沒有完成，設定沒有改變，請稍後再試";
    case "CONFIG_WRITE_FAILED":
      return "寫入到一半失敗；寫入前的完整內容已備份，再儲存一次會以備份為基準重寫";
    case "BACKUP_LIMIT":
      return "失敗留下的備份已到上限，請管理者在試算表的 _config_backups 確認後再儲存；這次沒有寫入";
    case "CONFIG_NEEDS_REPAIR":
      return "上一次寫入的結果不明，為了不蓋掉可以恢復的內容暫停寫入；請管理者依 _config_backups 處理";
    case "UNSUPPORTED_TEXT":
      return "有設定值以「=」或「'」開頭（試算表會當成公式，或去掉開頭的「'」），這次沒有寫入；請修改這些值後再儲存";
    case "CONFIG_HAS_FORMULAS":
      return "試算表的這張設定表裡有公式，為了不把公式換成固定值，這次沒有寫入；請管理者把公式改成值後再儲存";
    case "CONFIG_VERIFY_FAILED":
      return "寫入後讀回的內容和預期不同（可能是資料驗證、格式或保護範圍），寫入前的內容已備份；再儲存一次會先恢復備份再寫入";
    case "MOVEMENT_COLUMN_MISSING":
      return "試算表的 enemies_config 沒有 movement_type 欄（表頭名稱要完全相同），飛行的設定無法保存，這次沒有寫入任何資料；請先在試算表第一列加上 movement_type 欄、重新載入後再儲存，或把飛行改回地面";
    default:
      return code;
  }
}
