"use client";

import React, { useState, useEffect, useId, useRef } from "react";
import { Row, Col, Alert } from "react-bootstrap";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import { TeamSlot } from "../../types";
import HeroFilterBar from "../HeroFilterBar";
import {
  DEFAULT_HERO_FILTER,
  HeroFilterCriteria,
  TEAM_SORT_OPTIONS,
  filterAndSortHeroes,
  resolveHeroState,
} from "../../utils/heroFilter";
import { jobInfo, rarityInfo } from "../../utils/heroCategories";
import { onActivateKey } from "../../utils/keyboard";
import { useDialogFocus } from "../useDialogFocus";
import styles from "../../styles/shenmaSanguo.module.css";

const MAX_SLOTS = 5;

interface Props {
  onClose: () => void;
  onTeamSaved?: () => void;
  /** 關閉時開啟前的元素已經不在畫面上（或開啟時焦點不在任何元素上）時，焦點改交給這個元素（主頁 HUD 的「隊伍」按鈕） */
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
}

/** 按下的按鈕停用或消失時，焦點要交給誰（下一次畫面更新後處理） */
type FocusAfter =
  | { kind: "move"; heroId: string; dir: -1 | 1 }
  | { kind: "remove"; heroId: string; index: number }
  | { kind: "save" };

/**
 * 主頁（戰場的 HUD）的隊伍編排視窗：有名稱的對話框，鍵盤沿用 useDialogFocus。
 * 開啟時焦點在右上的關閉鈕，Tab／Shift+Tab 只在視窗內循環，Esc 關閉，關閉後焦點回到開啟它的按鈕（不在畫面上時交給「隊伍」）。
 * 槽位的 ‹ › 移動後焦點跟著那位武將（同方向的按鈕停用時換到另一個方向）；× 移除後交給同一個位置的下一位武將的 ×，
 * 沒有時交給前一位，再沒有時交給那位武將在下方的卡片。按下「儲存隊伍」後按鈕停用（已儲存或寫入限制中）時，焦點交給下方的「關閉」。
 * 玩家資料或設定還沒載入時，仍然顯示標題、關閉鈕與「隊伍資料載入中…」
 */
export default function TeamEditModal({
  onClose,
  onTeamSaved,
  fallbackFocusRef,
}: Props) {
  const { player, updateTeam, writeHold } = usePlayerStore();
  const { config: staticConfig } = useStaticConfigStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  // 搜尋、職業與排序只篩選下方可選的武將（出陣槽位照常顯示）；只在這個視窗的記憶體，關閉後恢復預設
  const [criteria, setCriteria] =
    useState<HeroFilterCriteria>(DEFAULT_HERO_FILTER);

  useEffect(() => {
    if (player) {
      const sorted = [...(player.team || [])].sort((a, b) => a.slot - b.slot);
      setSelected(sorted.map((s) => s.hero_id));
    }
  }, [player]);

  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bottomCloseRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const onKeyDown = useDialogFocus(panelRef, closeRef, onClose, {
    fallbackFocus: () => fallbackFocusRef?.current ?? null,
  });
  const focusAfterRef = useRef<FocusAfter | null>(null);
  useEffect(() => {
    const want = focusAfterRef.current;
    const panel = panelRef.current;
    if (!want || !panel) return;
    focusAfterRef.current = null;
    const slotOf = (heroId: string) =>
      Array.from(
        panel.querySelectorAll<HTMLElement>('[data-testid="team-slot"]')
      ).find((el) => el.dataset.heroId === heroId);
    let target: HTMLElement | null = null;
    if (want.kind === "move") {
      const slot = slotOf(want.heroId);
      const same = slot?.querySelector<HTMLButtonElement>(
        `button[data-move="${want.dir}"]`
      );
      const other = slot?.querySelector<HTMLButtonElement>(
        `button[data-move="${-want.dir}"]`
      );
      target =
        same && !same.disabled ? same : other && !other.disabled ? other : null;
    } else if (want.kind === "remove") {
      const removes = panel.querySelectorAll<HTMLElement>(
        '[data-testid="team-slot-remove"]'
      );
      target =
        removes[want.index] ??
        removes[want.index - 1] ??
        Array.from(
          panel.querySelectorAll<HTMLElement>('[data-testid="team-pool-card"]')
        ).find((el) => el.dataset.heroId === want.heroId) ??
        closeRef.current;
    } else if (saveRef.current?.disabled) {
      target = bottomCloseRef.current;
    }
    target?.focus();
  });

  const header = (
    <div className={styles.modalHeader}>
      <span id={titleId} className={styles.modalTitle}>
        隊伍編排
      </span>
      <button
        ref={closeRef}
        type="button"
        className={styles.modalClose}
        onClick={onClose}
        aria-label="關閉隊伍編排"
      >
        ×
      </button>
    </div>
  );

  // 玩家資料或設定還沒載入（或切換存檔時暫時沒有）：仍然顯示視窗與關閉鈕，焦點與 Esc 照常可用
  if (!player || !staticConfig) {
    return (
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
        >
          {header}
          <div className={styles.modalBody}>
            <div role="status" className="small text-muted">
              隊伍資料載入中…
            </div>
          </div>
        </div>
      </div>
    );
  }

  const capacity = player.capacity;
  const usedCost = selected.reduce((sum, heroId) => {
    const conf = staticConfig.heroesConfig.find((c) => c.hero_id === heroId);
    return sum + (conf?.cost ?? 0);
  }, 0);
  const isOverCapacity = usedCost > capacity;
  const fillPct = Math.min(usedCost / capacity, 1);

  const toggleHero = (heroId: string) => {
    setSaved(false);
    setSelected((prev) =>
      prev.includes(heroId)
        ? prev.filter((id) => id !== heroId)
        : [...prev, heroId]
    );
  };

  // Plan C: 左右移動槽位順序
  const moveHero = (idx: number, dir: -1 | 1) => {
    if (selected[idx]) {
      focusAfterRef.current = { kind: "move", heroId: selected[idx], dir };
    }
    setSaved(false);
    setSelected((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  // 槽位的 ×：移除後焦點交給同一個位置的下一位（見 focusAfterRef）
  const removeFromSlot = (idx: number, heroId: string) => {
    focusAfterRef.current = { kind: "remove", heroId, index: idx };
    toggleHero(heroId);
  };

  const handleSave = () => {
    focusAfterRef.current = { kind: "save" };
    const newTeam: TeamSlot[] = selected.map((heroId, idx) => ({
      hero_id: heroId,
      slot: idx + 1,
    }));
    // 寫入限制中 store 不修改（回傳 false）：不顯示「已儲存」
    if (!updateTeam(newTeam)) return;
    setSaved(true);
    onTeamSaved?.();
  };

  const isDirty =
    JSON.stringify(selected) !==
    JSON.stringify(
      [...(player.team || [])]
        .sort((a, b) => a.slot - b.slot)
        .map((s) => s.hero_id)
    );

  const displaySlots = Array.from(
    { length: Math.max(MAX_SLOTS, selected.length) },
    (_, i) => {
      const heroId = selected[i] ?? null;
      const config = heroId
        ? staticConfig.heroesConfig.find((c) => c.hero_id === heroId)
        : null;
      const hero = config ? resolveHeroState(config, player.heroes) : null;
      return { heroId, config, hero };
    }
  );

  // 可選的武將：共用的搜尋、職業篩選與排序（入隊、移除一律用 hero_id，不看列表位置）
  const listed = filterAndSortHeroes(
    staticConfig.heroesConfig,
    player.heroes,
    criteria
  );

  return (
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
      >
        {header}
        <div className={styles.modalBody}>
          {/* 容量條 */}
          <div style={{ marginBottom: "1.25rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.72rem",
                marginBottom: "0.3rem",
              }}
            >
              <span style={{ color: "var(--sg-muted)" }}>容量</span>
              <span
                style={{
                  fontWeight: 700,
                  color: isOverCapacity ? "var(--sg-red)" : "var(--sg-gold)",
                }}
              >
                {usedCost} / {capacity}
              </span>
            </div>
            <div className={styles.capacityBarBg}>
              <div
                className={styles.capacityBarFill}
                style={{
                  width: `${fillPct * 100}%`,
                  background: isOverCapacity
                    ? "var(--sg-red)"
                    : "var(--sg-gold)",
                }}
              />
            </div>
            {isOverCapacity && (
              <p
                style={{
                  color: "var(--sg-red)",
                  fontSize: "0.7rem",
                  marginTop: "0.3rem",
                }}
              >
                超出容量上限，請移除部分武將
              </p>
            )}
          </div>

          {/* 出陣槽位 */}
          <div style={{ marginBottom: "1.25rem" }}>
            <div className={styles.sectionLabel}>出陣隊伍</div>
            <div className={styles.slotsRow}>
              {displaySlots.map(({ heroId, config, hero }, i) => (
                <div
                  key={i}
                  className={
                    heroId ? `${styles.slot} ${styles.slotFilled}` : styles.slot
                  }
                  onClick={() => heroId && toggleHero(heroId)}
                  title={heroId ? "點擊移除" : undefined}
                  data-testid="team-slot"
                  data-hero-id={heroId ?? ""}
                >
                  <span className={styles.slotNum}>#{i + 1}</span>
                  {config && hero ? (
                    <>
                      {/* Plan D: 職業色點 */}
                      <div
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: jobInfo(config.job).color,
                          marginTop: "0.15rem",
                          flexShrink: 0,
                        }}
                      />
                      <div className={styles.slotName}>{config.name}</div>
                      <div className={styles.slotLv}>Lv.{hero.level}</div>
                      {/* Plan D: cost chip */}
                      <div
                        style={{
                          fontSize: "0.5rem",
                          color: "var(--sg-gold)",
                          marginTop: "1px",
                        }}
                      >
                        Cost {config.cost}
                      </div>
                      {/* Plan C: 排序箭頭 */}
                      <div
                        className={styles.slotArrows}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className={styles.slotArrowBtn}
                          onClick={() => moveHero(i, -1)}
                          disabled={i === 0}
                          data-move="-1"
                          aria-label={`${config.name} 往前移`}
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          className={styles.slotArrowBtn}
                          onClick={() => removeFromSlot(i, config.hero_id)}
                          aria-label={`移除 ${config.name}`}
                          data-testid="team-slot-remove"
                        >
                          ×
                        </button>
                        <button
                          type="button"
                          className={styles.slotArrowBtn}
                          onClick={() => moveHero(i, 1)}
                          disabled={i === selected.length - 1}
                          data-move="1"
                          aria-label={`${config.name} 往後移`}
                        >
                          ›
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className={styles.slotEmpty}>空</div>
                  )}
                </div>
              ))}
            </div>
            <p
              style={{
                fontSize: "0.62rem",
                color: "var(--sg-muted)",
                marginTop: "0.3rem",
              }}
            >
              點擊槽位或 × 移除　‹ › 調整順序
            </p>
          </div>

          {/* 武將池 */}
          <div style={{ marginBottom: "1rem" }}>
            <div className={styles.sectionLabel}>選擇武將</div>

            <HeroFilterBar
              criteria={criteria}
              onChange={setCriteria}
              matched={listed.matched}
              total={listed.total}
              sortOptions={TEAM_SORT_OPTIONS}
              ariaLabel="可選武將的搜尋與篩選"
            />

            <Row className="g-2">
              {listed.items.map(({ config, hero }) => {
                const isSelected = selected.includes(config.hero_id);
                const color = rarityInfo(config.rarity).color;
                const job = jobInfo(config.job);
                return (
                  <Col xs={6} sm={4} key={config.hero_id}>
                    {/* Plan A + E: 圖片 + 稀有度頂部色框 */}
                    <div
                      className={`${styles.poolCard} ${isSelected ? styles.poolCardActive : ""}`}
                      style={{
                        flexDirection: "column",
                        borderTopColor: color,
                        borderTopWidth: "3px",
                      }}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={`${config.name}（${job.label}，出陣費用 ${config.cost}）`}
                      onClick={() => toggleHero(config.hero_id)}
                      onKeyDown={onActivateKey(() =>
                        toggleHero(config.hero_id)
                      )}
                      data-testid="team-pool-card"
                      data-hero-id={config.hero_id}
                    >
                      <div className={styles.heroCardImg}>
                        {config.image ? (
                          <img
                            src={`/images/shenmaSanguo/units/${config.image}`}
                            alt={config.name}
                            className={styles.heroCardImgEl}
                          />
                        ) : (
                          <div className={styles.heroCardImgPlaceholder}>
                            {config.name[0]}
                          </div>
                        )}
                      </div>
                      <div style={{ padding: "0.4rem 0.5rem", flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: "0.82rem",
                            color: "var(--sg-text)",
                            marginBottom: "0.08rem",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {config.name}
                        </div>
                        <div
                          style={{
                            fontSize: "0.62rem",
                            color: "var(--sg-muted)",
                          }}
                        >
                          <span style={{ color: job.color, fontWeight: 600 }}>
                            {job.label}
                          </span>
                          　Lv.{hero.level}　Cost{" "}
                          <span style={{ color: "var(--sg-gold)" }}>
                            {config.cost}
                          </span>
                        </div>
                        {isSelected && (
                          <div
                            style={{
                              fontSize: "0.58rem",
                              color,
                              fontWeight: 600,
                              marginTop: "0.1rem",
                            }}
                          >
                            出陣 #{selected.indexOf(config.hero_id) + 1}
                          </div>
                        )}
                      </div>
                    </div>
                  </Col>
                );
              })}
            </Row>
          </div>

          {saved && !isDirty && (
            <Alert variant="success" className="py-2 small">
              隊伍已儲存，將於 30 秒內同步至雲端。
            </Alert>
          )}
          {writeHold && (
            <Alert
              variant="warning"
              className="py-2 small"
              data-testid="team-hold"
            >
              這個分頁的存檔暫停保存，隊伍暫時不能修改（見畫面下方的說明）。
            </Alert>
          )}

          <div style={{ display: "flex", gap: "0.65rem", marginTop: "0.5rem" }}>
            <button
              ref={bottomCloseRef}
              type="button"
              className={styles.btnOutline}
              onClick={onClose}
            >
              關閉
            </button>
            <button
              ref={saveRef}
              type="button"
              className={styles.btnGold}
              style={{ flex: 1 }}
              onClick={handleSave}
              disabled={
                writeHold || !isDirty || isOverCapacity || selected.length === 0
              }
            >
              儲存隊伍
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
