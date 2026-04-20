"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Container, Row, Col, Spinner, Alert } from "react-bootstrap";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import { HeroState, HeroConfig, Rarity, JobClass, TeamSlot } from "../../types";
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

export default function TeamPageContent() {
  const router = useRouter();
  const { player, updateTeam } = usePlayerStore();
  const { config: staticConfig, isLoading: configLoading } =
    useStaticConfigStore();

  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (player) {
      const sorted = [...(player.team || [])].sort((a, b) => a.slot - b.slot);
      setSelected(sorted.map((s) => s.hero_id));
    }
  }, [player]);

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
    <Container className={styles.pageContainer} style={{ maxWidth: 680 }}>
      <div className={styles.header}>
        <h2 className={styles.pageTitle}>隊伍編排</h2>
      </div>

      {/* 容量條 */}
      <div style={{ width: "100%", marginBottom: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.75rem",
            marginBottom: "0.35rem",
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
              background: isOverCapacity ? "var(--sg-red)" : "var(--sg-gold)",
            }}
          />
        </div>
        {isOverCapacity && (
          <p
            style={{
              color: "var(--sg-red)",
              fontSize: "0.72rem",
              marginTop: "0.35rem",
            }}
          >
            超出容量上限，請移除部分武將
          </p>
        )}
      </div>

      {/* 出陣槽位 */}
      <div style={{ width: "100%", marginBottom: "1.5rem" }}>
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
                      fontSize: "0.58rem",
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
            fontSize: "0.65rem",
            color: "var(--sg-muted)",
            marginTop: "0.35rem",
          }}
        >
          點擊槽位移除武將
        </p>
      </div>

      {/* 武將池 */}
      <div style={{ width: "100%" }}>
        <div className={styles.sectionLabel}>選擇武將</div>
        <Row className="g-2">
          {staticConfig.heroesConfig.map((config) => {
            const hero = resolveHeroState(config, player.heroes);
            const isSelected = selected.includes(config.hero_id);
            const color = rarityColor[config.rarity as Rarity];
            return (
              <Col xs={6} sm={4} md={3} key={config.hero_id}>
                <div
                  className={`${styles.poolCard} ${isSelected ? styles.poolCardActive : ""}`}
                  style={{ borderColor: isSelected ? `${color}80` : undefined }}
                  onClick={() => toggleHero(config.hero_id)}
                >
                  <div
                    className={`${styles.heroJobBar} ${jobBarClass[config.job as JobClass]}`}
                  />
                  <div style={{ padding: "0.55rem 0.65rem", flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        color: "var(--sg-text)",
                        marginBottom: "0.2rem",
                      }}
                    >
                      {config.name}
                    </div>
                    <div
                      style={{
                        fontSize: "0.65rem",
                        color: "var(--sg-muted)",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Lv.{hero.level}　Cost{" "}
                      <span style={{ color: "var(--sg-gold)" }}>
                        {config.cost}
                      </span>
                    </div>
                    {isSelected && (
                      <div
                        style={{ fontSize: "0.6rem", color, fontWeight: 600 }}
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
        <Alert variant="success" className="w-100 py-2 small mt-3">
          隊伍已儲存，將於 30 秒內同步至雲端。
        </Alert>
      )}

      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          width: "100%",
          marginTop: "1.5rem",
        }}
      >
        <button
          className={styles.btnOutline}
          onClick={() => router.push("/shenmaSanguo")}
        >
          ← 返回
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
    </Container>
  );
}
