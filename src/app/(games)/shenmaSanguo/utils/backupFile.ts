// 離線備份檔（存檔衝突時匯出的 JSON）的讀取與驗證（純函式，不含畫面）：
// 只用來唯讀預覽與比較。匯出檔不含存檔金鑰、無法確認屬於哪個帳號，
// 所以不提供匯入、保存或覆蓋，也不採用檔案裡的版本號
import { HeroState, PlayerState, TeamSlot } from "../types";

/** 匯出檔的格式標記與版本（buildExport 寫入）；沒有標記的是加入標記前的舊匯出（版本 0） */
export const BACKUP_FILE_FORMAT = "shenma-save-backup";
export const BACKUP_FILE_VERSION = 1;
/** 檔案大小上限（一般的匯出只有幾 KB） */
export const MAX_BACKUP_FILE_BYTES = 512 * 1024;

const MAX_TEXT = 200; // 暱稱、關卡、武將 id 等文字的長度上限
const MAX_HEROES = 300;
const MAX_TEAM = 50;
const MAX_DEPTH = 12; // 巢狀層數上限（其他欄位）
const MAX_NODES = 20000; // 整個檔案的值數量上限
const FORBIDDEN_KEYS = ["__proto__", "constructor", "prototype"];

export type BackupFileError =
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "READ_FAILED"
  | "INVALID_JSON"
  | "NOT_OBJECT"
  | "UNKNOWN_FORMAT"
  | "UNSUPPORTED_VERSION"
  | "TOO_COMPLEX"
  | "INVALID_FIELD";

/** 驗證通過的備份檔內容（兩份存檔都不含存檔金鑰） */
export interface BackupPreview {
  /** 檔案格式版本；0 是加入格式標記前的匯出 */
  version: number;
  exportedAt: string;
  reason: string;
  /** 匯出時這個分頁的資料 */
  local: PlayerState;
  /** 這個分頁的資料根據的雲端版本（不明時 null） */
  localBaseRev: number | null;
  /** 匯出時雲端的資料（雲端損毀或讀不到時 null） */
  cloud: PlayerState | null;
  cloudRev: number | null;
}

export type BackupParseResult =
  | { ok: true; backup: BackupPreview }
  | { ok: false; error: BackupFileError; field?: string };

type Json = unknown;

class Invalid extends Error {
  constructor(
    public code: BackupFileError,
    public field?: string
  ) {
    super(code);
  }
}

const isObject = (v: Json): v is Record<string, Json> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 走訪整個檔案：層數、值的數量、禁止的鍵名 */
function scan(v: Json, depth: number, counter: { n: number }, path: string) {
  counter.n += 1;
  if (counter.n > MAX_NODES || depth > MAX_DEPTH) {
    throw new Invalid("TOO_COMPLEX", path);
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => scan(x, depth + 1, counter, `${path}[${i}]`));
  } else if (isObject(v)) {
    for (const k of Object.keys(v)) {
      if (FORBIDDEN_KEYS.includes(k)) throw new Invalid("INVALID_FIELD", path);
      scan(v[k], depth + 1, counter, path ? `${path}.${k}` : k);
    }
  }
}

function text(v: Json, field: string, allowEmpty = true): string {
  if (typeof v !== "string" || v.length > MAX_TEXT || (!allowEmpty && !v)) {
    throw new Invalid("INVALID_FIELD", field);
  }
  return v;
}

/** 有限、非負的數字 */
function count(v: Json, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    throw new Invalid("INVALID_FIELD", field);
  }
  return v;
}

/** 非負整數或 null（雲端版本） */
function revOrNull(v: Json, field: string): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    throw new Invalid("INVALID_FIELD", field);
  }
  return v;
}

function hero(v: Json, field: string): HeroState {
  if (!isObject(v)) throw new Invalid("INVALID_FIELD", field);
  const out: Record<string, Json> = { ...v };
  out.hero_id = text(v.hero_id, `${field}.hero_id`, false);
  for (const k of ["level", "star", "atk", "def", "hp"]) {
    if (k in v || k === "level") out[k] = count(v[k], `${field}.${k}`);
  }
  for (const k of ["attack_range", "attack_speed"]) {
    if (k in v) out[k] = count(v[k], `${field}.${k}`);
  }
  return out as unknown as HeroState;
}

function teamSlot(v: Json, field: string): TeamSlot {
  if (!isObject(v)) throw new Invalid("INVALID_FIELD", field);
  const slot = count(v.slot, `${field}.slot`);
  if (!Number.isInteger(slot))
    throw new Invalid("INVALID_FIELD", `${field}.slot`);
  return { ...v, hero_id: text(v.hero_id, `${field}.hero_id`, false), slot };
}

/** 一份存檔：檢查已知欄位的型別與範圍，其他欄位保留（比較時只標示是否不同）；拿掉存檔金鑰 */
function player(v: Json, field: string): PlayerState {
  if (!isObject(v)) throw new Invalid("INVALID_FIELD", field);
  if (!Array.isArray(v.heroes) || v.heroes.length > MAX_HEROES) {
    throw new Invalid("INVALID_FIELD", `${field}.heroes`);
  }
  if (
    v.team !== undefined &&
    (!Array.isArray(v.team) || v.team.length > MAX_TEAM)
  ) {
    throw new Invalid("INVALID_FIELD", `${field}.team`);
  }
  const out: Record<string, Json> = { ...v };
  delete out.key;
  out.nickname = text(v.nickname, `${field}.nickname`);
  for (const k of ["level", "exp", "gold", "capacity"]) {
    out[k] = count(v[k], `${field}.${k}`);
  }
  out.max_stage = text(v.max_stage, `${field}.max_stage`);
  out.heroes = v.heroes.map((h, i) => hero(h, `${field}.heroes[${i}]`));
  out.team = ((v.team as Json[] | undefined) ?? []).map((t, i) =>
    teamSlot(t, `${field}.team[${i}]`)
  );
  return out as unknown as PlayerState;
}

/**
 * 解析並驗證備份檔的文字內容（不信任檔名與檔案類型，一律檢查結構）。
 * 支援 buildExport 的格式：有格式標記的版本 1，以及沒有標記的舊匯出；未知的格式或較新的版本一律拒絕
 */
export function parseBackupFile(raw: string): BackupParseResult {
  if (raw.length > MAX_BACKUP_FILE_BYTES) {
    return { ok: false, error: "FILE_TOO_LARGE" };
  }
  if (!raw.trim()) return { ok: false, error: "EMPTY_FILE" };
  let data: Json;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "INVALID_JSON" };
  }
  if (!isObject(data)) return { ok: false, error: "NOT_OBJECT" };
  try {
    scan(data, 0, { n: 0 }, "");
    let version = 0;
    if ("format" in data || "version" in data) {
      if (data.format !== BACKUP_FILE_FORMAT) {
        return { ok: false, error: "UNKNOWN_FORMAT" };
      }
      if (
        typeof data.version !== "number" ||
        !Number.isInteger(data.version) ||
        data.version < 1
      ) {
        return { ok: false, error: "INVALID_FIELD", field: "version" };
      }
      if (data.version > BACKUP_FILE_VERSION) {
        return { ok: false, error: "UNSUPPORTED_VERSION" };
      }
      version = data.version;
    } else if (
      !("this_tab" in data) ||
      !("cloud" in data) ||
      !("exported_at" in data)
    ) {
      // 沒有格式標記，也不是舊匯出的結構
      return { ok: false, error: "UNKNOWN_FORMAT" };
    }
    const exportedAt = text(data.exported_at, "exported_at", false);
    if (Number.isNaN(Date.parse(exportedAt))) {
      throw new Invalid("INVALID_FIELD", "exported_at");
    }
    return {
      ok: true,
      backup: {
        version,
        exportedAt,
        reason: data.reason === undefined ? "" : text(data.reason, "reason"),
        local: player(data.this_tab, "this_tab"),
        localBaseRev: revOrNull(data.this_tab_base_rev, "this_tab_base_rev"),
        cloud: data.cloud === null ? null : player(data.cloud, "cloud"),
        cloudRev: revOrNull(data.cloud_rev, "cloud_rev"),
      },
    };
  } catch (e) {
    if (e instanceof Invalid)
      return { ok: false, error: e.code, field: e.field };
    return { ok: false, error: "INVALID_FIELD" };
  }
}

/** 讀不出來的原因（顯示給玩家） */
export function backupFileErrorText(
  error: BackupFileError,
  field?: string
): string {
  switch (error) {
    case "EMPTY_FILE":
      return "檔案是空的。";
    case "FILE_TOO_LARGE":
      return `檔案太大（上限 ${Math.round(MAX_BACKUP_FILE_BYTES / 1024)} KB），不像是神馬三國的存檔備份。`;
    case "READ_FAILED":
      return "檔案讀取失敗，請重新選擇。";
    case "INVALID_JSON":
      return "檔案不是有效的 JSON，可能已損毀或不是存檔備份。";
    case "NOT_OBJECT":
    case "UNKNOWN_FORMAT":
      return "不是神馬三國的存檔備份檔（格式不符）。";
    case "UNSUPPORTED_VERSION":
      return "這個備份檔來自較新的版本，目前的網頁無法讀取。";
    case "TOO_COMPLEX":
      return "檔案內容的結構太複雜，不像是神馬三國的存檔備份。";
    case "INVALID_FIELD":
      return field
        ? `備份檔的內容不正確（欄位：${field}）。`
        : "備份檔的內容不正確。";
  }
}

/** 匯出原因的說明 */
export function backupReasonText(reason: string): string {
  switch (reason) {
    case "conflict":
      return "存檔衝突時從比較視窗匯出";
    case "used_cloud":
      return "處理衝突時使用了雲端版本（這個分頁的資料被放棄）";
    case "kept_this_tab":
      return "處理衝突時保留了這個分頁（雲端的資料被覆蓋）";
    default:
      return reason ? `其他（${reason}）` : "未記錄";
  }
}
