"use client";

import React, { useState } from "react";
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
import { HeroState, HeroConfig, Rarity, JobClass } from "../../types";
import styles from "../../styles/shenmaSanguo.module.css";

// ── 顯示設定 ──────────────────────────────────────────────
const rarityColor: Record<Rarity, string> = {
  [Rarity.Orange]: "#e8922a",
  [Rarity.Purple]: "#9b59b6",
  [Rarity.Blue]: "#5299e0",
  [Rarity.Green]: "#52c07a",
};
const rarityLabel: Record<Rarity, string> = {
  [Rarity.Orange]: "橘",
  [Rarity.Purple]: "紫",
  [Rarity.Blue]: "藍",
  [Rarity.Green]: "綠",
};
const jobLabel: Record<JobClass, string> = {
  [JobClass.Infantry]: "步兵",
  [JobClass.Archer]: "弓兵",
  [JobClass.Artillery]: "砲兵",
  [JobClass.Cavalry]: "騎兵",
};
const jobBarClass: Record<JobClass, string> = {
  [JobClass.Infantry]: styles.jobInfantry,
  [JobClass.Archer]: styles.jobArcher,
  [JobClass.Artillery]: styles.jobArtillery,
  [JobClass.Cavalry]: styles.jobCavalry,
};
const rarityBgClass: Record<Rarity, string> = {
  [Rarity.Orange]: styles.rarityOrange,
  [Rarity.Purple]: styles.rarityPurple,
  [Rarity.Blue]: styles.rarityBlue,
  [Rarity.Green]: styles.rarityGreen,
};

function resolveHeroState(
  config: HeroConfig,
  playerHeroes: HeroState[]
): HeroState {
  return (
    playerHeroes.find((h) => h.hero_id === config.hero_id) ?? {
      hero_id: config.hero_id,
      level: 1,
      star: 0,
      atk: config.base_atk,
      def: config.base_def,
      hp: config.base_hp,
    }
  );
}

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

  const handleUpgrade = async () => {
    setLoading(true);
    setFeedback(null);
    const result = await onUpgrade();
    setLoading(false);
    if (result.success) {
      setFeedback({ type: "success", msg: "升級成功！" });
    } else {
      const errMap: Record<string, string> = {
        GOLD_NOT_ENOUGH: "戰場點數不足",
        NOT_LOADED: "玩家資料尚未載入",
        HERO_NOT_FOUND: "武將資料異常",
      };
      setFeedback({
        type: "danger",
        msg: errMap[result.error ?? ""] ?? "升級失敗，請稍後再試",
      });
    }
  };

  const color = rarityColor[config.rarity as Rarity];

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
      contentClassName="border-0 p-0"
      style={{ "--bs-modal-bg": "transparent" } as React.CSSProperties}
    >
      <div
        style={{
          background: C.surface,
          border: `1px solid ${color}40`,
          borderRadius: 12,
          color: C.text,
          overflow: "hidden",
        }}
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
            <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>
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
              {rarityLabel[config.rarity as Rarity]}
            </span>
          </div>
          <button
            onClick={onClose}
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
                label: "攻速",
                value: Number(
                  Math.max(
                    0.1,
                    config.attack_speed *
                      (1.0 - (hero.level - 1) * config.atk_spd_growth)
                  ).toFixed(2)
                ),
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
                  label: "攻速",
                  cur: Number(
                    Math.max(
                      0.1,
                      config.attack_speed *
                        (1.0 - (hero.level - 1) * config.atk_spd_growth)
                    ).toFixed(2)
                  ),
                  next: Number(
                    Math.max(
                      0.1,
                      config.attack_speed *
                        (1.0 - hero.level * config.atk_spd_growth)
                    ).toFixed(2)
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

          {/* 按鈕 */}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
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
              onClick={handleUpgrade}
              disabled={loading || !canAfford}
              style={{
                flex: 2,
                background:
                  loading || !canAfford
                    ? "rgba(99,102,241,0.25)"
                    : "linear-gradient(135deg,#6366f1,#818cf8)",
                border: "none",
                color: loading || !canAfford ? "#6366f1" : "#fff",
                fontWeight: 700,
                borderRadius: 8,
                padding: "0.55rem",
                cursor: canAfford ? "pointer" : "not-allowed",
                fontSize: "0.9rem",
                opacity: loading || !canAfford ? 0.6 : 1,
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

// ── 武將卡片 ──────────────────────────────────────────────
function HeroCard({
  hero,
  config,
  onClick,
}: {
  hero: HeroState;
  config: HeroConfig;
  onClick: () => void;
}) {
  const color = rarityColor[config.rarity as Rarity];
  return (
    <div
      className={`${styles.heroCard} ${rarityBgClass[config.rarity as Rarity]}`}
      onClick={onClick}
      style={{ borderColor: `${color}30` }}
    >
      <div
        className={`${styles.heroJobBar} ${jobBarClass[config.job as JobClass]}`}
      />
      <div className={styles.heroCardInner}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "0.25rem",
          }}
        >
          <div className={styles.heroName}>{config.name}</div>
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
          >
            {rarityLabel[config.rarity as Rarity]}
          </span>
        </div>
        <div
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
          <span style={{ fontSize: "0.62rem", color: "var(--sg-muted)" }}>
            {jobLabel[config.job as JobClass]}
          </span>
          {hero.star > 0 && (
            <span style={{ fontSize: "0.62rem", color: "var(--sg-gold)" }}>
              {"★".repeat(hero.star)}
            </span>
          )}
        </div>
        <div className={styles.heroStats}>
          <span style={{ color: "var(--sg-red)" }}>ATK {hero.atk}</span>
          <span style={{ color: "var(--sg-blue)" }}>DEF {hero.def}</span>
          <span style={{ color: "var(--sg-green)" }}>HP {hero.hp}</span>
        </div>
        <div className={styles.heroHint}>點擊升級</div>
      </div>
    </div>
  );
}

// ── 主頁面 ────────────────────────────────────────────────
export default function HeroesPageContent() {
  const router = useRouter();
  const { player, upgradeHero } = usePlayerStore();
  const { config: staticConfig, isLoading: configLoading } =
    useStaticConfigStore();
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);

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

      <Row className="g-2 w-100">
        {staticConfig.heroesConfig.map((config) => {
          const hero = resolveHeroState(config, player.heroes);
          return (
            <Col xs={6} sm={4} md={3} key={config.hero_id}>
              <HeroCard
                hero={hero}
                config={config}
                onClick={() => setSelectedHeroId(config.hero_id)}
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
    </Container>
  );
}
