"use client";

import React, { useId } from "react";
import { Row, Col } from "react-bootstrap";
import { PreviewWave } from "../utils/stagePreview";
import { isProblemWave, problemWaves } from "../utils/waveNav";
import { previewWaveStatus } from "./PreviewWaveDetail";
import styles from "../styles/shenmaSanguo.module.css";

interface Props {
  waves: PreviewWave[];
  /** 選單選的波次（null＝還沒選） */
  target: number | null;
  onTargetChange: (wave: number | null) => void;
  /** 只展開這一波、捲到它的標題並把焦點交給它的按鈕 */
  onGoto: (wave: number) => void;
  onNextProblem: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  /** 最後一次導覽的說明（給輔助工具朗讀；沒有時是 null） */
  status: string | null;
  /** 波次選單：導覽的目標波次在設定更新後消失時，焦點交給它 */
  selectRef: React.RefObject<HTMLSelectElement | null>;
}

/**
 * 敵軍預覽的波次導覽（唯讀，規則見 utils/waveNav）：全部展開／全部收合、選一波前往、跳到下一個資料問題。
 * 只改哪幾波展開與焦點：不開戰、不迎戰、不切換關卡，也不寫戰場的「下一波」；波次的順序、組成摘要與全關總數不變。
 * 波次的狀態文字和逐波標題相同（previewWaveStatus）：沒有資料、遊戲會拒絕、數量無法確定都不當成 0 隻
 */
export default function PreviewWaveNav({
  waves,
  target,
  onTargetChange,
  onGoto,
  onNextProblem,
  onExpandAll,
  onCollapseAll,
  status,
  selectRef,
}: Props) {
  const uid = useId();
  const selectId = `${uid}-wave`;
  const problemId = `${uid}-problems`;
  const problems = problemWaves(waves);
  return (
    <div
      className={styles.waveNav}
      role="group"
      aria-label="波次導覽"
      data-testid="preview-wave-nav"
    >
      <Row className="g-2 align-items-end">
        <Col xs={8} sm={6}>
          <label htmlFor={selectId} className={styles.heroFilterLabel}>
            前往波次
          </label>
          <select
            id={selectId}
            ref={selectRef}
            className={`form-select form-select-sm ${styles.heroSortField}`}
            value={target === null ? "" : String(target)}
            onChange={(e) =>
              onTargetChange(
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
            data-testid="preview-wave-select"
          >
            <option value="">選擇波次</option>
            {waves.map((w) => (
              <option key={w.wave} value={String(w.wave)}>
                第 {w.wave} 波：{previewWaveStatus(w)}
                {isProblemWave(w) ? "（資料問題）" : ""}
              </option>
            ))}
          </select>
        </Col>
        <Col xs={4} sm={2}>
          <button
            type="button"
            className={`btn btn-sm w-100 ${styles.heroClearBtn}`}
            onClick={() => target !== null && onGoto(target)}
            disabled={target === null}
            data-testid="preview-wave-goto"
          >
            前往
          </button>
        </Col>
        <Col xs={6} sm={2}>
          <button
            type="button"
            className={`btn btn-sm w-100 ${styles.heroClearBtn}`}
            onClick={onExpandAll}
            data-testid="preview-wave-expand-all"
          >
            全部展開
          </button>
        </Col>
        <Col xs={6} sm={2}>
          <button
            type="button"
            className={`btn btn-sm w-100 ${styles.heroClearBtn}`}
            onClick={onCollapseAll}
            data-testid="preview-wave-collapse-all"
          >
            全部收合
          </button>
        </Col>
        <Col xs={12}>
          <button
            type="button"
            className={`btn btn-sm w-100 ${styles.heroClearBtn}`}
            onClick={onNextProblem}
            disabled={problems.length === 0}
            aria-describedby={problemId}
            data-testid="preview-wave-next-problem"
          >
            下一個資料問題
          </button>
          <div
            id={problemId}
            className={styles.heroFilterCount}
            data-testid="preview-wave-problems"
          >
            {problems.length === 0
              ? "沒有資料問題的波次：每一波都有資料、遊戲不會拒絕，也沒有略過或無法確定的組。"
              : `資料問題：第 ${problems.join("、")} 波（共 ${problems.length} 波）；全部波次仍列在下方。`}
          </div>
          <div
            className={styles.heroFilterCount}
            aria-live="polite"
            data-testid="preview-wave-nav-status"
          >
            {status}
          </div>
        </Col>
      </Row>
    </div>
  );
}
