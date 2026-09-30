"use client";

import { Row, Col } from "react-bootstrap";
import { PreviewGroup, PreviewWave } from "../utils/stagePreview";
import styles from "../styles/shenmaSanguo.module.css";

/**
 * 一波敵軍的明細（規則見 utils/stagePreview）：關卡的敵軍預覽與戰場內的「下一波」共用。
 * showGround：地面組也標出「地面」（「下一波」用；關卡預覽只標飛行）
 */

/** 波次的摘要：沒有資料、遊戲會拒絕、數量無法確定，或確定的隻數 */
export function previewWaveStatus(w: PreviewWave): string {
  if (w.missing) return "沒有資料";
  if (w.rejected) return "遊戲會拒絕這一波";
  if (w.total === null) return "數量無法確定";
  return `${w.total} 隻`;
}

export function PreviewWaveBody({
  wave: w,
  showGround = false,
}: {
  wave: PreviewWave;
  showGround?: boolean;
}) {
  return (
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
        <PreviewGroupRow key={g.index} group={g} showGround={showGround} />
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
  );
}

function PreviewGroupRow({
  group: g,
  showGround,
}: {
  group: PreviewGroup;
  showGround: boolean;
}) {
  const countText =
    g.outcome === "spawn"
      ? `×${g.count}`
      : g.outcome === "skip"
        ? "不會出兵"
        : "數量無法確定";
  return (
    <div
      className={styles.previewGroup}
      data-testid="preview-group"
      data-movement={g.movement?.value ?? ""}
      data-outcome={g.outcome}
      data-flight-problem={g.flightProblem ?? ""}
      data-ground-problem={g.groundProblem ?? ""}
    >
      <Row className="g-1 align-items-center">
        <Col xs={12} sm={7} className={styles.previewGroupMain}>
          <span className={styles.previewGroupIndex}>第 {g.index} 組</span>{" "}
          <strong>{g.name ?? `未知敵人（${g.enemyId}）`}</strong> {countText}
          {g.movement?.value === "flying" && (
            <>
              {" "}
              <span
                className={styles.previewFlying}
                data-testid="preview-flying"
              >
                ✈ 飛行
              </span>
            </>
          )}
          {showGround && g.movement?.value === "ground" && (
            <>
              {" "}
              <span
                className={styles.previewGround}
                data-testid="preview-ground"
              >
                地面
              </span>
            </>
          )}
          {showGround && !g.movement && (
            <>
              {" "}
              <span className={styles.previewGround}>移動方式不明</span>
            </>
          )}
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
