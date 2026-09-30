"use client";
import React, { useState } from "react";
import styles from "../../styles/objectTab.module.css";
import { EnemyConfig } from "../../types";
import { gameApi, GasError } from "@/app/(games)/shenmaSanguo/api/gameApi";
import {
  MOVEMENT_TYPES,
  movementOf,
} from "@/app/(games)/shenmaSanguo/utils/antiAir";
import {
  ADMIN_TOKEN_MISSING,
  adminErrorText,
  forgetAdminToken,
  requireAdminToken,
} from "../../utils/adminToken";
import {
  COLUMN_LOAD_FAILED,
  COLUMN_MISSING_ON_SAVE,
  COLUMN_NOT_LOADED,
  MOVEMENT_COLUMN,
  MovementColumnState,
  flyingRowCount,
  flyingSaveProblem,
  missingColumnText,
  movementColumnFromLoad,
  unknownColumnText,
} from "../../utils/movementColumn";

// 數值欄位
const NUM_FIELDS: (keyof EnemyConfig)[] = [
  "level",
  "speed",
  "hp",
  "atk",
  "armor",
  "attack_range",
];

const MOVEMENT_KEY = MOVEMENT_COLUMN;

/**
 * 移動方式（movement_type）的選單：只提供遊戲的值（地面 ground、飛行 flying，規則和遊戲共用 utils/antiAir）。
 * - 空白（舊資料沒有設定）照原樣保留，遊戲當作地面
 * - 試算表裡遊戲不認得的寫法（例如 Flying、air、前後有空白）保留原值：選單多一個「原值」選項並標成黃色，
 *   載入、重新繪製都不改寫，只有在選單選了新的值並儲存時才改變（沒動的列照原值送回）
 */
const movementOptionLabel = (raw: string) => {
  if (raw === "") return "（未設定：遊戲當作地面）";
  const m = movementOf(raw);
  return m.known
    ? `${m.label}（${raw}）`
    : `「${raw}」（遊戲不認得，當作${m.label}；保留原值）`;
};

// 所有欄位順序（對應 GAS sheet）
const COLUMNS: { key: keyof EnemyConfig; label: string; wide?: boolean }[] = [
  { key: "enemy_id", label: "enemy_id", wide: true },
  { key: "name", label: "名稱", wide: true },
  { key: MOVEMENT_KEY, label: "移動方式" },
  { key: "type", label: "類型" },
  { key: "level", label: "等級" },
  { key: "speed", label: "速度" },
  { key: "hp", label: "HP" },
  { key: "atk", label: "ATK" },
  { key: "armor", label: "護甲" },
  { key: "attack_range", label: "射程" },
  { key: "trait", label: "特性", wide: true },
  { key: "notes", label: "備注", wide: true },
  { key: "image", label: "圖片", wide: true },
  { key: "attack_image", label: "攻擊圖", wide: true },
];

function makeBlank(): EnemyConfig {
  return {
    enemy_id: "",
    name: "",
    type: "",
    level: 1,
    speed: 60,
    hp: 100,
    atk: 10,
    armor: 0,
    attack_range: 1,
    trait: "",
    notes: "",
    image: "",
    attack_image: "",
    movement_type: "ground",
  };
}

type Status = "idle" | "loading" | "saving" | "ok" | "error";

export default function EnemyConfigEditor() {
  const [rows, setRows] = useState<EnemyConfig[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");
  // 試算表有沒有 movement_type 這一欄（判斷規則見 utils/movementColumn）：
  // 後端只寫入試算表已有的欄位，沒有這一欄時移動方式不會被保存；只有確定有這一欄時才送出飛行的設定
  const [movementColumn, setMovementColumn] =
    useState<MovementColumnState>(COLUMN_NOT_LOADED);

  const setS = (s: Status, m: string) => {
    setStatus(s);
    setMsg(m);
  };

  // ── 讀取 ──
  const handleLoad = async () => {
    setS("loading", "讀取中...");
    try {
      const data = await gameApi.getEnemiesConfig();
      if (data.status !== 200) throw new Error(data.error || "讀取失敗");
      const list = (data.enemies as EnemyConfig[]) || [];
      setRows(list);
      setMovementColumn(movementColumnFromLoad(data));
      setS("ok", `✓ 已載入 ${list.length} 筆`);
    } catch (e) {
      // 表格保留上一次的內容，但試算表現在的欄位無法確認
      setMovementColumn(COLUMN_LOAD_FAILED);
      setS("error", `✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // ── 新增列 ──
  const handleAdd = () => setRows((prev) => [...prev, makeBlank()]);

  // ── 刪除列 ──
  const handleDelete = (i: number) =>
    setRows((prev) => prev.filter((_, idx) => idx !== i));

  // ── 編輯格 ──
  const handleChange = (i: number, key: keyof EnemyConfig, value: string) => {
    setRows((prev) =>
      prev.map((row, idx) =>
        idx !== i
          ? row
          : {
              ...row,
              [key]: NUM_FIELDS.includes(key) ? Number(value) : value,
            }
      )
    );
  };

  // ── 儲存 ──
  const handleSave = async () => {
    setS("saving", "儲存中...");
    try {
      // 有飛行的列時，要確定試算表有 movement_type 欄才送出（沒有這一欄時飛行的設定會被丟掉，遊戲當作地面）
      const problem = flyingSaveProblem(movementColumn, rows);
      if (problem) throw new Error(problem);
      // 管理密碼：沒有輸入就不送出
      const token = await requireAdminToken();
      if (!token) throw new Error(ADMIN_TOKEN_MISSING);
      const data = await gameApi.saveEnemiesConfig(rows, token);
      if (data.status !== 200) throw new Error(data.error || "儲存失敗");
      setS("ok", `✓ 已儲存 ${rows.length} 筆至 Sheet`);
    } catch (e) {
      // 後端拒絕管理密碼：清掉，下次儲存重新詢問
      if (e instanceof GasError && e.message === "ADMIN_REQUIRED") {
        forgetAdminToken();
      }
      // 後端在寫入前確認試算表沒有 movement_type 欄（載入之後表頭才被移除）：這次沒有寫入
      if (e instanceof GasError && e.message === "MOVEMENT_COLUMN_MISSING") {
        setMovementColumn(COLUMN_MISSING_ON_SAVE);
      }
      setS(
        "error",
        `✗ ${e instanceof Error ? adminErrorText(e.message) : String(e)}`
      );
    }
  };

  // 移動方式不是遊戲的寫法的列數（保留原值，只提示）
  const unknownMovementRows = rows.filter(
    (r) => !movementOf(r.movement_type).known
  ).length;

  const flyingRows = flyingRowCount(rows);
  const missingText = missingColumnText(movementColumn);
  // 無法確認有沒有這一欄：載入過（失敗、舊後端的空表）就一直說明；還沒載入時只在有飛行的列時說明
  const unknownText =
    movementColumn.status === "unknown" &&
    (movementColumn.reason !== "not_loaded" || flyingRows > 0)
      ? unknownColumnText(movementColumn)
      : null;

  const msgClass =
    status === "ok"
      ? styles.statusOk
      : status === "error"
        ? styles.statusErr
        : styles.statusBusy;

  return (
    <div>
      {/* 操作列 */}
      <div className={styles.actionBar}>
        <button
          className={styles.actionBtn}
          onClick={handleLoad}
          disabled={status === "loading"}
        >
          {status === "loading" ? "讀取中..." : "📥 從 Sheet 載入"}
        </button>
        <button className={styles.actionBtn} onClick={handleAdd}>
          ＋ 新增列
        </button>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
          onClick={handleSave}
          disabled={status === "saving" || rows.length === 0}
        >
          {status === "saving" ? "儲存中..." : "💾 儲存至 Sheet"}
        </button>
        {msg && (
          <span className={`${styles.statusMsg} ${msgClass}`}>{msg}</span>
        )}
      </div>

      <div className={styles.movementHint} data-testid="enemy-movement-help">
        移動方式：地面沿路線走、會被武將擋住；飛行從路線起點直線飛到終點，不會被武將擋住。只有弓兵、法師武將與弓兵塔打得到飛行敵人，文士塔可以對飛行減速，其他只打地面。空白或遊戲不認得的值一律當作地面。
      </div>

      {missingText && (
        <div
          className={styles.unknownHint}
          role="alert"
          data-testid="enemy-movement-missing"
          data-source={
            movementColumn.status === "missing"
              ? movementColumn.source
              : undefined
          }
        >
          {missingText}
        </div>
      )}

      {unknownText && (
        <div
          className={styles.unknownHint}
          role="status"
          data-testid="enemy-movement-column-unknown"
          data-reason={
            movementColumn.status === "unknown"
              ? movementColumn.reason
              : undefined
          }
        >
          {flyingRows > 0
            ? `有 ${flyingRows} 列設定為飛行，暫時不能儲存：`
            : "含飛行設定的儲存會先被擋下："}
          {unknownText}
        </div>
      )}

      {unknownMovementRows > 0 && (
        <div
          className={styles.unknownHint}
          role="status"
          data-testid="enemy-movement-unknown-hint"
        >
          有 {unknownMovementRows}{" "}
          列的移動方式不是遊戲的寫法（標成黃色）：已保留原值，遊戲照選單上的說明處理。只有在選單選擇新的值並儲存時才會改變。
        </div>
      )}

      {/* 表格 */}
      {rows.length === 0 ? (
        <div className={styles.emptyHint}>
          尚無資料，點擊「從 Sheet 載入」或「新增列」開始。
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.configTable}>
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {COLUMNS.map((col) => (
                    <td key={col.key}>
                      {col.key === MOVEMENT_KEY ? (
                        <MovementSelect
                          raw={row.movement_type}
                          index={i}
                          onChange={(v) => handleChange(i, MOVEMENT_KEY, v)}
                        />
                      ) : (
                        <input
                          className={[
                            styles.configInput,
                            col.wide ? styles.configInputWide : "",
                            NUM_FIELDS.includes(col.key)
                              ? styles.configInputNum
                              : "",
                          ].join(" ")}
                          type={
                            NUM_FIELDS.includes(col.key) ? "number" : "text"
                          }
                          value={String(row[col.key] ?? "")}
                          onChange={(e) =>
                            handleChange(i, col.key, e.target.value)
                          }
                        />
                      )}
                    </td>
                  ))}
                  <td>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(i)}
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** 移動方式的選單：遊戲的值（地面、飛行），原值是空白或遊戲不認得的寫法時多一個「原值」選項 */
function MovementSelect({
  raw: rawValue,
  index,
  onChange,
}: {
  raw: unknown;
  index: number;
  onChange: (value: string) => void;
}) {
  const raw =
    rawValue === null || rawValue === undefined ? "" : String(rawValue);
  const unknown = !movementOf(raw).known;
  const isOption = MOVEMENT_TYPES.some((m) => m.value === raw);
  return (
    <select
      className={`${styles.configSelect} ${unknown ? styles.configSelectUnknown : ""}`}
      value={raw}
      onChange={(e) => onChange(e.target.value)}
      title={
        unknown
          ? `移動方式「${raw}」不是遊戲的寫法，儲存時會保留原值`
          : undefined
      }
      aria-label={`第 ${index + 1} 列的移動方式`}
      data-testid="enemy-movement-select"
      data-unknown={unknown ? "true" : undefined}
    >
      {!isOption && <option value={raw}>{movementOptionLabel(raw)}</option>}
      {MOVEMENT_TYPES.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}（{m.value}）
        </option>
      ))}
    </select>
  );
}
