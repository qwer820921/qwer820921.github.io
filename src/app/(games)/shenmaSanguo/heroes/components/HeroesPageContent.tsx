"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Container,
  Row,
  Col,
  Modal,
  Spinner,
  Alert,
  Badge,
} from "react-bootstrap";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import { HeroState, HeroConfig, Rarity } from "../../types";
import HeroSkillInfo from "../../components/HeroSkillInfo";
import HeroAntiAir from "../../components/HeroAntiAir";
import HeroFilterBar from "../../components/HeroFilterBar";
import HeroCompareBar from "../../components/HeroCompareBar";
import HeroCompareTable from "../../components/HeroCompareTable";
import { FOCUSABLE } from "../../components/useDialogFocus";
import { useHeroCompare } from "../../components/useHeroCompare";
import { HeroCompareColumn, compareColumns } from "../../utils/heroCompare";
import { attackIntervalSec, formatSec } from "../../utils/heroStats";
import {
  DEFAULT_HERO_FILTER,
  HeroFilterCriteria,
  filterAndSortHeroes,
  resolveHeroState,
} from "../../utils/heroFilter";
import { jobInfo, rarityInfo } from "../../utils/heroCategories";
import styles from "../../styles/shenmaSanguo.module.css";

// ── 顯示設定（名稱與顏色在 utils/heroCategories；遊戲不認得的稀有度沒有底色） ──
const rarityBgClass: Record<string, string> = {
  [Rarity.Orange]: styles.rarityOrange,
  [Rarity.Purple]: styles.rarityPurple,
  [Rarity.Blue]: styles.rarityBlue,
  [Rarity.Green]: styles.rarityGreen,
};

// ── 升級 Modal ────────────────────────────────────────────
interface UpgradeModalProps {
  hero: HeroState;
  config: HeroConfig;
  gold: number;
  onClose: () => void;
  onUpgrade: () => Promise<{ success: boolean; error?: string }>;
}
function UpgradeModal({
  hero,
  config,
  gold,
  onClose,
  onUpgrade,
}: UpgradeModalProps) {
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
  const titleId = useId();

  // 升級處理中按鈕停用，焦點會掉到頁面本身（Tab／Esc 照樣由 Modal 處理）：處理完後焦點還在頁面本身時，
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

  // Tab／Shift+Tab 只在詳情裡的控制項之間循環。Modal 的焦點鎖定要等焦點離開視窗後才拉回視窗外框：
  // 最後一個控制項按 Tab 時焦點會先離開頁面，第一個按 Shift+Tab 會停在外框。這裡只補邊界：最後一個 → 第一個、
  // 第一個 → 最後一個；焦點在外框或頁面本身（升級處理中按鈕停用時）按 Tab 到第一個、Shift+Tab 到最後一個。
  // 停用的按鈕不算；開啟、Esc 關閉與還焦點照舊由 Modal 處理
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const box = boxRef.current;
      if (e.key !== "Tab" || e.defaultPrevented || !box) return;
      const dialog = box.closest('[role="dialog"]');
      const active = document.activeElement;
      // 焦點在別的視窗裡，或焦點不在任何視窗裡、而最上層的視窗不是這個詳情時不處理
      const owner =
        active instanceof Element ? active.closest('[role="dialog"]') : null;
      const modals = document.querySelectorAll(
        '[role="dialog"][aria-modal="true"]'
      );
      if (owner ? owner !== dialog : modals[modals.length - 1] !== dialog)
        return;
      const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      let next: HTMLElement | null = null;
      if (!active || !box.contains(active)) next = e.shiftKey ? last : first;
      else if (e.shiftKey && active === first) next = last;
      else if (!e.shiftKey && active === last) next = first;
      if (!next) return;
      e.preventDefault();
      next.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleUpgrade = async () => {
    setLoading(true);
    setFeedback(null);
    const result = await onUpgrade();
    restoreRef.current = true;
    setLoading(false);
    if (result.success) {
      setFeedback({ type: "success", msg: "升級成功！" });
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

  const rarity = rarityInfo(config.rarity);
  const color = rarity.color;

  // Modal 透過 portal 渲染在 .gameBody 外，CSS 變數無效，使用硬編碼值
  const C = {
    surface: "#ffffff",
    surface2: "#f0f3fa",
    border: "rgba(0,0,0,0.08)",
    text: "#1a1f36",
    muted: "#6b7280",
    gold: "#f59e0b",
    red: "#ef4444",
    green: "#10b981",
    blue: "#3b82f6",
  };

  return (
    <Modal
      show
      onHide={onClose}
      centered
      aria-labelledby={titleId}
      contentClassName="border-0 p-0"
      style={{ "--bs-modal-bg": "transparent" } as React.CSSProperties}
    >
      <div
        ref={boxRef}
        style={{
          background: C.surface,
          border: `1px solid ${color}40`,
          borderRadius: 12,
          color: C.text,
          overflow: "hidden",
        }}
        data-testid="hero-detail"
        data-hero-id={config.hero_id}
        data-hero-level={hero.level}
      >
        {/* Header */}
        <div
          style={{
            padding: "1rem 1.25rem",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span id={titleId} style={{ fontWeight: 700, fontSize: "1.1rem" }}>
              {config.name}
            </span>
            <span
              style={{
                background: `${color}22`,
                color,
                border: `1px solid ${color}55`,
                borderRadius: 4,
                fontSize: "0.65rem",
                padding: "1px 6px",
              }}
            >
              {rarity.label}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉武將詳情"
            style={{
              background: "none",
              border: "none",
              color: C.muted,
              cursor: "pointer",
              fontSize: "1.4rem",
              lineHeight: 1,
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "1.25rem" }}>
          <HeroSkillInfo
            heroId={config.hero_id}
            variant="full"
            rawRange={
              config.attack_range + (hero.level - 1) * config.range_growth
            }
            atk={hero.atk}
          />
          <HeroAntiAir job={config.job} />
          {/* 目前屬性 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              textAlign: "center",
              marginBottom: "1rem",
            }}
          >
            {[
              { label: "Lv", value: hero.level, c: C.text },
              { label: "ATK", value: hero.atk, c: C.red },
              { label: "DEF", value: hero.def, c: C.blue },
              { label: "HP", value: hero.hp, c: C.green },
              {
                label: "範圍",
                value: Number(
                  (
                    config.attack_range +
                    (hero.level - 1) * config.range_growth
                  ).toFixed(2)
                ),
                c: C.gold,
              },
              {
                // 攻擊間隔（秒，越小越快）：和戰場上的 Godot 用同一個公式（utils/heroStats）
                label: "攻擊間隔",
                value: `${formatSec(attackIntervalSec(config, hero.level))} 秒`,
                c: C.muted,
              },
            ].map(({ label, value, c }) => (
              <div key={label}>
                <div
                  style={{
                    fontSize: "0.65rem",
                    color: C.muted,
                    marginBottom: 2,
                  }}
                >
                  {label}
                </div>
                <div style={{ fontWeight: 700, fontSize: "1.1rem", color: c }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* 升級預覽 */}
          <div
            style={{
              background: C.surface2,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                color: C.muted,
                marginBottom: "0.5rem",
                fontSize: "0.68rem",
              }}
            >
              升至 Lv.{hero.level + 1} 後
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5,1fr)",
                textAlign: "center",
                gap: "0.2rem",
              }}
            >
              {[
                {
                  label: "ATK",
                  cur: hero.atk,
                  next: hero.atk + config.atk_growth,
                  c: C.red,
                },
                {
                  label: "DEF",
                  cur: hero.def,
                  next: hero.def + config.def_growth,
                  c: C.blue,
                },
                {
                  label: "HP",
                  cur: hero.hp,
                  next: hero.hp + config.hp_growth,
                  c: C.green,
                },
                {
                  label: "範圍",
                  cur: Number(
                    (
                      config.attack_range +
                      (hero.level - 1) * config.range_growth
                    ).toFixed(2)
                  ),
                  next: Number(
                    (
                      config.attack_range +
                      hero.level * config.range_growth
                    ).toFixed(2)
                  ),
                  c: C.gold,
                },
                {
                  label: "攻擊間隔(秒)",
                  cur: Number(formatSec(attackIntervalSec(config, hero.level))),
                  next: Number(
                    formatSec(attackIntervalSec(config, hero.level + 1))
                  ),
                  c: C.text,
                },
              ].map(({ label, cur, next, c }) => (
                <div key={label}>
                  <div style={{ color: C.muted, fontSize: "0.62rem" }}>
                    {label}
                  </div>
                  <div
                    style={{ color: c, fontWeight: 600, fontSize: "0.8rem" }}
                  >
                    {cur} → {next}
                  </div>
                  <div style={{ color: C.green, fontSize: "0.55rem" }}>
                    {next !== cur
                      ? next > cur
                        ? `+${Number((next - cur).toFixed(2))}`
                        : Number((next - cur).toFixed(2))
                      : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 費用 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "0.5rem",
              fontSize: "0.85rem",
            }}
          >
            <span style={{ color: C.muted }}>升級費用</span>
            <span
              style={{ fontWeight: 700, color: canAfford ? C.gold : C.red }}
            >
              {cost.toLocaleString()} 點
            </span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "1rem",
              fontSize: "0.85rem",
            }}
          >
            <span style={{ color: C.muted }}>目前戰場點數</span>
            <span style={{ color: C.gold }}>{gold.toLocaleString()} 點</span>
          </div>

          {feedback && (
            <Alert variant={feedback.type} className="py-2 small">
              {feedback.msg}
            </Alert>
          )}
          {writeHold && (
            <Alert
              variant="warning"
              className="py-2 small"
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
              disabled={loading}
              style={{
                flex: 1,
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.muted,
                borderRadius: 8,
                padding: "0.5rem",
                cursor: "pointer",
                fontSize: "0.85rem",
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
                  ? "rgba(99,102,241,0.25)"
                  : "linear-gradient(135deg,#6366f1,#818cf8)",
                border: "none",
                color: blocked ? "#6366f1" : "#fff",
                fontWeight: 700,
                borderRadius: 8,
                padding: "0.55rem",
                cursor: canAfford && !writeHold ? "pointer" : "not-allowed",
                fontSize: "0.9rem",
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
        </div>
      </div>
    </Modal>
  );
}

// ── 兩位武將比較的視窗（共用的比較表；Esc／關閉後焦點還給「比較這兩位」）──
function HeroCompareModal({
  columns,
  onClose,
}: {
  columns: HeroCompareColumn[];
  onClose: () => void;
}) {
  const titleId = useId();
  return (
    <Modal show onHide={onClose} centered size="lg" aria-labelledby={titleId}>
      <Modal.Header closeButton closeLabel="關閉武將比較">
        <Modal.Title id={titleId} as="h3" className="h5 mb-0">
          武將比較
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <HeroCompareTable columns={columns} />
      </Modal.Body>
    </Modal>
  );
}

// ── 武將卡片 ──────────────────────────────────────────────
function HeroCard({
  hero,
  config,
  onClick,
  compareMode = false,
  picked = false,
}: {
  hero: HeroState;
  config: HeroConfig;
  onClick: () => void;
  /** 比較模式：點卡片是選取或取消（不開升級） */
  compareMode?: boolean;
  picked?: boolean;
}) {
  const rarity = rarityInfo(config.rarity);
  const job = jobInfo(config.job);
  const color = rarity.color;
  // 原生按鈕：Tab 可以移到卡片，Enter／空白鍵開啟詳情（樣式見 heroCardButton）。按鈕裡只能放行內的內容，原本的區塊都用 span（顯示方式由樣式決定，版面不變）
  return (
    <button
      type="button"
      className={`${styles.heroCard} ${styles.heroCardButton} ${rarityBgClass[rarity.value] ?? ""}`}
      data-hero-id={config.hero_id}
      data-compare-picked={compareMode ? String(picked) : undefined}
      aria-haspopup={compareMode ? undefined : "dialog"}
      aria-pressed={compareMode ? picked : undefined}
      onClick={onClick}
      style={{
        borderColor: `${color}30`,
        outline: compareMode && picked ? "3px solid var(--sg-blue)" : undefined,
      }}
    >
      <span className={styles.heroJobBar} style={{ background: job.color }} />
      <span className={styles.heroCardInner}>
        <span
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "0.25rem",
          }}
        >
          <span className={styles.heroName}>{config.name}</span>
          <span
            style={{
              background: `${color}22`,
              color,
              border: `1px solid ${color}44`,
              borderRadius: 3,
              fontSize: "0.58rem",
              padding: "1px 5px",
              flexShrink: 0,
              marginLeft: 4,
            }}
            title={rarity.known ? undefined : "遊戲不認得的稀有度（保留原值）"}
            data-testid="hero-rarity"
          >
            {rarity.label}
          </span>
        </span>
        <span
          style={{
            display: "flex",
            gap: "0.3rem",
            flexWrap: "wrap",
            marginBottom: "0.3rem",
          }}
        >
          <Badge
            bg="secondary"
            style={{
              fontSize: "0.62rem",
              background: "var(--sg-surface2) !important",
            }}
          >
            Lv.{hero.level}
          </Badge>
          <span
            style={{ fontSize: "0.62rem", color: job.color, fontWeight: 600 }}
            data-testid="hero-job"
          >
            {job.label}
          </span>
          {hero.star > 0 && (
            <span style={{ fontSize: "0.62rem", color: "var(--sg-gold)" }}>
              {"★".repeat(hero.star)}
            </span>
          )}
        </span>
        <span className={styles.heroStats}>
          <span style={{ color: "var(--sg-red)" }}>ATK {hero.atk}</span>
          <span style={{ color: "var(--sg-blue)" }}>DEF {hero.def}</span>
          <span style={{ color: "var(--sg-green)" }}>HP {hero.hp}</span>
        </span>
        <HeroSkillInfo heroId={config.hero_id} variant="tag" />
        <span className={styles.heroHint}>
          {compareMode
            ? picked
              ? "已選比較（再點取消）"
              : "點選加入比較"
            : "點擊升級"}
        </span>
      </span>
    </button>
  );
}

// ── 主頁面 ────────────────────────────────────────────────
export default function HeroesPageContent() {
  const router = useRouter();
  const { player, upgradeHero } = usePlayerStore();
  const { config: staticConfig, isLoading: configLoading } =
    useStaticConfigStore();
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  // 搜尋／職業／排序只影響這一頁的顯示；離開頁面（元件卸載）就回到預設
  const [criteria, setCriteria] =
    useState<HeroFilterCriteria>(DEFAULT_HERO_FILTER);
  // 兩位武將的比較（比較模式中點卡片是選取，不開升級）；切換存檔時清掉
  const compare = useHeroCompare(
    player?.key ?? null,
    staticConfig?.heroesConfig ?? null
  );
  // 詳情（react-bootstrap Modal）關閉時會把焦點還給開啟它的卡片；卡片已經不在畫面上、或開啟時沒有焦點（焦點留在頁面本身）時，
  // 改交給同一位武將的卡片，沒有時交給搜尋框
  const lastDetailRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedHeroId) {
      lastDetailRef.current = selectedHeroId;
      return;
    }
    const id = lastDetailRef.current;
    lastDetailRef.current = null;
    const a = document.activeElement;
    if (!id || (a && a !== document.body)) return;
    const card = Array.from(
      document.querySelectorAll<HTMLElement>("[data-hero-id]")
    ).find((el) => el.dataset.heroId === id && el.tagName === "BUTTON");
    (
      card ??
      document.querySelector<HTMLElement>('[data-testid="hero-filter-search"]')
    )?.focus();
  }, [selectedHeroId]);

  if (!player || configLoading || !staticConfig) {
    return (
      <Container className={styles.pageContainer}>
        <Spinner animation="border" variant="primary" />
        <p
          style={{
            color: "var(--sg-muted)",
            marginTop: "1rem",
            fontSize: "0.82rem",
          }}
        >
          載入中...
        </p>
      </Container>
    );
  }

  const selectedConfig = selectedHeroId
    ? (staticConfig.heroesConfig.find((c) => c.hero_id === selectedHeroId) ??
      null)
    : null;
  const selectedHero = selectedConfig
    ? resolveHeroState(selectedConfig, player.heroes)
    : null;
  // 每次都用目前的玩家資料計算（升級、切換帳號後立即反映）；在隊中的武將也照常顯示
  const listed = filterAndSortHeroes(
    staticConfig.heroesConfig,
    player.heroes,
    criteria
  );

  return (
    <Container fluid className={styles.pageContainer}>
      <div className={styles.header}>
        <h2 className={styles.pageTitle}>武將列表</h2>
        <p className={styles.subtitle}>
          共 {staticConfig.heroesConfig.length} 位武將　戰場點數：
          <span style={{ color: "var(--sg-gold)", fontWeight: 700 }}>
            {(player.gold ?? 0).toLocaleString()}
          </span>
        </p>
      </div>

      <HeroFilterBar
        criteria={criteria}
        onChange={setCriteria}
        matched={listed.matched}
        total={listed.total}
      />
      <HeroCompareBar
        active={compare.active}
        names={compare.selected.map(
          (id) =>
            staticConfig.heroesConfig.find((c) => c.hero_id === id)?.name ?? id
        )}
        refused={compare.refused}
        onToggle={compare.toggleMode}
        onStart={compare.start}
        onClear={compare.clear}
      />

      <Row className="g-2 w-100">
        {listed.items.map(({ config, hero }) => {
          return (
            <Col xs={6} sm={4} md={3} key={config.hero_id}>
              <HeroCard
                hero={hero}
                config={config}
                compareMode={compare.active}
                picked={compare.selected.includes(config.hero_id)}
                onClick={() =>
                  compare.active
                    ? compare.pick(config.hero_id)
                    : setSelectedHeroId(config.hero_id)
                }
              />
            </Col>
          );
        })}
      </Row>

      <button
        className={styles.btnOutline}
        style={{ marginTop: "1.5rem" }}
        onClick={() => router.push("/shenmaSanguo")}
      >
        ← 回主選單
      </button>

      {selectedHero && selectedConfig && (
        <UpgradeModal
          hero={selectedHero}
          config={selectedConfig}
          gold={player.gold}
          onClose={() => setSelectedHeroId(null)}
          onUpgrade={() => upgradeHero(selectedHero.hero_id, selectedConfig)}
        />
      )}

      {compare.open && (
        <HeroCompareModal
          columns={compareColumns(
            compare.selected,
            staticConfig.heroesConfig,
            player.heroes
          )}
          onClose={compare.close}
        />
      )}
    </Container>
  );
}
