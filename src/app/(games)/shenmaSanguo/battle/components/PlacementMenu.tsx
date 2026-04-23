"use client";
import React, { useState } from "react";
import styles from "../../styles/shenmaSanguo.module.css";

interface PlacementMenuProps {
  type: "road" | "build";
  pos: { x: number; y: number };
  onSelect: (id: string, category: "hero" | "tower") => void;
  onClose: () => void;
  playerGold: number;
  teamList: any[];
  heroesConfig: any[];
  placedHeroIds: string[];
}

export default function PlacementMenu({
  type,
  pos,
  onSelect,
  onClose,
  playerGold,
  teamList,
  heroesConfig,
  placedHeroIds,
}: PlacementMenuProps) {
  const isRoad = type === "road";
  const [activeTab, setActiveTab] = useState<"hero" | "tower">(
    isRoad ? "hero" : "tower"
  );

  // 防禦塔配置
  const towerConfigs = [
    { id: "archer", name: "弓兵塔", cost: 50, image: "tower_archer.webp" },
    { id: "infantry", name: "步兵塔", cost: 70, image: "tower_infantry.webp" },
    {
      id: "artillery",
      name: "砲兵塔",
      cost: 100,
      image: "tower_artillery.webp",
    },
    { id: "cavalry", name: "騎兵塔", cost: 120, image: "tower_cavalry.webp" },
    { id: "scholar", name: "文士塔", cost: 80, image: "tower_scholar.webp" },
  ];

  return (
    <div className={styles.placementOverlay} onClick={onClose}>
      <div
        className={styles.placementMenu}
        style={{
          left: Math.min(window.innerWidth - 240, Math.max(20, pos.x - 120)),
          top: Math.min(window.innerHeight - 340, Math.max(20, pos.y - 170)),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.placementHeader}>
          <span>{type === "road" ? "路徑部署" : "建築位部署"}</span>
          <button className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        {type === "build" && (
          <div className={styles.tabSwitcher}>
            <button
              className={`${styles.tabBtn} ${activeTab === "tower" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("tower")}
            >
              防禦塔
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === "hero" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("hero")}
            >
              武將
            </button>
          </div>
        )}

        <div className={styles.placementContent}>
          {activeTab === "hero" ? (
            <div className={styles.heroGrid}>
              {teamList.map((slot) => {
                const config = heroesConfig.find(
                  (c) => c.hero_id === slot.hero_id
                );
                const isPlaced = placedHeroIds.includes(slot.hero_id);
                return (
                  <button
                    key={slot.hero_id}
                    className={`${styles.menuCard} ${isPlaced ? styles.cardDisabled : ""}`}
                    disabled={isPlaced}
                    onClick={() => onSelect(slot.hero_id, "hero")}
                  >
                    <div className={styles.cardIcon}>
                      {config?.image ? (
                        <img
                          src={`/images/shenmaSanguo/units/${config.image}`}
                          alt={config?.name}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                          }}
                        />
                      ) : (
                        "👤"
                      )}
                    </div>
                    <div className={styles.cardName}>
                      {config?.name || slot.hero_id}
                    </div>
                    <div className={styles.cardStatus}>
                      {isPlaced ? "已在場上" : `Lv.${slot.level || 1}`}
                    </div>
                  </button>
                );
              })}
              {teamList.length === 0 && (
                <p className={styles.emptyMsg}>隊伍中沒有武將</p>
              )}
            </div>
          ) : (
            <div className={styles.towerGrid}>
              {towerConfigs.map((t) => {
                const canAfford = playerGold >= t.cost;
                return (
                  <button
                    key={t.id}
                    className={`${styles.menuCard} ${!canAfford ? styles.cardDisabled : ""}`}
                    disabled={!canAfford}
                    onClick={() => onSelect(t.id, "tower")}
                  >
                    <div className={styles.cardIcon}>
                      <img
                        src={`/images/shenmaSanguo/units/${t.image}`}
                        alt={t.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                        }}
                      />
                    </div>
                    <div className={styles.cardName}>{t.name}</div>
                    <div
                      className={styles.cardCost}
                      style={{ color: canAfford ? "#f59e0b" : "#ef4444" }}
                    >
                      💰 {t.cost}G
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
