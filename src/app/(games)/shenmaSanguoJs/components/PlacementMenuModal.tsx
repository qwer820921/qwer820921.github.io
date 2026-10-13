"use client";

import React, { useState } from "react";
import { PlacementMenuData } from "../types";
import { DeployMenuContext } from "../engine/LocalGameBridge";
import { HeroStateData } from "../engine/entities/HeroEntity";
import { BUILTIN_HEROES_CONFIG } from "../engine/builtinData";
import { isSameHero } from "../utils/heroIdentity";
import styles from "../styles/shenmaSanguoJs.module.css";

interface PlacementMenuModalProps {
  show: boolean;
  data: PlacementMenuData | null;
  currentGold: number;
  playerHeroes: HeroStateData[];
  placedHeroIds?: string[];
  /** 手動暫停中（不能派武將或建塔，可以關閉選單） */
  isPaused: boolean;
  /** 備戰或戰鬥中（其他階段不能派武將或建塔） */
  isActivePhase: boolean;
  /** 武將卡不能派的原因（換帳號前的出征）：有值時只停用武將卡並顯示這段說明，塔不受影響 */
  heroBlockedReason?: string | null;
  /** 派武將、建塔：帶這個選單打開時的這一場與編號，回傳是否成功（成功才關閉選單） */
  onPlaceTower: (
    ctx: DeployMenuContext,
    col: number,
    row: number,
    typeKey: string
  ) => boolean;
  onPlaceHero: (
    ctx: DeployMenuContext,
    col: number,
    row: number,
    heroState: HeroStateData
  ) => boolean;
  /** 關閉：帶這個選單打開時的這一場與編號 */
  onClose: (ctx: DeployMenuContext) => void;
}

export const PlacementMenuModal: React.FC<PlacementMenuModalProps> = ({
  show,
  data,
  currentGold,
  playerHeroes,
  placedHeroIds = [],
  isPaused,
  isActivePhase,
  heroBlockedReason = null,
  onPlaceTower,
  onPlaceHero,
  onClose,
}) => {
  const isRoad = data?.isRoad ?? true;
  const [activeTab, setActiveTab] = useState<"hero" | "tower">(
    isRoad ? "hero" : "tower"
  );

  if (!show || !data) return null;

  const { col, row, isBuild } = data;
  // 這個選單打開時的這一場與編號（關閉、派武將、建塔都帶回這一組，不換成之後的新選單）
  const ctx: DeployMenuContext = {
    battleId: data.battleId,
    menuId: data.menuId,
  };
  const operable = isActivePhase && !isPaused;
  const showHeroes = activeTab === "hero" || isRoad;
  const close = () => onClose(ctx);

  const towerList = [
    {
      id: "archer",
      name: "弓兵塔",
      cost: 50,
      image: "tower_archer.webp",
      air: "可對空",
    },
    {
      id: "infantry",
      name: "步兵塔",
      cost: 70,
      image: "tower_infantry.webp",
      air: "只打地面",
    },
    {
      id: "artillery",
      name: "砲兵塔",
      cost: 100,
      image: "tower_artillery.webp",
      air: "只打地面",
    },
    {
      id: "cavalry",
      name: "騎兵塔",
      cost: 120,
      image: "tower_cavalry.webp",
      air: "只打地面",
    },
    {
      id: "scholar",
      name: "文士塔",
      cost: 80,
      image: "tower_scholar.webp",
      air: "可減速",
    },
  ];

  return (
    <div className={styles.placementOverlay} onClick={close}>
      <div
        className={styles.placementMenu}
        data-testid="placement-menu"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 選單標題列 */}
        <div className={styles.placementHeader}>
          <span>{isRoad ? "路徑部署" : "建築位部署"}</span>
          <button type="button" className={styles.closeBtn} onClick={close}>
            ×
          </button>
        </div>
        {!operable && (
          <div
            className="small text-warning px-3 pt-2"
            data-testid="placement-blocked-hint"
          >
            {isPaused
              ? "暫停中不能派武將或建塔，可以先關閉選單。"
              : "現在不能派武將或建塔。"}
          </div>
        )}

        {/* 高台位切換標籤 */}
        {isBuild && (
          <div className={styles.tabSwitcher}>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "tower" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("tower")}
            >
              防禦塔
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "hero" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("hero")}
            >
              武將
            </button>
          </div>
        )}

        {showHeroes && heroBlockedReason && (
          <div
            className="small text-warning px-3 pt-2"
            data-testid="placement-hero-blocked"
          >
            {heroBlockedReason}
          </div>
        )}

        {/* 選單主體 */}
        <div className={styles.placementContent}>
          {showHeroes ? (
            <div className={styles.heroGrid}>
              {playerHeroes.map((hero) => {
                const norm = hero.hero_id.replace(/^hero_/, "");
                const config = BUILTIN_HEROES_CONFIG.find(
                  (c) => c.hero_id.replace(/^hero_/, "") === norm
                );
                // 已在場上：用身份比較，完整 ID 與去掉 hero_ 前綴的寫法互相視為同一位（兩個方向都擋）
                const isPlaced = placedHeroIds.some((p) =>
                  isSameHero(p, hero.hero_id)
                );
                const canHitAir =
                  config?.job === "archer" ||
                  config?.job === "mage" ||
                  norm === "sun_shang_xiang" ||
                  norm === "huang_zhong" ||
                  norm === "zhou_yu";

                return (
                  <button
                    key={hero.hero_id}
                    type="button"
                    className={`${styles.menuCard} ${isPlaced || !operable || heroBlockedReason ? styles.cardDisabled : ""}`}
                    disabled={isPlaced || !operable || !!heroBlockedReason}
                    onClick={() => {
                      if (onPlaceHero(ctx, col, row, hero)) close();
                    }}
                  >
                    <div className={styles.cardIcon}>
                      <img
                        src={`/images/shenmaSanguo/units/hero_${norm}.webp`}
                        alt={config?.name || norm}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                        }}
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display =
                            "none";
                        }}
                      />
                    </div>
                    <div className={styles.cardName}>
                      {config?.name || norm}
                    </div>
                    <div className={styles.cardStatus}>
                      {isPlaced ? "已在場上" : `Lv.${hero.level || 1}`}
                    </div>
                    <div
                      className={`${styles.cardAir} ${canHitAir ? styles.cardAirYes : ""}`}
                    >
                      {canHitAir ? "可對空" : "只打地面"}
                    </div>
                  </button>
                );
              })}
              {playerHeroes.length === 0 && (
                <p className={styles.emptyMsg}>出征隊伍中尚無武將</p>
              )}
            </div>
          ) : (
            <div className={styles.towerGrid}>
              {towerList.map((t) => {
                const canAfford = currentGold >= t.cost;
                const isAir = t.id === "archer" || t.id === "scholar";

                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`${styles.menuCard} ${!canAfford || !operable ? styles.cardDisabled : ""}`}
                    disabled={!canAfford || !operable}
                    onClick={() => {
                      if (onPlaceTower(ctx, col, row, t.id)) close();
                    }}
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
                    <div
                      className={`${styles.cardAir} ${isAir ? styles.cardAirYes : ""}`}
                    >
                      {t.air}
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
};
