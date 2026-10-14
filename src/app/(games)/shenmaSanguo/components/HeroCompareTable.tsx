"use client";

import React, { useId, useState } from "react";
import { Form, Table } from "react-bootstrap";
import {
  CompareDiffKey,
  HeroCompareColumn,
  compareDiffs,
} from "../utils/heroCompare";
import { formatSec } from "../utils/heroStats";
import styles from "../styles/shenmaSanguo.module.css";

const num = (n: number | null, unit = "") =>
  n === null ? "—" : `${Number(n.toFixed(3))}${unit}`;

/** 差額文字：0 是「相同」；正負號用 ＋／−，不用顏色判斷好壞 */
const diffText = (d: number | null, unit: string) =>
  d === null
    ? "不能比較"
    : d === 0
      ? "相同"
      : `${d > 0 ? "+" : "−"}${Number(Math.abs(d).toFixed(3))}${unit}`;

interface CompareRow {
  key: string;
  label: React.ReactNode;
  cell: (c: HeroCompareColumn) => React.ReactNode;
  /** 可以算差額的列：差額的鍵與單位 */
  diff?: { key: CompareDiffKey; unit: string };
}

/**
 * 兩位武將的比較表（主頁武將視窗與獨立武將頁的比較視窗共用；規則見 utils/heroCompare）
 * - 一列一個項目、一欄一位武將；數值是存檔的基礎值（目前等級），不含戰場上的技能、光環與加成
 * - 項目欄固定寬度、標題簡短不換行（手機也能讀），完整說明放在表格下方的註解
 * - 射程技能才另外有「戰場射程」一列；不能比較的武將寫明缺少哪些有效的欄位，數值顯示「—」
 * - 「顯示差額」：以左欄為基準，在右欄的數值下方寫右欄−左欄（不加第四欄）；只控制這個畫面，不送請求
 */
export default function HeroCompareTable({
  columns,
}: {
  columns: HeroCompareColumn[];
}) {
  const switchId = useId();
  const notesId = useId();
  const [showDiff, setShowDiff] = useState(false);
  const anyBattleRange = columns.some((c) => c.battleRange !== null);
  const pair = columns.length === 2;
  const diffs = pair ? compareDiffs(columns[0], columns[1]) : null;
  const rows: CompareRow[] = [
    { key: "job", label: "職業", cell: (c) => c.job },
    {
      key: "level",
      label: "目前等級",
      cell: (c) => (c.level === null ? "—" : `Lv.${c.level}`),
    },
    {
      key: "atk",
      label: "攻擊 ATK",
      cell: (c) => num(c.atk),
      diff: { key: "atk", unit: "" },
    },
    {
      key: "def",
      label: "防禦 DEF",
      cell: (c) => num(c.def),
      diff: { key: "def", unit: "" },
    },
    {
      key: "hp",
      label: "生命 HP",
      cell: (c) => num(c.hp),
      diff: { key: "hp", unit: "" },
    },
    {
      key: "cost",
      label: "出陣容量",
      cell: (c) => num(c.cost),
      diff: { key: "cost", unit: "" },
    },
    {
      key: "range",
      label: "基礎射程",
      cell: (c) => num(c.range, " 格"),
      diff: { key: "range", unit: " 格" },
    },
    ...(anyBattleRange
      ? [
          {
            key: "battleRange",
            label: "戰場射程",
            cell: (c: HeroCompareColumn) =>
              c.battleRange !== null
                ? `${num(c.battleRange, " 格")}（${c.skillName}）`
                : c.range === null
                  ? "—"
                  : "同基礎射程",
            diff: { key: "battleRange" as const, unit: " 格" },
          },
        ]
      : []),
    {
      key: "interval",
      label: (
        <>
          攻擊間隔
          <span className="d-block small fw-normal text-muted">越小越快</span>
        </>
      ),
      cell: (c) => (c.interval === null ? "—" : `${formatSec(c.interval)} 秒`),
      diff: { key: "interval", unit: " 秒" },
    },
    { key: "skill", label: "技能", cell: (c) => c.skillName ?? "無特殊技能" },
    {
      key: "skillText",
      label: "技能說明",
      cell: (c) =>
        c.skillText ? (
          <span className="small">{c.skillText}</span>
        ) : c.skillName ? (
          "—"
        ) : (
          "（沒有技能）"
        ),
    },
    { key: "air", label: "對空", cell: (c) => c.airText },
  ];
  return (
    <div data-testid="hero-compare">
      <p className="small text-muted mb-2">
        數值是目前存檔的基礎值（目前等級），不含戰場上的技能、光環與加成。
      </p>
      {pair && (
        <Form.Check
          type="switch"
          role="switch"
          id={switchId}
          className="small mb-2"
          checked={showDiff}
          onChange={(e) => setShowDiff(e.currentTarget.checked)}
          label={`顯示差額（以左欄的${columns[0].name}為基準）`}
          data-testid="hero-compare-diff-toggle"
        />
      )}
      <div className="table-responsive">
        <Table
          size="sm"
          bordered
          className={`mb-0 align-middle ${styles.compareTable}`}
          aria-describedby={notesId}
          data-testid="hero-compare-table"
        >
          <caption className="visually-hidden">兩位武將的比較</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.compareLabelCol}>
                項目
              </th>
              {columns.map((c) => (
                <th scope="col" key={c.heroId} data-hero-id={c.heroId}>
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {columns.some((c) => !c.ok) && (
              <tr data-row="problems">
                <th scope="row">資料</th>
                {columns.map((c) => (
                  <td key={c.heroId} data-hero-id={c.heroId}>
                    {c.ok
                      ? "完整"
                      : `不能比較：設定或存檔沒有有效的${c.problems.join("、")}`}
                  </td>
                ))}
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.key} data-row={r.key}>
                <th scope="row">{r.label}</th>
                {columns.map((c, i) => (
                  <td key={c.heroId} data-hero-id={c.heroId}>
                    {r.cell(c)}
                    {showDiff && diffs && r.diff && i === 1 && (
                      <span
                        className="d-block small text-muted"
                        data-diff={r.diff.key}
                      >
                        差額 {diffText(diffs[r.diff.key], r.diff.unit)}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <ul
        id={notesId}
        className="small text-muted mt-2 mb-0 ps-3"
        data-testid="hero-compare-notes"
      >
        <li>
          基礎射程：目前等級的射程（射程＋（等級−1）×射程成長），不含技能。
        </li>
        {anyBattleRange && (
          <li>
            戰場射程：含射程技能（只乘一次）；沒有射程技能的就是基礎射程。
          </li>
        )}
        <li>攻擊間隔：兩次攻擊之間的秒數，數字越小攻擊越快。</li>
        {pair && (
          <li>
            差額：右欄的值減左欄的值；只是數字的差，出陣容量少、射程長或間隔短都不代表整體比較強。
          </li>
        )}
      </ul>
    </div>
  );
}
