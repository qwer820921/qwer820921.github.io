"use client";
import React, { useState } from "react";
import styles from "../../styles/objectTab.module.css";
import { HeroConfig } from "../../types";
import { gameApi, GasError } from "@/app/(games)/shenmaSanguo/api/gameApi";
import {
  HERO_JOBS,
  HERO_RARITIES,
  isKnownJob,
  isKnownRarity,
} from "@/app/(games)/shenmaSanguo/utils/heroCategories";
import {
  ADMIN_TOKEN_MISSING,
  adminErrorText,
  forgetAdminToken,
  requireAdminToken,
} from "../../utils/adminToken";

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

/**
 * 稀有度與職業的選單：只提供遊戲認得的值（和遊戲畫面共用 utils/heroCategories），顯示「名稱（值）」。
 * 試算表裡遊戲不認得的舊值（例如 N／SR、中文職業）保留原值：選單多一個「原值」選項並標示，
 * 載入、重新繪製都不會改寫；只有管理者在選單選了新的值並儲存時才會改變（沒動的列照原值送回）
 */
type SelectSpec = {
  options: { value: string; label: string }[];
  isKnown: (v: unknown) => boolean;
  /** 說明文字用的名稱 */
  name: string;
};
const RARITY_SELECT: SelectSpec = {
  options: HERO_RARITIES.map((r) => ({
    value: r.value,
    label: `${r.label}（${r.value}）`,
  })),
  isKnown: isKnownRarity,
  name: "稀有度",
};
const JOB_SELECT: SelectSpec = {
  options: HERO_JOBS.map((j) => ({
    value: j.value,
    label: `${j.label}（${j.value}）`,
  })),
  isKnown: isKnownJob,
  name: "職業",
};

/** 遊戲不認得的值在選單上的說明（空白也算，遊戲不認得） */
const unknownLabel = (raw: string) =>
  raw === "" ? "（空白：遊戲不認得）" : `${raw}（遊戲不認得，保留原值）`;

// 所有欄位順序（對應 GAS sheet）
const COLUMNS: {
  key: keyof HeroConfig;
  label: string;
  wide?: boolean;
  select?: SelectSpec;
}[] = [
  { key: "hero_id", label: "hero_id", wide: true },
  { key: "name", label: "名稱", wide: true },
  { key: "rarity", label: "稀有度", select: RARITY_SELECT },
  { key: "cost", label: "費用" },
  { key: "job", label: "職業", select: JOB_SELECT },
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
    rarity: "green",
    cost: 100,
    job: "infantry",
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
      // 管理密碼：沒有輸入就不送出
      const token = await requireAdminToken();
      if (!token) throw new Error(ADMIN_TOKEN_MISSING);
      const data = await gameApi.saveHeroesConfig(rows, token);
      if (data.status !== 200) throw new Error(data.error || "儲存失敗");
      setS("ok", `✓ 已儲存 ${rows.length} 筆至 Sheet`);
    } catch (e) {
      // 後端拒絕管理密碼：清掉，下次儲存重新詢問
      if (e instanceof GasError && e.message === "ADMIN_REQUIRED") {
        forgetAdminToken();
      }
      setS(
        "error",
        `✗ ${e instanceof Error ? adminErrorText(e.message) : String(e)}`
      );
    }
  };

  // 稀有度或職業不是遊戲認得的值的列數（保留原值，只提示）
  const unknownRows = rows.filter(
    (row) => !isKnownRarity(row.rarity) || !isKnownJob(row.job)
  ).length;

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

      {unknownRows > 0 && (
        <div
          className={styles.unknownHint}
          role="status"
          data-testid="hero-unknown-hint"
        >
          有 {unknownRows}{" "}
          列的稀有度或職業不是遊戲認得的值（標成黃色）：已保留原值（遊戲畫面顯示原值，職業歸在「其他」）。只有在選單選擇新的值並儲存時才會改變。
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
                  {COLUMNS.map((col) => {
                    const sel = col.select;
                    const raw = String(row[col.key] ?? "");
                    const unknown = !!sel && !sel.isKnown(row[col.key]);
                    return (
                      <td key={col.key}>
                        {sel ? (
                          <select
                            className={`${styles.configSelect} ${unknown ? styles.configSelectUnknown : ""}`}
                            value={raw}
                            onChange={(e) =>
                              handleChange(i, col.key, e.target.value)
                            }
                            title={
                              unknown
                                ? `${sel.name}「${raw}」不是遊戲認得的值，儲存時會保留原值`
                                : undefined
                            }
                            aria-label={`第 ${i + 1} 列的${sel.name}`}
                            data-testid={`hero-${col.key}-select`}
                            data-unknown={unknown ? "true" : undefined}
                          >
                            {unknown && (
                              <option value={raw}>{unknownLabel(raw)}</option>
                            )}
                            {sel.options.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
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
                    );
                  })}
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
