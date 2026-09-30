"use client";

import { useEffect, useRef } from "react";
import { Col, Row } from "react-bootstrap";
import styles from "../styles/shenmaSanguo.module.css";

export interface StageBlockedAction {
  label: string;
  onClick: () => void;
  testId: string;
  primary?: boolean;
  disabled?: boolean;
}

/**
 * 不能出征的說明（規則見 utils/stagePlayability）：疊在戰場中央，取代載入動畫。
 * 沒有送出關卡資料、沒有開新的一場；附上出口（選擇其他關卡、返回關卡選擇、重試）。
 * 出現時焦點移到說明上，鍵盤可以直接 Tab 到按鈕。遊戲載入完成時會把焦點移到遊戲畫面，
 * 所以 focusKey（遊戲的載入狀態）改變時再移回來一次；層級低於視窗，打開的視窗不會被它蓋住
 */
export default function StageBlockedNotice({
  status,
  title,
  lines,
  actions,
  focusKey,
}: {
  /** 不能出征的原因（stageAccess 的 status），測試用 */
  status: string;
  title: string;
  lines: string[];
  actions: StageBlockedAction[];
  /** 改變時把焦點移回說明（傳遊戲的載入狀態） */
  focusKey?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [status, title, focusKey]);

  return (
    <div
      ref={ref}
      className={styles.stageBlocked}
      role="alert"
      tabIndex={-1}
      data-testid="stage-blocked"
      data-status={status}
    >
      <div className={styles.stageBlockedTitle}>{title}</div>
      <ul className={styles.stageBlockedList} data-testid="stage-blocked-lines">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <Row className="g-2">
        {actions.map((a) => (
          <Col xs={12} key={a.testId}>
            <button
              className={`${styles.stageBlockedBtn} ${a.primary ? styles.stageBlockedPrimary : ""} w-100`}
              onClick={a.onClick}
              disabled={a.disabled}
              data-testid={a.testId}
            >
              {a.label}
            </button>
          </Col>
        ))}
      </Row>
    </div>
  );
}
