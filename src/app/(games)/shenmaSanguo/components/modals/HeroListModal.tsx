"use client";

import React, { useState } from "react";
import { Row, Col, Spinner, Alert } from "react-bootstrap";
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
const jobColor: Record<JobClass, string> = {
  [JobClass.Infantry]: "#ef4444",
  [JobClass.Archer]: "#10b981",
  [JobClass.Artillery]: "#3b82f6",
  [JobClass.Cavalry]: "#8b5cf6",
};

const r = (n: number) => Math.round(n);

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

  const handleUpgrade = async () => {
    setLoading(true);
    setFeedback(null);
    const result = await onUpgrade();
    setLoading(false);
    if (result.success) {
      setFeedback({ type: "success", msg: "升級成功！" });
      onUpgraded?.();
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

      {/* 按鈕 */}
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
    </>
  );
}

interface Props {
  onClose: () => void;
  onHeroUpgraded?: () => void;
}

export default function HeroListModal({ onClose, onHeroUpgraded }: Props) {
  const { player, upgradeHero } = usePlayerStore();
  const { config: staticConfig } = useStaticConfigStore();
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  const [filterJob, setFilterJob] = useState<JobClass | null>(null);
  const [sortBy, setSortBy] = useState<"default" | "level" | "atk">("default");

  if (!player || !staticConfig) return null;

  const teamHeroIds = new Set((player.team || []).map((s) => s.hero_id));

  let heroes = staticConfig.heroesConfig;
  if (filterJob !== null) {
    heroes = heroes.filter((c) => c.job === filterJob);
  }
  heroes = [...heroes].sort((a, b) => {
    if (sortBy === "level") {
      return (
        resolveHeroState(b, player.heroes).level -
        resolveHeroState(a, player.heroes).level
      );
    }
    if (sortBy === "atk") {
      return (
        resolveHeroState(b, player.heroes).atk -
        resolveHeroState(a, player.heroes).atk
      );
    }
    return 0;
  });

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
            {/* Filter / sort bar */}
            <div className={styles.heroFilterBar}>
              <div className={styles.heroFilterGroup}>
                <button
                  className={`${styles.heroFilterBtn} ${filterJob === null ? styles.heroFilterBtnActive : ""}`}
                  onClick={() => setFilterJob(null)}
                >
                  全部
                </button>
                {(Object.values(JobClass) as JobClass[]).map((job) => (
                  <button
                    key={job}
                    className={`${styles.heroFilterBtn} ${filterJob === job ? styles.heroFilterBtnActive : ""}`}
                    style={
                      filterJob === job
                        ? {
                            borderColor: jobColor[job],
                            color: jobColor[job],
                          }
                        : undefined
                    }
                    onClick={() => setFilterJob(filterJob === job ? null : job)}
                  >
                    {jobLabel[job]}
                  </button>
                ))}
              </div>
              <select
                className={styles.heroSortSelect}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              >
                <option value="default">預設</option>
                <option value="level">等級↓</option>
                <option value="atk">攻擊↓</option>
              </select>
            </div>

            {/* Hero grid */}
            <Row className="g-2">
              {heroes.map((config) => {
                const hero = resolveHeroState(config, player.heroes);
                const color = rarityColor[config.rarity as Rarity];
                const jColor = jobColor[config.job as JobClass];
                const isSelected = config.hero_id === selectedHeroId;
                const inTeam = teamHeroIds.has(config.hero_id);
                const upgradeCost = config.upgrade_cost_base * hero.level;
                const canAfford = player.gold >= upgradeCost;
                return (
                  <Col xs={6} sm={4} key={config.hero_id}>
                    <div
                      className={styles.heroCard}
                      style={{
                        flexDirection: "column",
                        borderTopColor: color,
                        borderTopWidth: "3px",
                        outline: isSelected
                          ? `2px solid ${color}55`
                          : undefined,
                      }}
                      onClick={() =>
                        setSelectedHeroId(isSelected ? null : config.hero_id)
                      }
                    >
                      <div
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
                          <div className={styles.heroCardImgPlaceholder}>
                            {config.name[0]}
                          </div>
                        )}
                        {inTeam && (
                          <div className={styles.heroInTeamBadge}>在隊中</div>
                        )}
                      </div>
                      <div className={styles.heroCardInner}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: "0.15rem",
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
                            fontSize: "0.62rem",
                            color: "var(--sg-muted)",
                            marginBottom: "0.2rem",
                          }}
                        >
                          <span style={{ color: jColor, fontWeight: 600 }}>
                            {jobLabel[config.job as JobClass]}
                          </span>
                          　Lv.{hero.level}
                        </div>
                        <div className={styles.heroStats}>
                          <span style={{ color: "var(--sg-red)" }}>
                            ⚔ {r(hero.atk)}
                          </span>
                          <span style={{ color: "var(--sg-blue)" }}>
                            🛡 {r(hero.def)}
                          </span>
                          <span style={{ color: "var(--sg-green)" }}>
                            ❤ {r(hero.hp)}
                          </span>
                        </div>
                        <div
                          className={
                            canAfford
                              ? styles.heroHintAffordable
                              : styles.heroHint
                          }
                        >
                          {canAfford ? `可升級 (-${upgradeCost})` : "點擊升級"}
                        </div>
                      </div>
                    </div>
                  </Col>
                );
              })}
            </Row>
          </div>
        </div>
      </div>

      {/* ── 武將詳情 modal（疊在列表上方）── */}
      {selectedHero &&
        selectedConfig &&
        (() => {
          const color = rarityColor[selectedConfig.rarity as Rarity];
          const jColor = jobColor[selectedConfig.job as JobClass];
          return (
            <div
              className={styles.modalBackdrop}
              style={{ zIndex: 210 }}
              onClick={closeDetail}
            >
              <div
                className={styles.modalPanel}
                style={{ maxWidth: 380 }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* 頭像 banner */}
                {selectedConfig.image && (
                  <div
                    style={{
                      position: "relative",
                      height: 150,
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={`/images/shenmaSanguo/units/${selectedConfig.image}`}
                      alt={selectedConfig.name}
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
                    <span className={styles.modalTitle}>
                      {selectedConfig.name}
                    </span>
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
                      {rarityLabel[selectedConfig.rarity as Rarity]}
                    </span>
                    <span
                      style={{
                        fontSize: "0.65rem",
                        color: jColor,
                        fontWeight: 600,
                      }}
                    >
                      {jobLabel[selectedConfig.job as JobClass]}
                    </span>
                  </div>
                  <button className={styles.modalClose} onClick={closeDetail}>
                    ×
                  </button>
                </div>

                {/* Body：升級詳情 */}
                <div className={styles.modalBody}>
                  <HeroDetailContent
                    hero={selectedHero}
                    config={selectedConfig}
                    gold={player.gold}
                    onClose={closeDetail}
                    onUpgrade={() =>
                      upgradeHero(selectedHero.hero_id, selectedConfig)
                    }
                    onUpgraded={onHeroUpgraded}
                  />
                </div>
              </div>
            </div>
          );
        })()}
    </>
  );
}
