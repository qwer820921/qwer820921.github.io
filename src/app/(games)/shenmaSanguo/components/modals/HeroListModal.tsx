"use client";

import React, { useState } from "react";
import { Row, Col, Spinner, Alert, Badge } from "react-bootstrap";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import { HeroState, HeroConfig, Rarity, JobClass } from "../../types";
import styles from "../../styles/shenmaSanguo.module.css";

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

// ── 升級詳情面板（嵌入在 modal 內，不使用 Bootstrap Modal）──
function HeroDetailPanel({
  hero,
  config,
  gold,
  onClose,
  onUpgrade,
}: {
  hero: HeroState;
  config: HeroConfig;
  gold: number;
  onClose: () => void;
  onUpgrade: () => Promise<{ success: boolean; error?: string }>;
}) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "danger";
    msg: string;
  } | null>(null);

  const cost = config.upgrade_cost_base * hero.level;
  const canAfford = gold >= cost;
  const color = rarityColor[config.rarity as Rarity];

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

  return (
    <div
      style={{
        background: "var(--sg-surface2)",
        border: `1px solid ${color}40`,
        borderRadius: 12,
        overflow: "hidden",
        marginTop: "0.75rem",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "0.8rem 1rem",
          borderBottom: "1px solid var(--sg-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontWeight: 700, fontSize: "1rem" }}>
            {config.name}
          </span>
          <span
            style={{
              background: `${color}22`,
              color,
              border: `1px solid ${color}55`,
              borderRadius: 4,
              fontSize: "0.62rem",
              padding: "1px 5px",
            }}
          >
            {rarityLabel[config.rarity as Rarity]}
          </span>
          <span style={{ fontSize: "0.68rem", color: "var(--sg-muted)" }}>
            {jobLabel[config.job as JobClass]}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--sg-muted)",
            cursor: "pointer",
            fontSize: "1.3rem",
            lineHeight: 1,
            padding: "0 4px",
          }}
        >
          ×
        </button>
      </div>

      {/* Stats */}
      <div style={{ padding: "0.85rem 1rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            textAlign: "center",
            marginBottom: "0.85rem",
          }}
        >
          {[
            { label: "Lv", value: hero.level, c: "var(--sg-text)" },
            { label: "ATK", value: hero.atk, c: "var(--sg-red)" },
            { label: "DEF", value: hero.def, c: "var(--sg-blue)" },
            { label: "HP", value: hero.hp, c: "var(--sg-green)" },
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

        {/* Upgrade preview */}
        <div
          style={{
            background: "var(--sg-surface)",
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
                cur: hero.atk,
                next: hero.atk + config.atk_growth,
                c: "var(--sg-red)",
              },
              {
                label: "DEF",
                cur: hero.def,
                next: hero.def + config.def_growth,
                c: "var(--sg-blue)",
              },
              {
                label: "HP",
                cur: hero.hp,
                next: hero.hp + config.hp_growth,
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
        </div>

        {/* Cost */}
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

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
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
            onClick={handleUpgrade}
            disabled={loading || !canAfford}
            style={{
              flex: 2,
              background:
                loading || !canAfford
                  ? "rgba(99,102,241,0.2)"
                  : "linear-gradient(135deg,#6366f1,#818cf8)",
              border: "none",
              color: loading || !canAfford ? "#6366f1" : "#fff",
              fontWeight: 700,
              borderRadius: 8,
              padding: "0.5rem",
              cursor: canAfford ? "pointer" : "not-allowed",
              fontSize: "0.88rem",
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
  );
}

interface Props {
  onClose: () => void;
}

export default function HeroListModal({ onClose }: Props) {
  const { player, upgradeHero } = usePlayerStore();
  const { config: staticConfig } = useStaticConfigStore();
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);

  if (!player || !staticConfig) return null;

  const selectedConfig = selectedHeroId
    ? (staticConfig.heroesConfig.find((c) => c.hero_id === selectedHeroId) ??
      null)
    : null;
  const selectedHero = selectedConfig
    ? resolveHeroState(selectedConfig, player.heroes)
    : null;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>武將列表</span>
          <span style={{ fontSize: "0.72rem", color: "var(--sg-muted)" }}>
            戰場點數：
            <span style={{ color: "var(--sg-gold)", fontWeight: 700 }}>
              {(player.gold ?? 0).toLocaleString()}
            </span>
          </span>
          <button className={styles.modalClose} onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <Row className="g-2">
            {staticConfig.heroesConfig.map((config) => {
              const hero = resolveHeroState(config, player.heroes);
              const color = rarityColor[config.rarity as Rarity];
              const isSelected = config.hero_id === selectedHeroId;
              return (
                <Col xs={6} sm={4} key={config.hero_id}>
                  <div
                    className={`${styles.heroCard} ${rarityBgClass[config.rarity as Rarity]}`}
                    onClick={() =>
                      setSelectedHeroId(isSelected ? null : config.hero_id)
                    }
                    style={{
                      borderColor: isSelected ? `${color}60` : undefined,
                      outline: isSelected ? `2px solid ${color}50` : undefined,
                    }}
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
                          marginBottom: "0.2rem",
                        }}
                      >
                        <div className={styles.heroName}>{config.name}</div>
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
                        >
                          {rarityLabel[config.rarity as Rarity]}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "0.3rem",
                          flexWrap: "wrap",
                          marginBottom: "0.25rem",
                        }}
                      >
                        <Badge bg="secondary" style={{ fontSize: "0.6rem" }}>
                          Lv.{hero.level}
                        </Badge>
                        <span
                          style={{
                            fontSize: "0.6rem",
                            color: "var(--sg-muted)",
                          }}
                        >
                          {jobLabel[config.job as JobClass]}
                        </span>
                      </div>
                      <div className={styles.heroStats}>
                        <span style={{ color: "var(--sg-red)" }}>
                          ATK {hero.atk}
                        </span>
                        <span style={{ color: "var(--sg-blue)" }}>
                          DEF {hero.def}
                        </span>
                        <span style={{ color: "var(--sg-green)" }}>
                          HP {hero.hp}
                        </span>
                      </div>
                      <div className={styles.heroHint}>點擊升級</div>
                    </div>
                  </div>
                </Col>
              );
            })}
          </Row>

          {selectedHero && selectedConfig && (
            <HeroDetailPanel
              hero={selectedHero}
              config={selectedConfig}
              gold={player.gold}
              onClose={() => setSelectedHeroId(null)}
              onUpgrade={() =>
                upgradeHero(selectedHero.hero_id, selectedConfig)
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
