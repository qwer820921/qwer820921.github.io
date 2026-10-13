"use client";

import React, { useEffect, useState } from "react";
import { Button, Col, Form, Row } from "react-bootstrap";
import type { MoveTarget } from "../engine/BattleEngine";

interface MoveUnitPanelProps {
  show: boolean;
  /** 正在移動的單位名稱 */
  name: string;
  /** 「武將」或「防禦塔」 */
  kindLabel: string;
  /** 這次移動現在所有合法的目的格 */
  targets: MoveTarget[];
  /** 選了某一格（只預覽，不移動） */
  onPreview: (col: number, row: number) => void;
  /** 確認移到選的這一格 */
  onConfirm: (col: number, row: number) => void;
  /** 取消這次移動（不移動任何東西） */
  onCancel: () => void;
}

/** 目的格的人讀說明（列、欄從 1 開始） */
const targetLabel = (t: MoveTarget) =>
  `第 ${t.row + 1} 列、第 ${t.col + 1} 欄（${t.terrain === "road" ? "道路" : "建築位"}）`;
const targetKey = (t: MoveTarget) => `${t.col},${t.row}`;

/**
 * 移位面板：武將資訊或塔的升級面板按「移動」之後顯示。可以點畫布上的合法格，也可以用鍵盤從清單選目的格再確認；
 * Esc 或「取消」不移動任何東西
 */
export const MoveUnitPanel: React.FC<MoveUnitPanelProps> = ({
  show,
  name,
  kindLabel,
  targets,
  onPreview,
  onConfirm,
  onCancel,
}) => {
  const [picked, setPicked] = useState("");

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, onCancel]);

  if (!show) return null;

  const pickedTarget = targets.find((t) => targetKey(t) === picked) ?? null;

  return (
    <div
      className="bg-dark bg-opacity-75 text-light px-2 py-2"
      role="region"
      aria-label={`移動${kindLabel}`}
      data-testid="move-unit-panel"
    >
      <Row className="g-2 align-items-center">
        <Col xs={12}>
          <div className="small fw-bold" data-testid="move-unit-title">
            移動{kindLabel}：{name}
          </div>
          <div className="small text-secondary">
            點畫布上的綠色格子，或從下面選目的格後按「確認移動」；按 Esc
            或「取消」不移動。
          </div>
        </Col>
        <Col xs={12} md={6}>
          <Form.Select
            size="sm"
            aria-label="目的格"
            value={pickedTarget ? picked : ""}
            onChange={(e) => {
              const v = e.target.value;
              setPicked(v);
              const t = targets.find((x) => targetKey(x) === v);
              if (t) onPreview(t.col, t.row);
            }}
            data-testid="move-target-select"
          >
            <option value="">
              {targets.length > 0 ? "選擇目的格" : "沒有可以放的格子"}
            </option>
            {targets.map((t) => (
              <option key={targetKey(t)} value={targetKey(t)}>
                {targetLabel(t)}
              </option>
            ))}
          </Form.Select>
        </Col>
        <Col xs={6} md={3}>
          <Button
            size="sm"
            variant="success"
            className="w-100"
            disabled={!pickedTarget}
            onClick={() => {
              if (pickedTarget) onConfirm(pickedTarget.col, pickedTarget.row);
            }}
            data-testid="move-confirm"
          >
            確認移動
          </Button>
        </Col>
        <Col xs={6} md={3}>
          <Button
            size="sm"
            variant="outline-light"
            className="w-100"
            onClick={onCancel}
            data-testid="move-cancel"
          >
            取消
          </Button>
        </Col>
      </Row>
    </div>
  );
};
