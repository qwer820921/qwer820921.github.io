"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Col, Row } from "react-bootstrap";
import type { WaveRejectNotice as Notice } from "../utils/waveReject";
import styles from "../styles/shenmaSanguo.module.css";

/**
 * 拒絕開戰的提示（規則見 utils/waveReject）：疊在戰場中央，列出這一波每一組不能出兵的原因。
 * 仍在備戰，所以附上離開的出口（獨立戰鬥頁回關卡選擇、主頁切換關卡）與關閉；Esc 也會關閉。
 * 出現時焦點移到提示上，鍵盤可以直接 Tab 到按鈕
 */
export default function WaveRejectNotice({
  notice,
  exitLabel,
  onExit,
  onClose,
}: {
  notice: Notice;
  exitLabel: string;
  onExit: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [notice]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      ref={ref}
      className={styles.waveReject}
      role="alert"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      data-testid="wave-reject"
      data-wave={notice.wave}
    >
      <div className={styles.waveRejectTitle}>第 {notice.wave} 波無法開始</div>
      <ul className={styles.waveRejectList} data-testid="wave-reject-lines">
        {notice.lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <div className={styles.waveRejectHint}>
        這一波沒有可以出兵的敵人，所以還在備戰：城池沒有扣血，也不會結算。
        這一關的敵軍設定需要修正，可以先換一關。
      </div>
      <Row className="g-2">
        <Col xs={7}>
          <button
            className={`${styles.waveRejectBtn} ${styles.waveRejectExit} w-100`}
            onClick={onExit}
            data-testid="wave-reject-exit"
          >
            {exitLabel}
          </button>
        </Col>
        <Col xs={5}>
          <button
            className={`${styles.waveRejectBtn} w-100`}
            onClick={onClose}
            data-testid="wave-reject-close"
          >
            關閉
          </button>
        </Col>
      </Row>
    </div>
  );
}
