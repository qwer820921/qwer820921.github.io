"use client";
import React, { useState } from "react";
import styles from "../../styles/objectTab.module.css";
import { EnemyConfig } from "../../types";
import { gameApi } from "@/app/(games)/shenmaSanguo/api/gameApi";

// 數值欄位
const NUM_FIELDS: (keyof EnemyConfig)[] = [
  "level",
  "speed",
  "hp",
  "atk",
  "armor",
  "attack_range",
];

// 所有欄位順序（對應 GAS sheet）
const COLUMNS: { key: keyof EnemyConfig; label: string; wide?: boolean }[] = [
  { key: "enemy_id", label: "enemy_id", wide: true },
  { key: "name", label: "名稱", wide: true },
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
  };
}

type Status = "idle" | "loading" | "saving" | "ok" | "error";

export default function EnemyConfigEditor() {
  const [rows, setRows] = useState<EnemyConfig[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");

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
      setRows((data.enemies as EnemyConfig[]) || []);
      setS("ok", `✓ 已載入 ${(data.enemies as EnemyConfig[]).length} 筆`);
    } catch (e) {
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
      const data = await gameApi.saveEnemiesConfig(rows);
      if (data.status !== 200) throw new Error(data.error || "儲存失敗");
      setS("ok", `✓ 已儲存 ${rows.length} 筆至 Sheet`);
    } catch (e) {
      setS("error", `✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

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
                      <input
                        className={[
                          styles.configInput,
                          col.wide ? styles.configInputWide : "",
                          NUM_FIELDS.includes(col.key)
                            ? styles.configInputNum
                            : "",
                        ].join(" ")}
                        type={NUM_FIELDS.includes(col.key) ? "number" : "text"}
                        value={String(row[col.key] ?? "")}
                        onChange={(e) =>
                          handleChange(i, col.key, e.target.value)
                        }
                      />
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
