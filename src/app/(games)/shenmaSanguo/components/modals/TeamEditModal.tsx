"use client";

import React, { useState, useEffect } from "react";
import { Row, Col, Alert } from "react-bootstrap";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import { HeroConfig, HeroState, Rarity, JobClass, TeamSlot } from "../../types";
import styles from "../../styles/shenmaSanguo.module.css";

const rarityColor: Record<Rarity, string> = {
  [Rarity.Orange]: "#e8922a",
  [Rarity.Purple]: "#9b59b6",
  [Rarity.Blue]: "#5299e0",
  [Rarity.Green]: "#52c07a",
};
const jobLabel: Record<JobClass, string> = {
  [JobClass.Infantry]: "步",
  [JobClass.Archer]: "弓",
  [JobClass.Artillery]: "砲",
  [JobClass.Cavalry]: "騎",
};
const jobBarClass: Record<JobClass, string> = {
  [JobClass.Infantry]: styles.jobInfantry,
  [JobClass.Archer]: styles.jobArcher,
  [JobClass.Artillery]: styles.jobArtillery,
  [JobClass.Cavalry]: styles.jobCavalry,
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

const MAX_SLOTS = 5;

interface Props {
  onClose: () => void;
}

export default function TeamEditModal({ onClose }: Props) {
  const { player, updateTeam } = usePlayerStore();
  const { config: staticConfig } = useStaticConfigStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (player) {
      const sorted = [...(player.team || [])].sort((a, b) => a.slot - b.slot);
      setSelected(sorted.map((s) => s.hero_id));
    }
  }, [player]);

  if (!player || !staticConfig) return null;

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

  const handleSave = () => {
    const newTeam: TeamSlot[] = selected.map((heroId, idx) => ({
      hero_id: heroId,
      slot: idx + 1,
    }));
    updateTeam(newTeam);
    setSaved(true);
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

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>隊伍編排</span>
          <button className={styles.modalClose} onClick={onClose}>
            ×
          </button>
        </div>
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
              {displaySlots.map((slot, i) => (
                <div
                  key={i}
                  className={
                    slot.heroId
                      ? `${styles.slot} ${styles.slotFilled}`
                      : styles.slot
                  }
                  onClick={() => slot.heroId && toggleHero(slot.heroId)}
                  title={slot.heroId ? "點擊移除" : undefined}
                >
                  <span className={styles.slotNum}>#{i + 1}</span>
                  {slot.config && slot.hero ? (
                    <>
                      <span
                        style={{
                          fontSize: "0.55rem",
                          color: rarityColor[slot.config.rarity as Rarity],
                          fontWeight: 600,
                        }}
                      >
                        {jobLabel[slot.config.job as JobClass]}
                      </span>
                      <div className={styles.slotName}>{slot.config.name}</div>
                      <div className={styles.slotLv}>Lv.{slot.hero.level}</div>
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
              點擊槽位移除武將
            </p>
          </div>

          {/* 武將池 */}
          <div style={{ marginBottom: "1rem" }}>
            <div className={styles.sectionLabel}>選擇武將</div>
            <Row className="g-2">
              {staticConfig.heroesConfig.map((config) => {
                const hero = resolveHeroState(config, player.heroes);
                const isSelected = selected.includes(config.hero_id);
                const color = rarityColor[config.rarity as Rarity];
                return (
                  <Col xs={6} sm={4} key={config.hero_id}>
                    <div
                      className={`${styles.poolCard} ${isSelected ? styles.poolCardActive : ""}`}
                      style={{
                        borderColor: isSelected ? `${color}80` : undefined,
                      }}
                      onClick={() => toggleHero(config.hero_id)}
                    >
                      <div
                        className={`${styles.heroJobBar} ${jobBarClass[config.job as JobClass]}`}
                      />
                      <div style={{ padding: "0.45rem 0.55rem", flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: "0.82rem",
                            color: "var(--sg-text)",
                            marginBottom: "0.15rem",
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
                              marginTop: "0.15rem",
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

          <div style={{ display: "flex", gap: "0.65rem", marginTop: "0.5rem" }}>
            <button className={styles.btnOutline} onClick={onClose}>
              關閉
            </button>
            <button
              className={styles.btnGold}
              style={{ flex: 1 }}
              onClick={handleSave}
              disabled={!isDirty || isOverCapacity || selected.length === 0}
            >
              儲存隊伍
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
