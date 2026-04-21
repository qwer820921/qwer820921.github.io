"use client";
import React, { useState } from "react";
import styles from "../../styles/objectTab.module.css";
import { HeroConfig } from "../../types";
import { gameApi } from "@/app/(games)/shenmaSanguo/api/gameApi";

// 數值欄位
const NUM_FIELDS: (keyof HeroConfig)[] = [
  "cost",
  "base_atk",
  "base_def",
  "base_hp",
  "attack_range",
  "attack_speed",
  "upgrade_cost_base",
  "atk_growth",
  "def_growth",
  "hp_growth",
  "range_growth",
];

const RARITY_OPTIONS = ["N", "R", "SR", "SSR", "UR"];
const JOB_OPTIONS = ["步兵", "弓手", "騎兵", "法師", "醫師", "投石"];

// 所有欄位順序（對應 GAS sheet）
const COLUMNS: {
  key: keyof HeroConfig;
  label: string;
  wide?: boolean;
  select?: string[];
}[] = [
  { key: "hero_id", label: "hero_id", wide: true },
  { key: "name", label: "名稱", wide: true },
  { key: "rarity", label: "稀有度", select: RARITY_OPTIONS },
  { key: "cost", label: "費用" },
  { key: "job", label: "職業", select: JOB_OPTIONS },
  { key: "base_atk", label: "基礎ATK" },
  { key: "base_def", label: "基礎DEF" },
  { key: "base_hp", label: "基礎HP" },
  { key: "attack_range", label: "射程" },
  { key: "attack_speed", label: "攻速" },
  { key: "passive", label: "被動", wide: true },
  { key: "notes", label: "備注", wide: true },
  { key: "upgrade_cost_base", label: "升級基礎費" },
  { key: "atk_growth", label: "ATK成長" },
  { key: "def_growth", label: "DEF成長" },
  { key: "hp_growth", label: "HP成長" },
  { key: "range_growth", label: "射程成長" },
  { key: "image", label: "圖片", wide: true },
  { key: "attack_image", label: "攻擊圖", wide: true },
];

function makeBlank(): HeroConfig {
  return {
    hero_id: "",
    name: "",
    rarity: "N",
    cost: 100,
    job: "步兵",
    base_atk: 50,
    base_def: 30,
    base_hp: 500,
    attack_range: 2,
    attack_speed: 1,
    passive: "",
    notes: "",
    upgrade_cost_base: 100,
    atk_growth: 5,
    def_growth: 3,
    hp_growth: 50,
    image: "",
    attack_image: "",
    range_growth: 0,
  };
}

type Status = "idle" | "loading" | "saving" | "ok" | "error";

export default function HeroConfigEditor() {
  const [rows, setRows] = useState<HeroConfig[]>([]);
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
      const data = await gameApi.getHeroesConfig();
      if (data.status !== 200) throw new Error(data.error || "讀取失敗");
      setRows((data.heroes as HeroConfig[]) || []);
      setS("ok", `✓ 已載入 ${(data.heroes as HeroConfig[]).length} 筆`);
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
  const handleChange = (i: number, key: keyof HeroConfig, value: string) => {
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
      const data = await gameApi.saveHeroesConfig(rows);
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
                      {col.select ? (
                        <select
                          className={styles.configSelect}
                          value={String(row[col.key] ?? "")}
                          onChange={(e) =>
                            handleChange(i, col.key, e.target.value)
                          }
                        >
                          {col.select.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
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
