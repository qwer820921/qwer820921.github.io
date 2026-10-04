"use client";

import React, { useId, useRef, useState } from "react";
import { Row, Col } from "react-bootstrap";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import { isStageUnlocked } from "../../utils/stageUtils";
import { stageAirReadiness } from "../../utils/stageAirReadiness";
import {
  stageDataProblem,
  stageDataProblemText,
} from "../../utils/stagePlayability";
import {
  DEFAULT_STAGE_FILTER,
  StageFilterCriteria,
  filterStages,
  stageChapters,
} from "../../utils/stageFilter";
import EnemyPreviewModal from "./EnemyPreviewModal";
import StageAirReadinessNote from "../StageAirReadinessNote";
import StageDataNote from "../StageDataNote";
import StageFilterBar from "../StageFilterBar";
import { useDialogFocus } from "../useDialogFocus";
import styles from "../../styles/shenmaSanguo.module.css";

interface Props {
  /** 只會以可以出征的關卡呼叫（規則見 utils/stagePlayability） */
  onSelect: (mapId: string) => void;
  onClose: () => void;
  /**
   * 關閉後開啟它的按鈕已經不在畫面上時（例如從拒絕開戰的提示打開、換關後原本的提示已卸載），焦點改交給這個元素
   * （主頁 HUD 的「切換關卡」）
   */
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * 主頁的關卡選擇：只有可以出征的關卡能選。關卡資料未完成的關卡標示「尚未開放」與原因、按鈕停用；
 * 點了這種關卡只在視窗上方說明，不切換、不結束目前的戰場（可以接著選其他關卡）。
 * 上方的搜尋、章節與狀態篩選（和獨立的關卡頁共用 utils/stageFilter）只改變顯示哪些卡片，不改變能不能出征。
 * 鍵盤：開啟時焦點移到右上的關閉鈕，Tab 只在視窗內循環（不會進到背後的戰場與 HUD），Esc 關閉；
 * 裡面的敵軍預覽開著時由預覽處理（Esc 先關預覽、焦點回到它的「敵軍預覽」按鈕；
 * 那張卡片已被篩選藏起或從設定移除時改回搜尋框）。
 * 關閉後焦點回到開啟它的按鈕，按鈕已不在畫面上時交給 fallbackFocusRef
 */
export default function StageSelectModal({
  onSelect,
  onClose,
  fallbackFocusRef,
}: Props) {
  const { player } = usePlayerStore();
  const { config: staticConfig } = useStaticConfigStore();
  // 正在查看敵軍預覽的關卡（唯讀，不切換關卡）
  const [previewId, setPreviewId] = useState<string | null>(null);
  // 剛才點了不能出征的關卡：說明原因（目前的戰場不受影響）
  const [refused, setRefused] = useState<string | null>(null);
  // 搜尋與篩選（只影響顯示）
  const [criteria, setCriteria] =
    useState<StageFilterCriteria>(DEFAULT_STAGE_FILTER);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onKeyDown = useDialogFocus(panelRef, closeRef, onClose, {
    fallbackFocus: () => fallbackFocusRef?.current ?? null,
  });

  if (!player || !staticConfig) return null;
  // 預覽照目前設定裡的同一關（篩選藏起卡片時仍開著）；設定裡已經沒有這一關時關閉，之後設定恢復也不自己重開
  const previewMap =
    staticConfig.maps.find((m) => m.map_id === previewId) ?? null;
  if (previewId !== null && !previewMap) setPreviewId(null);

  const filtered = filterStages(staticConfig.maps, criteria, player.max_stage);

  return (
    <>
      <div className={styles.modalBackdrop} onClick={onClose}>
        <div
          ref={panelRef}
          className={styles.modalPanel}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onKeyDown}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-testid="stage-select-dialog"
        >
          <div className={styles.modalHeader}>
            <span id={titleId} className={styles.modalTitle}>
              關卡選擇
            </span>
            <span style={{ fontSize: "0.72rem", color: "var(--sg-muted)" }}>
              進度：
              <span style={{ color: "var(--sg-gold)" }}>
                {staticConfig.maps.find((m) => m.map_id === player.max_stage)
                  ?.name || player.max_stage}
              </span>
            </span>
            <button
              ref={closeRef}
              className={styles.modalClose}
              onClick={onClose}
              aria-label="關閉關卡選擇"
            >
              ×
            </button>
          </div>
          <div className={styles.modalBody}>
            <StageFilterBar
              criteria={criteria}
              onChange={setCriteria}
              chapters={stageChapters(staticConfig.maps)}
              matched={filtered.matched}
              total={filtered.total}
              statusUnknown={filtered.statusUnknown}
              searchRef={searchRef}
            />
            {refused && (
              <div
                className={styles.stageRefused}
                role="status"
                data-testid="stage-refused"
              >
                {refused}
              </div>
            )}
            {filtered.groups.map(({ chapter, maps }) => (
              <div key={String(chapter)} style={{ marginBottom: "1.5rem" }}>
                <div className={styles.chapterHeader}>
                  <div className={styles.chapterLine} />
                  <div className={styles.chapterName}>第 {chapter} 章</div>
                  <div className={styles.chapterLine} />
                </div>
                <Row className="g-3">
                  {maps.map((map) => {
                    const unlocked = isStageUnlocked(
                      map.map_id,
                      player.max_stage
                    );
                    const isCurrent = map.map_id === player.max_stage;
                    // 關卡資料未完成（沒有路線或沒有波次）：尚未開放，不能出征
                    const problem = stageDataProblem(map);
                    const playable = unlocked && !problem;
                    // 出征前的對空準備：只看目前上陣的隊伍（隊伍或設定改變時重新計算）
                    const air = stageAirReadiness(
                      map,
                      staticConfig.enemiesConfig,
                      player.team,
                      staticConfig.heroesConfig
                    );
                    const choose = () => {
                      if (playable) onSelect(map.map_id);
                      else if (problem)
                        setRefused(
                          `「${map.name}」尚未開放（${stageDataProblemText(problem)}），不能出征；目前的戰場沒有改變，可以選擇其他關卡。`
                        );
                    };
                    return (
                      <Col xs={12} sm={6} key={map.map_id}>
                        <div
                          className={`${styles.stageCard} ${
                            problem
                              ? styles.stageCardUnavailable
                              : !unlocked
                                ? styles.stageCardLocked
                                : isCurrent
                                  ? `${styles.stageCardUnlocked} ${styles.stageCardCurrent}`
                                  : styles.stageCardUnlocked
                          }`}
                          onClick={choose}
                          data-testid="stage-card"
                          data-map-id={map.map_id}
                          data-access={
                            problem
                              ? "incomplete"
                              : unlocked
                                ? "playable"
                                : "locked"
                          }
                        >
                          <div style={{ padding: "0.9rem 1rem" }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                marginBottom: "0.55rem",
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontWeight: 700,
                                    color: "var(--sg-text)",
                                    fontSize: "0.9rem",
                                  }}
                                >
                                  {map.name}
                                </div>
                              </div>
                              {problem ? (
                                <span className={styles.stageDataBadge}>
                                  尚未開放
                                </span>
                              ) : !unlocked ? (
                                <span
                                  style={{
                                    fontSize: "0.62rem",
                                    color: "var(--sg-muted)",
                                    background: "var(--sg-surface2)",
                                    borderRadius: 4,
                                    padding: "2px 7px",
                                    border: "1px solid var(--sg-border)",
                                  }}
                                >
                                  鎖定
                                </span>
                              ) : isCurrent ? (
                                <span
                                  style={{
                                    fontSize: "0.62rem",
                                    color: "var(--sg-gold)",
                                    background: "rgba(232,196,106,0.12)",
                                    borderRadius: 4,
                                    padding: "2px 7px",
                                    border: "1px solid rgba(232,196,106,0.3)",
                                  }}
                                >
                                  最新
                                </span>
                              ) : null}
                            </div>
                            {problem ? (
                              <StageDataNote problem={problem} />
                            ) : (
                              <StageAirReadinessNote
                                readiness={air}
                                variant="card"
                              />
                            )}
                            <button
                              className={
                                playable ? styles.btnGold : styles.btnOutline
                              }
                              style={{
                                width: "100%",
                                fontSize: "0.8rem",
                                padding: "0.4rem",
                              }}
                              disabled={!playable}
                              data-testid="stage-select"
                              onClick={(e) => {
                                e.stopPropagation();
                                choose();
                              }}
                            >
                              {problem
                                ? "尚未開放"
                                : unlocked
                                  ? "選擇關卡"
                                  : "尚未解鎖"}
                            </button>
                            {/* 只查看，不切換關卡：不能冒泡到卡片（卡片點下去就是選擇關卡） */}
                            <button
                              className={`${styles.btnOutline} w-100 mt-2`}
                              style={{
                                fontSize: "0.76rem",
                                padding: "0.3rem",
                              }}
                              data-testid="enemy-preview-open"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewId(map.map_id);
                              }}
                            >
                              敵軍預覽
                            </button>
                          </div>
                        </div>
                      </Col>
                    );
                  })}
                </Row>
              </div>
            ))}
          </div>
        </div>
      </div>
      {previewMap && (
        <EnemyPreviewModal
          map={previewMap}
          enemies={staticConfig.enemiesConfig ?? []}
          team={player.team}
          heroesConfig={staticConfig.heroesConfig}
          locked={!isStageUnlocked(previewMap.map_id, player.max_stage)}
          onClose={() => setPreviewId(null)}
          fallbackFocus={() => searchRef.current}
        />
      )}
    </>
  );
}
