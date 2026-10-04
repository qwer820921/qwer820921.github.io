"use client";

import React from "react";
import { Table } from "react-bootstrap";
import { HeroCompareColumn } from "../utils/heroCompare";
import { formatSec } from "../utils/heroStats";

const num = (n: number | null, unit = "") =>
  n === null ? "—" : `${Number(n.toFixed(3))}${unit}`;

/**
 * 兩位武將的比較表（主頁武將視窗與獨立武將頁的比較視窗共用；規則見 utils/heroCompare）
 * - 一列一個項目、一欄一位武將；數值是存檔的基礎值（目前等級），不含戰場上的技能、光環與加成
 * - 射程技能才另外有「戰場有效射程」一列；不能比較的武將寫明缺少哪些有效的欄位，數值顯示「—」
 */
export default function HeroCompareTable({
  columns,
}: {
  columns: HeroCompareColumn[];
}) {
  const anyBattleRange = columns.some((c) => c.battleRange !== null);
  const rows: {
    key: string;
    label: string;
    cell: (c: HeroCompareColumn) => React.ReactNode;
  }[] = [
    { key: "job", label: "職業", cell: (c) => c.job },
    {
      key: "level",
      label: "目前等級",
      cell: (c) => (c.level === null ? "—" : `Lv.${c.level}`),
    },
    { key: "atk", label: "攻擊 ATK", cell: (c) => num(c.atk) },
    { key: "def", label: "防禦 DEF", cell: (c) => num(c.def) },
    { key: "hp", label: "生命 HP", cell: (c) => num(c.hp) },
    { key: "cost", label: "出陣容量", cell: (c) => num(c.cost) },
    {
      key: "range",
      label: "射程（目前等級的基礎值）",
      cell: (c) => num(c.range, " 格"),
    },
    ...(anyBattleRange
      ? [
          {
            key: "battleRange",
            label: "戰場有效射程（含射程技能）",
            cell: (c: HeroCompareColumn) =>
              c.battleRange !== null
                ? `${num(c.battleRange, " 格")}（${c.skillName}）`
                : c.range === null
                  ? "—"
                  : "同基礎射程",
          },
        ]
      : []),
    {
      key: "interval",
      label: "攻擊間隔（數字越小越快）",
      cell: (c) => (c.interval === null ? "—" : `${formatSec(c.interval)} 秒`),
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
      <div className="table-responsive">
        <Table
          size="sm"
          bordered
          className="mb-0 align-middle"
          data-testid="hero-compare-table"
        >
          <caption className="visually-hidden">兩位武將的比較</caption>
          <thead>
            <tr>
              <th scope="col">項目</th>
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
                {columns.map((c) => (
                  <td key={c.heroId} data-hero-id={c.heroId}>
                    {r.cell(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
