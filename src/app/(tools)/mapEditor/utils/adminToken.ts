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
    // 以下是波次保存的地圖檢查（新版後端才會回；目前正式後端不檢查地圖是否存在）
    case "MISSING_MAP_ID":
      return "map_id 是空的，這次沒有寫入";
    case "MAP_NOT_FOUND":
      return "設定裡（maps_config）沒有這張地圖，可能還沒新增或剛被刪除；這次沒有寫入。請先按「新增至 Sheet」新增地圖，再儲存";
    case "MAP_ID_DUPLICATE":
      return "設定裡（maps_config）有兩列以上是這個 map_id，無法確定是哪一張地圖；這次沒有寫入。請管理者先刪除重複的列";
    case "MAPS_SHEET_MISSING":
      return "試算表找不到 maps_config 工作表，無法確認地圖是否存在；這次沒有寫入，請管理者檢查試算表";
    case "MAPS_HEADER_INVALID":
      return "試算表 maps_config 第一列沒有 map_id 欄（或有兩個以上），無法確認地圖是否存在；這次沒有寫入，請管理者檢查表頭";
    case "CHECK_ERROR":
      // 寫入前（written: false）的說明見 adminFailureText；只有代碼時不能確定有沒有寫入
      return "後端確認地圖時發生錯誤，回應沒有說明是否已寫入；不會自動重送，請先唯讀核對設定裡的內容";
    case "MAP_CHANGED_DURING_SAVE":
      return "已寫入，但寫入後設定裡找不到這張地圖（或變成重複的 map_id），後端不算保存成功、沒有自動還原；請管理者依 _config_backups 狀態 check_failed 的那一列處理";
    case "POSTWRITE_CHECK_ERROR":
      return "已寫入並讀回核對，但寫入後確認地圖時發生錯誤（不知道地圖還在不在），後端不算保存成功、沒有自動還原；請不要直接重送，先唯讀核對設定，再由管理者依 _config_backups 狀態 check_failed 的那一列處理";
    default:
      return code;
  }
}

/** 設定寫入失敗的回應裡和「有沒有寫入」有關的欄位（新版後端才有；沒有給的是 null） */
export type AdminWriteInfo = {
  /** 後端明確回答設定表有沒有被改（true／false） */
  written: boolean | null;
  /** 檢查的階段：precheck 建立寫入計畫之前、prewrite 改主表之前、postwrite 寫入之後 */
  stage: string | null;
  /** _config_backups 這次那一列的狀態（例如 check_failed、not_applied） */
  journalStatus: string | null;
  /** 寫入前完整內容所在的備份工作表 */
  backup: string | null;
  opId: string | null;
};

export const NO_WRITE_INFO: AdminWriteInfo = {
  written: null,
  stage: null,
  journalStatus: null,
  backup: null,
  opId: null,
};

/** 從後端的錯誤回應取出 AdminWriteInfo（型別不對的欄位當成沒有給） */
export function adminWriteInfoOf(data: unknown): AdminWriteInfo {
  const d = (data && typeof data === "object" ? data : {}) as Record<
    string,
    unknown
  >;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    written: typeof d.written === "boolean" ? d.written : null,
    stage: str(d.stage),
    journalStatus: str(d.journal_status),
    backup: str(d.backup),
    opId: str(d.op_id),
  };
}

/** 在任何寫入之前就拒絕的錯誤代碼：設定表一定沒有改變 */
const NOT_WRITTEN_CODES = new Set([
  ADMIN_TOKEN_MISSING,
  "ADMIN_REQUIRED",
  "BUSY",
  "BACKUP_FAILED",
  "BACKUP_LIMIT",
  "CONFIG_NEEDS_REPAIR",
  "UNSUPPORTED_TEXT",
  "CONFIG_HAS_FORMULAS",
  "MOVEMENT_COLUMN_MISSING",
  "MISSING_MAP_ID",
  "MAP_NOT_FOUND",
  "MAP_ID_DUPLICATE",
  "MAPS_SHEET_MISSING",
  "MAPS_HEADER_INVALID",
  "MAP_ID_EXISTS",
  "MISSING_PATH_JSON",
  "MISSING_NAME",
  "MISSING_WAVES",
  "INVALID_WAVES",
  "DATA_TOO_LARGE",
  "TOO_MANY_ROWS",
  "EMPTY_LIST",
  "INVALID_ROW",
  "MISSING_ID",
  "DUPLICATE_ID",
  "SHEET_NOT_FOUND",
  "BAD_SHEET_HEADERS",
  "BAD_REQUEST",
  "UNKNOWN_ACTION",
]);

/** 只會在寫入之後回的錯誤代碼：設定表已經寫入 */
const WRITTEN_CODES = new Set([
  "MAP_CHANGED_DURING_SAVE",
  "POSTWRITE_CHECK_ERROR",
]);

/**
 * 這次失敗有沒有改到設定表：後端的 written 優先；沒有給時依代碼，只有「在任何寫入之前就拒絕」的代碼算沒有改，
 * 其他（寫到一半、讀回不同、看不懂的錯誤）都是不能確定，不能說成沒有改變
 */
export function adminWriteState(
  code: string,
  info: AdminWriteInfo
): "written" | "not_written" | "unknown" {
  if (info.written === true) return "written";
  if (info.written === false) return "not_written";
  if (WRITTEN_CODES.has(code)) return "written";
  return NOT_WRITTEN_CODES.has(code) ? "not_written" : "unknown";
}

/**
 * 設定寫入失敗的說明：代碼的說明，再依有沒有寫入修正。已寫入（written: true）時一律說明已寫入、不算成功、
 * 沒有自動還原、不要直接重送，並附備份與紀錄，讓管理者找到 _config_backups 的那一列
 */
export function adminFailureText(code: string, info: AdminWriteInfo): string {
  const state = adminWriteState(code, info);
  if (state === "written") {
    const base = WRITTEN_CODES.has(code)
      ? adminErrorText(code)
      : `已寫入（後端回報 ${code}），但後端不算保存成功、沒有自動還原；請不要直接重送，先唯讀核對設定，再由管理者依 _config_backups 處理`;
    const ref = [
      info.journalStatus && `紀錄狀態 ${info.journalStatus}`,
      info.backup && `寫入前的內容在 ${info.backup}`,
      info.opId && `op_id ${info.opId}`,
    ].filter(Boolean);
    return ref.length ? `${base}（${ref.join("、")}）` : base;
  }
  if (code === "CHECK_ERROR" && state === "not_written") {
    return "後端確認地圖時發生錯誤（寫入之前），這次沒有寫入，請稍後再試";
  }
  return adminErrorText(code);
}
