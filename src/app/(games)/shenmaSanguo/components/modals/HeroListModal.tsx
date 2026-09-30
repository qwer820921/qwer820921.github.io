"use client";

import React, { useState } from "react";
import { Row, Col, Spinner, Alert } from "react-bootstrap";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import { HeroState, HeroConfig } from "../../types";
import HeroSkillInfo from "../HeroSkillInfo";
import HeroAntiAir from "../HeroAntiAir";
import HeroFilterBar from "../HeroFilterBar";
import { attackIntervalSec, formatSec } from "../../utils/heroStats";
import {
  DEFAULT_HERO_FILTER,
  HeroFilterCriteria,
  filterAndSortHeroes,
  resolveHeroState,
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

interface Props {
  onClose: () => void;
  onHeroUpgraded?: () => void;
}

export default function HeroListModal({ onClose, onHeroUpgraded }: Props) {
  const { player, upgradeHero } = usePlayerStore();
  const { config: staticConfig } = useStaticConfigStore();
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  // 搜尋／職業／排序只影響這個視窗的顯示；關閉視窗（元件卸載）就回到預設
  const [criteria, setCriteria] =
    useState<HeroFilterCriteria>(DEFAULT_HERO_FILTER);

  if (!player || !staticConfig) return null;

  const teamHeroIds = new Set((player.team || []).map((s) => s.hero_id));

  // 每次都用目前的玩家資料計算（升級、切換帳號後立即反映）；在隊中的武將也照常顯示
  const listed = filterAndSortHeroes(
    staticConfig.heroesConfig,
    player.heroes,
    criteria
  );

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
            <HeroFilterBar
              criteria={criteria}
              onChange={setCriteria}
              matched={listed.matched}
              total={listed.total}
            />

            {/* Hero grid */}
            <Row className="g-2">
              {listed.items.map(({ config, hero, cost: upgradeCost }) => {
                const rarity = rarityInfo(config.rarity);
                const job = jobInfo(config.job);
                const color = rarity.color;
                const jColor = job.color;
                const isSelected = config.hero_id === selectedHeroId;
                const inTeam = teamHeroIds.has(config.hero_id);
                const canAfford = player.gold >= upgradeCost;
                return (
                  <Col xs={6} sm={4} key={config.hero_id}>
                    <div
                      className={styles.heroCard}
                      data-hero-id={config.hero_id}
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
                            title={
                              rarity.known
                                ? undefined
                                : "遊戲不認得的稀有度（保留原值）"
                            }
                            data-testid="hero-rarity"
                          >
                            {rarity.label}
                          </span>
                        </div>
                        <div
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
                        <HeroSkillInfo heroId={config.hero_id} variant="tag" />
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
          const rarity = rarityInfo(selectedConfig.rarity);
          const job = jobInfo(selectedConfig.job);
          const color = rarity.color;
          const jColor = job.color;
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
                data-testid="hero-detail"
                data-hero-id={selectedConfig.hero_id}
                data-hero-level={selectedHero.level}
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
                  <button className={styles.modalClose} onClick={closeDetail}>
                    ×
                  </button>
                </div>

                {/* Body：技能與升級詳情 */}
                <div className={styles.modalBody}>
                  <HeroSkillInfo
                    heroId={selectedConfig.hero_id}
                    variant="full"
                    rawRange={
                      selectedConfig.attack_range +
                      (selectedHero.level - 1) * selectedConfig.range_growth
                    }
                    atk={selectedHero.atk}
                  />
                  <HeroAntiAir job={selectedConfig.job} />
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
