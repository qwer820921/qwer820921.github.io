"use client";

import React, { useId, useRef } from "react";
import { Row, Col } from "react-bootstrap";
import {
  DEFAULT_HERO_FILTER,
  HERO_AIR_OPTIONS,
  HERO_JOB_OPTIONS,
  HERO_SORT_OPTIONS,
  HERO_TEAM_OPTIONS,
  HeroFilterCriteria,
  HeroSortKey,
  HeroSortOption,
  isDefaultHeroFilter,
} from "../utils/heroFilter";
import styles from "../styles/shenmaSanguo.module.css";

interface Props {
  criteria: HeroFilterCriteria;
  onChange: (next: HeroFilterCriteria) => void;
  matched: number;
  total: number;
  /** 排序選項（預設是武將列表的；隊伍編排用 TEAM_SORT_OPTIONS，多了出陣費用） */
  sortOptions?: HeroSortOption[];
  /** 整個控制列的名稱（螢幕閱讀器） */
  ariaLabel?: string;
  /** 顯示對空與上陣篩選（只有武將列表；隊伍編排不傳，沿用「全部」） */
  statusFilters?: boolean;
  /** 選了上陣篩選但還沒有隊伍資料（不能判斷） */
  teamUnknown?: boolean;
}

/**
 * 武將列表的搜尋、職業篩選與排序控制列（主頁武將視窗、獨立武將頁與兩個隊伍編排入口共用）
 * 條件只在呼叫端的元件 state：不寫存檔、session 或網址，輸入時不送任何請求。
 * 武將列表另外有對空（和戰場同一套規則）與上陣（目前存檔的出陣隊伍）篩選，和搜尋、職業是「而且」
 */
export default function HeroFilterBar({
  criteria,
  onChange,
  matched,
  total,
  sortOptions = HERO_SORT_OPTIONS,
  ariaLabel = "武將搜尋與篩選",
  statusFilters = false,
  teamUnknown = false,
}: Props) {
  const uid = useId();
  const searchId = `${uid}-search`;
  const sortId = `${uid}-sort`;
  const jobLabelId = `${uid}-job`;
  const airLabelId = `${uid}-air`;
  const teamLabelId = `${uid}-team`;
  const searchRef = useRef<HTMLInputElement>(null);
  const isDefault = isDefaultHeroFilter(criteria);

  const clear = () => {
    onChange(DEFAULT_HERO_FILTER);
    // 清除後回到搜尋框，方便直接重新輸入（清除鈕會變成停用，焦點不能留在它身上）
    searchRef.current?.focus();
  };

  return (
    <div
      className={styles.heroFilterPanel}
      role="search"
      aria-label={ariaLabel}
      data-testid="hero-filter-bar"
    >
      <Row className="g-2 align-items-end">
        <Col xs={12} md={5}>
          <label htmlFor={searchId} className={styles.heroFilterLabel}>
            搜尋武將
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
            data-testid="hero-filter-search"
          />
        </Col>
        <Col xs={7} md={4}>
          <label htmlFor={sortId} className={styles.heroFilterLabel}>
            排序
          </label>
          <select
            id={sortId}
            className={`form-select form-select-sm ${styles.heroSortField}`}
            value={criteria.sort}
            onChange={(e) =>
              onChange({ ...criteria, sort: e.target.value as HeroSortKey })
            }
            data-testid="hero-filter-sort"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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
            data-testid="hero-filter-clear"
          >
            清除條件
          </button>
        </Col>
        <Col xs={12}>
          <div id={jobLabelId} className={styles.heroFilterLabel}>
            職業
          </div>
          <div
            role="group"
            aria-labelledby={jobLabelId}
            className="d-flex flex-wrap gap-1"
          >
            {HERO_JOB_OPTIONS.map((o) => {
              const active = criteria.job === o.value;
              return (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={active}
                  className={`${styles.heroFilterBtn} ${active ? styles.heroFilterBtnActive : ""}`}
                  onClick={() => onChange({ ...criteria, job: o.value })}
                  data-testid={`hero-filter-job-${o.value ?? "all"}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </Col>
        {statusFilters && (
          <>
            <Col xs={12} sm={6}>
              <div id={airLabelId} className={styles.heroFilterLabel}>
                對空
              </div>
              <div
                role="group"
                aria-labelledby={airLabelId}
                className="d-flex flex-wrap gap-1"
              >
                {HERO_AIR_OPTIONS.map((o) => {
                  const active = criteria.air === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={active}
                      className={`${styles.heroFilterBtn} ${active ? styles.heroFilterBtnActive : ""}`}
                      onClick={() => onChange({ ...criteria, air: o.value })}
                      data-testid={`hero-filter-air-${o.value}`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </Col>
            <Col xs={12} sm={6}>
              <div id={teamLabelId} className={styles.heroFilterLabel}>
                上陣（存檔的出陣隊伍）
              </div>
              <div
                role="group"
                aria-labelledby={teamLabelId}
                className="d-flex flex-wrap gap-1"
              >
                {HERO_TEAM_OPTIONS.map((o) => {
                  const active = criteria.team === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={active}
                      className={`${styles.heroFilterBtn} ${active ? styles.heroFilterBtnActive : ""}`}
                      onClick={() => onChange({ ...criteria, team: o.value })}
                      data-testid={`hero-filter-team-${o.value}`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </Col>
          </>
        )}
      </Row>
      <div
        className={styles.heroFilterCount}
        aria-live="polite"
        data-testid="hero-filter-count"
      >
        符合 {matched} 位／共 {total} 位
      </div>
      {matched === 0 && total > 0 && (
        <div
          className={styles.heroFilterEmpty}
          role="status"
          data-testid="hero-filter-empty"
        >
          {teamUnknown
            ? "還沒有讀到存檔的出陣隊伍，不能依上陣篩選。請稍後再試，或按「清除條件」顯示全部。"
            : statusFilters
              ? "沒有符合條件的武將。請調整搜尋文字或篩選條件，或按「清除條件」顯示全部。"
              : "沒有符合條件的武將。請調整搜尋文字或職業，或按「清除條件」顯示全部。"}
        </div>
      )}
    </div>
  );
}
