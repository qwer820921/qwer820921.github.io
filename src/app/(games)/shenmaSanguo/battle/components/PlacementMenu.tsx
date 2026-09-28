"use client";
import React, { useRef, useState } from "react";
import { useStageAnchor } from "../../utils/stageAnchor";
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
  const menuRef = useRef<HTMLDivElement>(null);
  // 定位和選取面板共用（utils/stageAnchor）：Godot 的點擊座標乘上縮放比例、限制在看得到的範圍、
  // 太高時選單內容捲動；尺寸或方向改變時重算（Round 18，D22）
  useStageAnchor(menuRef, pos);

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
        ref={menuRef}
        className={styles.placementMenu}
        data-testid="placement-menu"
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
