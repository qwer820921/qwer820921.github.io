"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Container, Row, Col, Spinner, Alert } from "react-bootstrap";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import { TeamSlot } from "../../types";
import HeroFilterBar from "../../components/HeroFilterBar";
import {
  DEFAULT_HERO_FILTER,
  HeroFilterCriteria,
  TEAM_SORT_OPTIONS,
  filterAndSortHeroes,
  resolveHeroState,
} from "../../utils/heroFilter";
import { jobInfo, rarityInfo } from "../../utils/heroCategories";
import { onActivateKey } from "../../utils/keyboard";
import styles from "../../styles/shenmaSanguo.module.css";

const MAX_SLOTS = 5;

export default function TeamPageContent() {
  const router = useRouter();
  const { player, updateTeam, writeHold } = usePlayerStore();
  const { config: staticConfig, isLoading: configLoading } =
    useStaticConfigStore();

  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  // 搜尋、職業與排序只篩選下方可選的武將（出陣槽位照常顯示）；只在這個頁面的記憶體，離開後恢復預設
  const [criteria, setCriteria] =
    useState<HeroFilterCriteria>(DEFAULT_HERO_FILTER);

  useEffect(() => {
    if (player) {
      const sorted = [...(player.team || [])].sort((a, b) => a.slot - b.slot);
      setSelected(sorted.map((s) => s.hero_id));
    }
  }, [player]);

  if (!player || configLoading || !staticConfig) {
    return (
      <Container fluid className={styles.pageContainer}>
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
    // 寫入限制中 store 不修改（回傳 false）：不顯示「已儲存」
    if (updateTeam(newTeam)) setSaved(true);
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
    <Container fluid className={styles.pageContainer}>
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
          {displaySlots.map((slot, i) => {
            const heroId = slot.heroId;
            // 已上陣的槽位可以用鍵盤移除（Enter 或空白鍵）；空的槽位不能操作
            const remove = heroId ? () => toggleHero(heroId) : undefined;
            return (
              <div
                key={i}
                className={
                  slot.heroId
                    ? `${styles.slot} ${styles.slotFilled}`
                    : styles.slot
                }
                onClick={remove}
                title={slot.heroId ? "點擊移除" : undefined}
                role={remove ? "button" : undefined}
                tabIndex={remove ? 0 : undefined}
                aria-label={
                  remove
                    ? `移除第 ${i + 1} 位：${slot.config?.name ?? slot.heroId}`
                    : undefined
                }
                onKeyDown={remove ? onActivateKey(remove) : undefined}
                data-testid="team-slot"
                data-hero-id={slot.heroId ?? ""}
              >
                <span className={styles.slotNum}>#{i + 1}</span>
                {slot.config && slot.hero ? (
                  <>
                    <span
                      style={{
                        fontSize: "0.58rem",
                        color: rarityInfo(slot.config.rarity).color,
                        fontWeight: 600,
                      }}
                    >
                      {jobInfo(slot.config.job).short}
                    </span>
                    <div className={styles.slotName}>{slot.config.name}</div>
                    <div className={styles.slotLv}>Lv.{slot.hero.level}</div>
                  </>
                ) : (
                  <div className={styles.slotEmpty}>空</div>
                )}
              </div>
            );
          })}
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
              <Col xs={6} sm={4} md={3} key={config.hero_id}>
                <div
                  className={`${styles.poolCard} ${isSelected ? styles.poolCardActive : ""}`}
                  style={{ borderColor: isSelected ? `${color}80` : undefined }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`${config.name}（${job.label}，出陣費用 ${config.cost}）`}
                  onClick={() => toggleHero(config.hero_id)}
                  onKeyDown={onActivateKey(() => toggleHero(config.hero_id))}
                  data-testid="team-pool-card"
                  data-hero-id={config.hero_id}
                >
                  <div
                    className={styles.heroJobBar}
                    style={{ background: job.color }}
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
      {writeHold && (
        <Alert
          variant="warning"
          className="w-100 py-2 small mt-3"
          data-testid="team-hold"
        >
          這個分頁的存檔暫停保存，隊伍暫時不能修改（見畫面下方的說明）。
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
          disabled={
            writeHold || !isDirty || isOverCapacity || selected.length === 0
          }
        >
          儲存隊伍
        </button>
      </div>
    </Container>
  );
}
