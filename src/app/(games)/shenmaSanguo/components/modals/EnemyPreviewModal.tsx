"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Row, Col } from "react-bootstrap";
import { EnemyConfig, MapConfig } from "../../types";
import {
  buildStagePreview,
  PreviewGroup,
  PreviewWave,
} from "../../utils/stagePreview";
import styles from "../../styles/shenmaSanguo.module.css";

interface Props {
  map: MapConfig;
  enemies: EnemyConfig[];
  /** 關卡尚未解鎖（只顯示資訊，不改變解鎖規則） */
  locked: boolean;
  onClose: () => void;
}

/**
 * 關卡敵軍預覽（唯讀）：主頁的「關卡」視窗與獨立的關卡頁共用。
 * 只讀已載入的靜態設定（utils/stagePreview），沒有出征、切換關卡或任何寫入；
 * 用 portal 放在神馬三國的 gameBody（主題變數 --sg-* 定義在那裡；放到 body 會變成透明、沒有文字顏色），
 * 不在關卡卡片裡面，點擊不會觸發卡片（卡片本身點下去就是出征／切換關卡）
 */
export default function EnemyPreviewModal({
  map,
  enemies,
  locked,
  onClose,
}: Props) {
  const preview = useMemo(
    () => buildStagePreview(map, enemies),
    [map, enemies]
  );
  const [open, setOpen] = useState<number[]>([1]);
  const toggle = (n: number) =>
    setOpen((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
    );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className={`${styles.modalBackdrop} ${styles.enemyPreviewBackdrop}`}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      data-testid="enemy-preview"
    >
      <div
        className={styles.modalPanel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`敵軍預覽：${map.name}`}
      >
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>敵軍預覽｜{map.name}</span>
          {locked && <span className={styles.previewBadge}>鎖定</span>}
          <button
            className={styles.modalClose}
            onClick={onClose}
            aria-label="關閉敵軍預覽"
            data-testid="enemy-preview-close"
          >
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.previewSummary} data-testid="preview-summary">
            <div>
              共 {preview.waves.length} 波
              {preview.waves.length > 0 &&
                (preview.total !== null
                  ? `，全關 ${preview.total} 隻敵人`
                  : "，全關數量無法確定（有資料不完整的波次）")}
            </div>
            <div>
              路線：
              {preview.pathIds.length > 0
                ? preview.pathIds.join("、")
                : "沒有可用的路線"}
            </div>
            {locked && (
              <div className={styles.previewNote}>
                這一關尚未解鎖：只能查看敵軍，不能出征。
              </div>
            )}
            {preview.problems.map((p) => (
              <div key={p} className={styles.previewNote}>
                資料不完整：{p}
              </div>
            ))}
            <div className={styles.previewHint}>
              只列出關卡設定裡有的資料；移動速度是設定值（數字越大越快）。
            </div>
          </div>

          {preview.waves.map((w) => (
            <WaveBlock
              key={w.wave}
              wave={w}
              open={open.includes(w.wave)}
              onToggle={() => toggle(w.wave)}
            />
          ))}

          <button
            className={`${styles.btnOutline} w-100 mt-2`}
            onClick={onClose}
            data-testid="enemy-preview-close-bottom"
          >
            關閉
          </button>
        </div>
      </div>
    </div>,
    document.getElementsByClassName(styles.gameBody)[0] ?? document.body
  );
}

function waveStatus(w: PreviewWave): string {
  if (w.missing) return "沒有資料";
  if (w.rejected) return "遊戲會拒絕這一波";
  if (w.total === null) return "數量無法確定";
  return `${w.total} 隻`;
}

function WaveBlock({
  wave: w,
  open,
  onToggle,
}: {
  wave: PreviewWave;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={styles.previewWave} data-testid={`preview-wave-${w.wave}`}>
      <button
        className={styles.previewWaveHeader}
        onClick={onToggle}
        aria-expanded={open}
        data-testid={`preview-wave-toggle-${w.wave}`}
      >
        <span>
          {open ? "▾" : "▸"} 第 {w.wave} 波
        </span>
        <span>
          {w.incomplete && (
            <span className={styles.previewBadge}>資料不完整</span>
          )}{" "}
          {waveStatus(w)}
        </span>
      </button>
      {open && (
        <div className={styles.previewWaveBody}>
          {w.missing && (
            <div className={styles.previewNote}>
              關卡資料沒有第 {w.wave} 波：遊戲打到這一波會拒絕開始。
            </div>
          )}
          {!w.missing && w.rejected && (
            <div className={styles.previewNote}>
              這一波沒有可以出兵的敵人組：遊戲會拒絕開始這一波。
            </div>
          )}
          {w.groups.map((g) => (
            <GroupRow key={g.index} group={g} />
          ))}
          {w.blankRows > 0 && (
            <div className={styles.previewHint}>
              另有 {w.blankRows} 列空白資料（遊戲略過，不是敵人）。
            </div>
          )}
          {w.duplicates > 0 && (
            <div className={styles.previewNote}>
              第 {w.wave} 波另有 {w.duplicates} 筆重複的資料，遊戲只使用第一筆。
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupRow({ group: g }: { group: PreviewGroup }) {
  const countText =
    g.outcome === "spawn"
      ? `×${g.count}`
      : g.outcome === "skip"
        ? "不會出兵"
        : "數量無法確定";
  return (
    <div className={styles.previewGroup} data-testid="preview-group">
      <Row className="g-1 align-items-center">
        <Col xs={12} sm={7}>
          <span className={styles.previewGroupIndex}>第 {g.index} 組</span>{" "}
          <strong>{g.name ?? `未知敵人（${g.enemyId}）`}</strong> {countText}
        </Col>
        <Col xs={12} sm={5} className="text-sm-end">
          路線 {g.path}
        </Col>
        <Col xs={12} className={styles.previewStats}>
          血量 {g.hp ?? "未提供"}｜移動速度 {g.speed ?? "未提供"}｜每隻間隔{" "}
          {g.interval === null ? "未提供" : `${g.interval} 秒`}
        </Col>
        {g.notes.map((n) => (
          <Col xs={12} key={n} className={styles.previewNote}>
            {n}
          </Col>
        ))}
      </Row>
    </div>
  );
}
