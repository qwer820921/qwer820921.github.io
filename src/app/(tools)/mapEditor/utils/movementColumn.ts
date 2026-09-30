import { movementOf } from "@/app/(games)/shenmaSanguo/utils/antiAir";

/**
 * 敵人設定表（enemies_config）有沒有 movement_type 欄。
 * 後端依表頭寫入：試算表沒有這一欄時移動方式不會被保存，遊戲一律當作地面。
 * 所以飛行的設定只有在「確定有這一欄」時才送出；無法確認時擋下並說明原因，不能當成有，也不能說成沒有。
 * - 後端回應附表頭（columns）時以表頭為準：空表也能判斷
 * - 舊後端沒有表頭資訊：有資料列時用資料列推定（後端讀取時每一列都帶全部表頭欄位）；沒有資料列時無法確認
 * - 還沒載入、載入失敗：無法確認
 * 後端（新版）儲存時也會在寫入前再檢查一次表頭，載入之後表頭才被移除時由後端拒絕（MOVEMENT_COLUMN_MISSING）
 */
export const MOVEMENT_COLUMN = "movement_type";

export type MovementColumnState =
  | { status: "present"; source: "columns" | "rows" }
  | { status: "missing"; source: "columns" | "rows" | "save" }
  | {
      status: "unknown";
      reason: "not_loaded" | "load_failed" | "no_rows" | "rows_mixed";
    };

export const COLUMN_NOT_LOADED: MovementColumnState = {
  status: "unknown",
  reason: "not_loaded",
};

export const COLUMN_LOAD_FAILED: MovementColumnState = {
  status: "unknown",
  reason: "load_failed",
};

/** 儲存時後端回報沒有這一欄（載入之後表頭才被移除，或舊資料推定錯誤） */
export const COLUMN_MISSING_ON_SAVE: MovementColumnState = {
  status: "missing",
  source: "save",
};

const hasOwn = (o: unknown, key: string) =>
  !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, key);

/** 從 get_enemies_config 的回應判斷 */
export function movementColumnFromLoad(data: {
  enemies?: unknown;
  columns?: unknown;
}): MovementColumnState {
  if (Array.isArray(data.columns)) {
    return data.columns.some((c) => c === MOVEMENT_COLUMN)
      ? { status: "present", source: "columns" }
      : { status: "missing", source: "columns" };
  }
  const list = Array.isArray(data.enemies) ? data.enemies : [];
  if (list.length === 0) return { status: "unknown", reason: "no_rows" };
  const withColumn = list.filter((e) => hasOwn(e, MOVEMENT_COLUMN)).length;
  if (withColumn === list.length) return { status: "present", source: "rows" };
  if (withColumn === 0) return { status: "missing", source: "rows" };
  return { status: "unknown", reason: "rows_mixed" };
}

/** 遊戲會當作飛行的列數（和遊戲相同的判讀：去掉前後空白後等於 flying） */
export const flyingRowCount = (rows: { movement_type?: unknown }[]): number =>
  rows.filter((r) => movementOf(r.movement_type).value === "flying").length;

/** 無法確認有沒有這一欄的原因與可以採取的操作 */
export function unknownColumnText(state: MovementColumnState): string | null {
  if (state.status !== "unknown") return null;
  switch (state.reason) {
    case "not_loaded":
      return "還沒有從 Sheet 載入，尚無法確認試算表有沒有 movement_type 欄。請先按「從 Sheet 載入」";
    case "load_failed":
      return "上一次從 Sheet 載入失敗，尚無法確認試算表有沒有 movement_type 欄。請重新載入，成功後再儲存";
    case "no_rows":
      return "試算表目前沒有資料列，後端也沒有回報表頭（舊版後端），尚無法確認有沒有 movement_type 欄。可以先把移動方式設為地面儲存、重新載入後就能確認；或請管理者確認試算表第一列有 movement_type 欄，並更新到會回報表頭的後端";
    case "rows_mixed":
      return "讀到的資料列有的有 movement_type、有的沒有，尚無法確認試算表有沒有這一欄。請重新載入";
  }
}

/** 確定沒有這一欄時的說明 */
export function missingColumnText(state: MovementColumnState): string | null {
  if (state.status !== "missing") return null;
  return state.source === "save"
    ? "儲存時後端回報試算表的 enemies_config 沒有 movement_type 欄（可能在載入後被移除），這次沒有寫入任何資料。請在試算表第一列加上 movement_type 欄、重新載入後再儲存，或把飛行改回地面"
    : "試算表的 enemies_config 沒有 movement_type 欄：移動方式不會被保存（遊戲一律當作地面）。請先在試算表第一列加上 movement_type 欄（名稱要完全相同）並重新載入；含飛行設定的儲存會被擋下";
}

/**
 * 儲存前的檢查：有飛行的列，而且不確定試算表有 movement_type 欄時，回傳不能儲存的原因（不送出請求）；
 * 可以儲存時回傳 null。沒有飛行的列（只改地面資料）一律不擋
 */
export function flyingSaveProblem(
  state: MovementColumnState,
  rows: { movement_type?: unknown }[]
): string | null {
  const flying = flyingRowCount(rows);
  if (flying === 0 || state.status === "present") return null;
  const head = `有 ${flying} 列設定為飛行，但`;
  if (state.status === "missing") {
    return `${head}試算表的 enemies_config 沒有 movement_type 欄，飛行的設定不會被保存，這次沒有送出。請先在試算表第一列加上 movement_type 欄、重新載入後再設定，或把這些列改回地面`;
  }
  return `${head}${unknownColumnText(state)}。這次沒有送出（地面的資料不受影響）`;
}
