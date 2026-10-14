"use client";

import React, { useId } from "react";
import { Row, Col } from "react-bootstrap";
import {
  DEFAULT_STAGE_FILTER,
  STAGE_STATUS_OPTIONS,
  StageFilterCriteria,
  isDefaultStageFilter,
} from "../utils/stageFilter";
import styles from "../styles/shenmaSanguo.module.css";

interface Props {
  criteria: StageFilterCriteria;
  onChange: (next: StageFilterCriteria) => void;
  /** 設定裡已有的章節（utils/stageFilter 的 stageChapters） */
  chapters: number[];
  matched: number;
  total: number;
  /** 選了可出征／未解鎖但還沒讀到玩家進度（不能判斷） */
  statusUnknown?: boolean;
  /** 搜尋框：清除後焦點回到這裡；敵軍預覽關閉時原本的卡片被篩選藏起或已移除，焦點也交給它 */
  searchRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * 關卡的搜尋、章節與狀態篩選控制列（主頁的關卡選擇視窗、獨立的關卡頁共用）
 * 條件只在呼叫端的元件 state：不寫存檔、session 或網址，輸入時不送任何請求，也不改變能不能出征
 */
export default function StageFilterBar({
  criteria,
  onChange,
  chapters,
  matched,
  total,
  statusUnknown = false,
  searchRef,
}: Props) {
  const uid = useId();
  const searchId = `${uid}-search`;
  const chapterId = `${uid}-chapter`;
  const statusLabelId = `${uid}-status`;
  const isDefault = isDefaultStageFilter(criteria);

  const clear = () => {
    onChange(DEFAULT_STAGE_FILTER);
    // 清除後回到搜尋框，方便直接重新輸入（清除鈕會變成停用，焦點不能留在它身上）
    searchRef.current?.focus();
  };

  return (
    <div
      className={`${styles.heroFilterPanel} mb-3`}
      role="search"
      aria-label="關卡搜尋與篩選"
      data-testid="stage-filter-bar"
    >
      <Row className="g-2 align-items-end">
        <Col xs={12} md={5}>
          <label htmlFor={searchId} className={styles.heroFilterLabel}>
            搜尋關卡
          </label>
          <input
            id={searchId}
            ref={searchRef}
            type="search"
            className={`form-control form-control-sm ${styles.heroSearchInput}`}
            placeholder="名稱或 id"
            autoComplete="off"
            value={criteria.query}
            onChange={(e) => onChange({ ...criteria, query: e.target.value })}
            data-testid="stage-filter-search"
          />
        </Col>
        <Col xs={7} md={4}>
          <label htmlFor={chapterId} className={styles.heroFilterLabel}>
            章節
          </label>
          <select
            id={chapterId}
            className={`form-select form-select-sm ${styles.heroSortField}`}
            value={criteria.chapter === null ? "" : String(criteria.chapter)}
            onChange={(e) =>
              onChange({
                ...criteria,
                chapter: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            data-testid="stage-filter-chapter"
          >
            <option value="">全部章節</option>
            {chapters.map((c) => (
              <option key={c} value={String(c)}>
                第 {c} 章
              </option>
            ))}
          </select>
        </Col>
        <Col xs={5} md={3}>
          <button
            type="button"
            className={`btn btn-sm w-100 ${styles.heroClearBtn}`}
            onClick={clear}
            disabled={isDefault}
            data-testid="stage-filter-clear"
          >
            清除條件
          </button>
        </Col>
        <Col xs={12}>
          <div id={statusLabelId} className={styles.heroFilterLabel}>
            狀態
          </div>
          <div
            role="group"
            aria-labelledby={statusLabelId}
            className="d-flex flex-wrap gap-1"
          >
            {STAGE_STATUS_OPTIONS.map((o) => {
              const active = criteria.status === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={active}
                  className={`${styles.heroFilterBtn} ${active ? styles.heroFilterBtnActive : ""}`}
                  onClick={() => onChange({ ...criteria, status: o.value })}
                  data-testid={`stage-filter-status-${o.value}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </Col>
      </Row>
      <div
        className={styles.heroFilterCount}
        aria-live="polite"
        data-testid="stage-filter-count"
      >
        符合 {matched} 關／共 {total} 關
      </div>
      {matched === 0 && total > 0 && (
        <div
          className={styles.heroFilterEmpty}
          role="status"
          data-testid="stage-filter-empty"
        >
          {statusUnknown
            ? "還沒有讀到玩家進度，不能依可出征／未解鎖篩選。請稍後再試，或按「清除條件」顯示全部。"
            : "沒有符合條件的關卡。請調整搜尋文字或篩選條件，或按「清除條件」顯示全部。"}
        </div>
      )}
    </div>
  );
}
