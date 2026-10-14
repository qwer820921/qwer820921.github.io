"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Row, Col, Spinner, Alert } from "react-bootstrap";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import { HeroState, HeroConfig } from "../../types";
import HeroSkillInfo from "../HeroSkillInfo";
import HeroAntiAir from "../HeroAntiAir";
import HeroFilterBar from "../HeroFilterBar";
import HeroCompareBar from "../HeroCompareBar";
import HeroCompareDialog from "./HeroCompareDialog";
import { useDialogFocus } from "../useDialogFocus";
import { useHeroCompare } from "../useHeroCompare";
import { compareColumns } from "../../utils/heroCompare";
import { attackIntervalSec, formatSec } from "../../utils/heroStats";
import {
  DEFAULT_HERO_FILTER,
  HeroFilterCriteria,
  filterAndSortHeroes,
  resolveHeroState,
  teamHeroIdSet,
} from "../../utils/heroFilter";
import { jobInfo, rarityInfo } from "../../utils/heroCategories";
import styles from "../../styles/shenmaSanguo.module.css";

const r = (n: number) => Math.round(n);

// ── 升級詳情：純內容，無外框，由 HeroListModal 的 detail modal 包裹 ──
function HeroDetailContent({
  hero,
  config,
  gold,
  onClose,
  onUpgrade,
  onUpgraded,
}: {
  hero: HeroState;
  config: HeroConfig;
  gold: number;
  onClose: () => void;
  onUpgrade: () => Promise<{ success: boolean; error?: string }>;
  onUpgraded?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "danger";
    msg: string;
  } | null>(null);

  const cost = config.upgrade_cost_base * hero.level;
  const canAfford = gold >= cost;
  // 寫入限制中不能升級（store 也會拒絕）：按鈕停用並說明
  const writeHold = usePlayerStore((s) => s.writeHold);
  const blocked = loading || !canAfford || writeHold;

  // 升級處理中按鈕停用，焦點會掉到頁面本身（Tab／Esc 照樣由視窗處理）：處理完後焦點還在頁面本身時，
  // 放回升級按鈕（仍然可以按時），否則放回「關閉」
  const upgradeRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef(false);
  useEffect(() => {
    if (loading || !restoreRef.current) return;
    restoreRef.current = false;
    const a = document.activeElement;
    if (a && a !== document.body) return;
    const up = upgradeRef.current;
    (up && !up.disabled ? up : closeBtnRef.current)?.focus();
  });

  const handleUpgrade = async () => {
    setLoading(true);
    setFeedback(null);
    const result = await onUpgrade();
    restoreRef.current = true;
    setLoading(false);
    if (result.success) {
      setFeedback({ type: "success", msg: "升級成功！" });
      onUpgraded?.();
    } else {
      const errMap: Record<string, string> = {
        GOLD_NOT_ENOUGH: "戰場點數不足",
        NOT_LOADED: "玩家資料尚未載入",
        HERO_NOT_FOUND: "武將資料異常",
        UPGRADE_IN_PROGRESS: "上一次升級還在處理中，請稍候",
        ACCOUNT_CHANGED: "存檔已切換，這次升級沒有套用",
        UPGRADE_UNCONFIRMED:
          "連線中斷，無法確定升級是否完成。請先用畫面下方的「重新確認」，不要重複升級",
        MIGRATION_HOLD: "這個分頁的存檔暫停保存，不能升級（見畫面下方的說明）",
        REV_CONFLICT:
          "雲端存檔在其他分頁或裝置更新過，這次升級沒有扣點數。請先用畫面下方的提示比較並選擇要保留的存檔",
        REV_CONFLICT_RELOADED:
          "雲端存檔在其他分頁或裝置更新過，已載入最新的資料，這次升級沒有扣點數。請確認後再升級一次",
      };
      setFeedback({
        type: "danger",
        msg: errMap[result.error ?? ""] ?? "升級失敗，請稍後再試",
      });
    }
  };

  return (
    <>
      {/* 四格數據 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          textAlign: "center",
          marginBottom: "0.85rem",
        }}
      >
        {[
          { label: "Lv", value: r(hero.level), c: "var(--sg-text)" },
          { label: "ATK", value: r(hero.atk), c: "var(--sg-red)" },
          { label: "DEF", value: r(hero.def), c: "var(--sg-blue)" },
          { label: "HP", value: r(hero.hp), c: "var(--sg-green)" },
        ].map(({ label, value, c }) => (
          <div key={label}>
            <div
              style={{
                fontSize: "0.6rem",
                color: "var(--sg-muted)",
                marginBottom: 2,
              }}
            >
              {label}
            </div>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: c }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* 升級預覽 */}
      <div
        style={{
          background: "var(--sg-surface2)",
          border: "1px solid var(--sg-border)",
          borderRadius: 8,
          padding: "0.65rem",
          marginBottom: "0.75rem",
        }}
      >
        <div
          style={{
            color: "var(--sg-muted)",
            fontSize: "0.65rem",
            marginBottom: "0.4rem",
          }}
        >
          升至 Lv.{hero.level + 1} 後
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            textAlign: "center",
            gap: "0.15rem",
          }}
        >
          {[
            {
              label: "ATK",
              cur: r(hero.atk),
              next: r(hero.atk + config.atk_growth),
              c: "var(--sg-red)",
            },
            {
              label: "DEF",
              cur: r(hero.def),
              next: r(hero.def + config.def_growth),
              c: "var(--sg-blue)",
            },
            {
              label: "HP",
              cur: r(hero.hp),
              next: r(hero.hp + config.hp_growth),
              c: "var(--sg-green)",
            },
          ].map(({ label, cur, next, c }) => (
            <div key={label}>
              <div style={{ color: "var(--sg-muted)", fontSize: "0.6rem" }}>
                {label}
              </div>
              <div style={{ color: c, fontWeight: 600, fontSize: "0.78rem" }}>
                {cur} → {next}
              </div>
            </div>
          ))}
        </div>
        {/* 攻擊間隔（秒，越小越快）：和戰場上的 Godot 用同一個公式（utils/heroStats） */}
        <div
          className="text-center mt-2"
          style={{ color: "var(--sg-muted)", fontSize: "0.7rem" }}
          data-testid="attack-interval-preview"
        >
          攻擊間隔 {formatSec(attackIntervalSec(config, hero.level))} 秒 →{" "}
          {formatSec(attackIntervalSec(config, hero.level + 1))}{" "}
          秒（數字越小攻擊越快）
        </div>
      </div>

      {/* 費用 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.82rem",
          marginBottom: "0.35rem",
        }}
      >
        <span style={{ color: "var(--sg-muted)" }}>升級費用</span>
        <span
          style={{
            fontWeight: 700,
            color: canAfford ? "var(--sg-gold)" : "var(--sg-red)",
          }}
        >
          {cost.toLocaleString()} 點
        </span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.82rem",
          marginBottom: "0.75rem",
        }}
      >
        <span style={{ color: "var(--sg-muted)" }}>目前戰場點數</span>
        <span style={{ color: "var(--sg-gold)" }}>
          {gold.toLocaleString()} 點
        </span>
      </div>

      {feedback && (
        <Alert variant={feedback.type} className="py-2 small mb-3">
          {feedback.msg}
        </Alert>
      )}

      {writeHold && (
        <Alert
          variant="warning"
          className="py-2 small mb-3"
          data-testid="upgrade-hold"
        >
          這個分頁的存檔暫停保存，不能升級（見畫面下方的說明）。
        </Alert>
      )}

      {/* 按鈕 */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          style={{
            flex: 1,
            background: "transparent",
            border: "1px solid var(--sg-border)",
            color: "var(--sg-muted)",
            borderRadius: 8,
            padding: "0.45rem",
            cursor: "pointer",
            fontSize: "0.82rem",
          }}
        >
          關閉
        </button>
        <button
          ref={upgradeRef}
          type="button"
          onClick={handleUpgrade}
          disabled={blocked}
          style={{
            flex: 2,
            background: blocked
              ? "rgba(99,102,241,0.2)"
              : "linear-gradient(135deg,#6366f1,#818cf8)",
            border: "none",
            color: blocked ? "#6366f1" : "#fff",
            fontWeight: 700,
            borderRadius: 8,
            padding: "0.5rem",
            cursor: canAfford && !writeHold ? "pointer" : "not-allowed",
            fontSize: "0.88rem",
            opacity: blocked ? 0.6 : 1,
          }}
        >
          {loading ? (
            <>
              <Spinner animation="border" size="sm" className="me-1" />
              升級中...
            </>
          ) : (
            `升級 (-${cost} 點)`
          )}
        </button>
      </div>
    </>
  );
}
// ── 武將詳情 modal（疊在列表上方）：自己的視窗焦點與按鍵（Esc 只關閉詳情，焦點還給開啟它的卡片）──
function HeroDetailDialog({
  hero,
  config,
  gold,
  onClose,
  onUpgrade,
  onUpgraded,
  listPanelRef,
  listCloseRef,
}: {
  hero: HeroState;
  config: HeroConfig;
  gold: number;
  onClose: () => void;
  onUpgrade: () => Promise<{ success: boolean; error?: string }>;
  onUpgraded?: () => void;
  /** 下層武將列表的視窗與關閉鈕（詳情關閉時的退路） */
  listPanelRef: React.RefObject<HTMLElement | null>;
  listCloseRef: React.RefObject<HTMLElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const heroId = config.hero_id;
  // 關閉時，開啟它的卡片已經不在畫面上（或開啟時焦點不在任何元素上）：交給列表裡同一位武將的卡片，
  // 沒有時交給列表的搜尋框，再沒有時交給列表的關閉鈕
  const onKeyDown = useDialogFocus(panelRef, closeRef, onClose, {
    fallbackFocus: () => {
      const list = listPanelRef.current;
      if (!list) return null;
      const card = Array.from(
        list.querySelectorAll<HTMLElement>("[data-hero-id]")
      ).find((el) => el.dataset.heroId === heroId);
      return (
        card ??
        list.querySelector<HTMLElement>('input[type="search"]') ??
        listCloseRef.current
      );
    },
  });
  const rarity = rarityInfo(config.rarity);
  const job = jobInfo(config.job);
  const color = rarity.color;
  const jColor = job.color;
  return (
    <div
      className={styles.modalBackdrop}
      style={{ zIndex: 210 }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={styles.modalPanel}
        style={{ maxWidth: 380 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label={`武將詳情：${config.name}`}
        tabIndex={-1}
        data-testid="hero-detail"
        data-hero-id={config.hero_id}
        data-hero-level={hero.level}
      >
        {/* 頭像 banner */}
        {config.image && (
          <div
            style={{
              position: "relative",
              height: 150,
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <img
              src={`/images/shenmaSanguo/units/${config.image}`}
              alt={config.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "top center",
                display: "block",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(to bottom, transparent 35%, rgba(255,255,255,0.92) 100%)`,
              }}
            />
          </div>
        )}

        {/* Header：名字 + 稀有度 + 職業 + 關閉 */}
        <div
          className={styles.modalHeader}
          style={{ borderTop: `3px solid ${color}` }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              flex: 1,
            }}
          >
            <span className={styles.modalTitle}>{config.name}</span>
            <span
              style={{
                background: `${color}22`,
                color,
                border: `1px solid ${color}55`,
                borderRadius: 4,
                fontSize: "0.6rem",
                padding: "1px 5px",
              }}
            >
              {rarity.label}
            </span>
            <span
              style={{
                fontSize: "0.65rem",
                color: jColor,
                fontWeight: 600,
              }}
            >
              {job.label}
            </span>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="關閉武將詳情"
          >
            ×
          </button>
        </div>

        {/* Body：技能與升級詳情 */}
        <div className={styles.modalBody}>
          <HeroSkillInfo
            heroId={config.hero_id}
            variant="full"
            rawRange={
              config.attack_range + (hero.level - 1) * config.range_growth
            }
            atk={hero.atk}
          />
          <HeroAntiAir job={config.job} />
          <HeroDetailContent
            hero={hero}
            config={config}
            gold={gold}
            onClose={onClose}
            onUpgrade={onUpgrade}
            onUpgraded={onUpgraded}
          />
        </div>
      </div>
    </div>
  );
}

interface Props {
  onClose: () => void;
  onHeroUpgraded?: () => void;
  /** 關閉時開啟前的元素（「武將」按鈕）已經不在畫面上時，焦點改交給它 */
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * 主頁（戰場的 HUD）的武將列表視窗與疊在上面的武將詳情：兩層各自是視窗（useDialogFocus）。
 * 開啟時焦點在右上的關閉鈕，Tab／Shift+Tab 只在最上層的視窗內循環，Esc 只關閉最上層；
 * 詳情關閉後焦點回到開啟它的卡片，列表關閉後回到「武將」按鈕。卡片是原生按鈕（Enter／空白鍵開啟詳情）；
 * 按鈕裡只能放行內的內容，原本的區塊都用 span（顯示方式由樣式決定，版面不變）
 */
export default function HeroListModal({
  onClose,
  onHeroUpgraded,
  fallbackFocusRef,
}: Props) {
  const { player, upgradeHero } = usePlayerStore();
  const { config: staticConfig } = useStaticConfigStore();
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  // 搜尋／職業／排序只影響這個視窗的顯示；關閉視窗（元件卸載）就回到預設
  const [criteria, setCriteria] =
    useState<HeroFilterCriteria>(DEFAULT_HERO_FILTER);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onKeyDown = useDialogFocus(panelRef, closeRef, onClose, {
    fallbackFocus: () => fallbackFocusRef?.current ?? null,
  });
  // 兩位武將的比較（比較模式中點卡片是選取，不開升級）；切換存檔時清掉
  const compare = useHeroCompare(
    player?.key ?? null,
    staticConfig?.heroesConfig ?? null
  );

  const ready = !!player && !!staticConfig;
  const header = (
    <div className={styles.modalHeader}>
      <span id={titleId} className={styles.modalTitle}>
        武將列表
      </span>
      {player && (
        <span style={{ fontSize: "0.72rem", color: "var(--sg-muted)" }}>
          戰場點數：
          <span style={{ color: "var(--sg-gold)", fontWeight: 700 }}>
            {(player.gold ?? 0).toLocaleString()}
          </span>
        </span>
      )}
      <button
        ref={closeRef}
        type="button"
        className={styles.modalClose}
        onClick={onClose}
        aria-label="關閉武將列表"
      >
        ×
      </button>
    </div>
  );

  // 玩家資料或設定還沒載入（或切換存檔時暫時沒有）：仍然顯示視窗與關閉鈕，焦點與 Esc 照常可用
  if (!ready) {
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
              武將資料載入中…
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 目前存檔出陣隊伍裡的武將（「在隊中」標示與上陣篩選共用；設定沒有的 id 不算）
  const teamHeroIds = teamHeroIdSet(player.team, staticConfig.heroesConfig);

  // 每次都用目前的玩家資料計算（升級、切換帳號後立即反映）；在隊中的武將也照常顯示
  const listed = filterAndSortHeroes(
    staticConfig.heroesConfig,
    player.heroes,
    criteria,
    teamHeroIds
  );
  const heroName = (id: string) =>
    staticConfig.heroesConfig.find((c) => c.hero_id === id)?.name ?? id;
  const shownIds = new Set(listed.items.map((e) => e.config.hero_id));

  const selectedConfig = selectedHeroId
    ? (staticConfig.heroesConfig.find((c) => c.hero_id === selectedHeroId) ??
      null)
    : null;
  const selectedHero = selectedConfig
    ? resolveHeroState(selectedConfig, player.heroes)
    : null;

  const closeDetail = () => setSelectedHeroId(null);

  return (
    <>
      {/* ── 武將列表 modal ── */}
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
            <HeroFilterBar
              criteria={criteria}
              onChange={setCriteria}
              matched={listed.matched}
              total={listed.total}
              statusFilters
              teamUnknown={listed.teamUnknown}
            />
            <HeroCompareBar
              active={compare.active}
              names={compare.selected.map(heroName)}
              hiddenNames={compare.selected
                .filter((id) => !shownIds.has(id))
                .map(heroName)}
              refused={compare.refused}
              onToggle={compare.toggleMode}
              onStart={compare.start}
              onClear={compare.clear}
            />

            {/* Hero grid */}
            <Row className="g-2">
              {listed.items.map(({ config, hero, cost: upgradeCost }) => {
                const rarity = rarityInfo(config.rarity);
                const job = jobInfo(config.job);
                const color = rarity.color;
                const jColor = job.color;
                const isSelected = config.hero_id === selectedHeroId;
                const inTeam = !!teamHeroIds?.has(config.hero_id);
                const canAfford = player.gold >= upgradeCost;
                const picked = compare.selected.includes(config.hero_id);
                return (
                  <Col xs={6} sm={4} key={config.hero_id}>
                    <button
                      type="button"
                      className={`${styles.heroCard} ${styles.heroCardButton}`}
                      data-hero-id={config.hero_id}
                      data-compare-picked={
                        compare.active ? String(picked) : undefined
                      }
                      aria-haspopup={compare.active ? undefined : "dialog"}
                      aria-pressed={compare.active ? picked : undefined}
                      style={{
                        flexDirection: "column",
                        borderTopColor: color,
                        borderTopWidth: "3px",
                        outline:
                          compare.active && picked
                            ? "3px solid var(--sg-blue)"
                            : isSelected
                              ? `2px solid ${color}55`
                              : undefined,
                      }}
                      onClick={() =>
                        compare.active
                          ? compare.pick(config.hero_id)
                          : setSelectedHeroId(config.hero_id)
                      }
                    >
                      <span
                        className={styles.heroCardImg}
                        style={{
                          borderBottom: `2px solid ${jColor}33`,
                        }}
                      >
                        {config.image ? (
                          <img
                            src={`/images/shenmaSanguo/units/${config.image}`}
                            alt={config.name}
                            className={styles.heroCardImgEl}
                          />
                        ) : (
                          <span className={styles.heroCardImgPlaceholder}>
                            {config.name[0]}
                          </span>
                        )}
                        {inTeam && (
                          <span className={styles.heroInTeamBadge}>在隊中</span>
                        )}
                      </span>
                      <span className={styles.heroCardInner}>
                        <span
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: "0.15rem",
                          }}
                        >
                          <span className={styles.heroName}>{config.name}</span>
                          <span
                            style={{
                              background: `${color}22`,
                              color,
                              border: `1px solid ${color}44`,
                              borderRadius: 3,
                              fontSize: "0.55rem",
                              padding: "1px 4px",
                              flexShrink: 0,
                              marginLeft: 4,
                            }}
                            title={
                              rarity.known
                                ? undefined
                                : "遊戲不認得的稀有度（保留原值）"
                            }
                            data-testid="hero-rarity"
                          >
                            {rarity.label}
                          </span>
                        </span>
                        <span
                          className="d-block"
                          style={{
                            fontSize: "0.62rem",
                            color: "var(--sg-muted)",
                            marginBottom: "0.2rem",
                          }}
                        >
                          <span
                            style={{ color: jColor, fontWeight: 600 }}
                            data-testid="hero-job"
                          >
                            {job.label}
                          </span>
                          　Lv.{hero.level}
                        </span>
                        <span className={styles.heroStats}>
                          <span style={{ color: "var(--sg-red)" }}>
                            ⚔ {r(hero.atk)}
                          </span>
                          <span style={{ color: "var(--sg-blue)" }}>
                            🛡 {r(hero.def)}
                          </span>
                          <span style={{ color: "var(--sg-green)" }}>
                            ❤ {r(hero.hp)}
                          </span>
                        </span>
                        <HeroSkillInfo heroId={config.hero_id} variant="tag" />
                        <span
                          className={
                            compare.active
                              ? styles.heroHint
                              : canAfford
                                ? styles.heroHintAffordable
                                : styles.heroHint
                          }
                        >
                          {compare.active
                            ? picked
                              ? "已選比較（再點取消）"
                              : "點選加入比較"
                            : canAfford
                              ? `可升級 (-${upgradeCost})`
                              : "點擊升級"}
                        </span>
                      </span>
                    </button>
                  </Col>
                );
              })}
            </Row>
          </div>
        </div>
      </div>

      {selectedHero && selectedConfig && (
        <HeroDetailDialog
          hero={selectedHero}
          config={selectedConfig}
          gold={player.gold}
          onClose={closeDetail}
          onUpgrade={() => upgradeHero(selectedHero.hero_id, selectedConfig)}
          onUpgraded={onHeroUpgraded}
          listPanelRef={panelRef}
          listCloseRef={closeRef}
        />
      )}

      {compare.open && (
        <HeroCompareDialog
          columns={compareColumns(
            compare.selected,
            staticConfig.heroesConfig,
            player.heroes
          )}
          onClose={compare.close}
          listPanelRef={panelRef}
          listCloseRef={closeRef}
        />
      )}
    </>
  );
}
