"use client";

import React from "react";
import { HeroEntity } from "../engine/entities/HeroEntity";
import styles from "../styles/shenmaSanguoJs.module.css";

interface HeroInfoModalProps {
  show: boolean;
  hero: HeroEntity | null;
  onClose: () => void;
}

export const HeroInfoModal: React.FC<HeroInfoModalProps> = ({
  show,
  hero,
  onClose,
}) => {
  if (!show || !hero) return null;

  const baseId = hero.heroId.replace(/^hero_/, "");
  const heroImg = `/images/shenmaSanguo/units/hero_${baseId}.webp`;

  return (
    <div className={styles.placementOverlay} onClick={onClose}>
      <div
        className={styles.upgradePanel}
        data-testid="hero-info-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 標題與關閉按鈕 */}
        <div className={styles.upgradeHeader}>
          <div className="d-flex align-items-center gap-2">
            <img
              src={heroImg}
              alt={hero.heroName}
              style={{ width: 28, height: 28, objectFit: "contain", borderRadius: 4 }}
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
            <div className={styles.unitName}>
              {hero.heroName}
              <small>Lv.{hero.heroLevel}</small>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        {/* 數值面板 */}
        <div className={styles.statsGrid}>
          <div className={styles.upgStatItem}>
            <span className={styles.upgStatLabel}>攻擊力</span>
            <span className={styles.upgStatValue}>{Math.round(hero.atk)}</span>
          </div>
          <div className={styles.upgStatItem}>
            <span className={styles.upgStatLabel}>護甲防禦</span>
            <span className={styles.upgStatValue}>{Math.round(hero.defStat)}</span>
          </div>
          <div className={styles.upgStatItem}>
            <span className={styles.upgStatLabel}>生命值</span>
            <span className={styles.upgStatValue}>
              {Math.round(hero.currentHp)}/{Math.round(hero.maxHp)}
            </span>
          </div>
          <div className={styles.upgStatItem}>
            <span className={styles.upgStatLabel}>攻擊間隔</span>
            <span className={styles.upgStatValue}>{hero.attackSpeed}s</span>
          </div>
        </div>

        {/* 專屬武將技能 */}
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "6px 8px", marginBottom: 10 }}>
          <div style={{ color: "#f59e0b", fontSize: "0.74rem", fontWeight: 700, marginBottom: 2 }}>
            🌟 專屬戰技
          </div>
          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.8)", lineHeight: 1.4 }}>
            {baseId === "ma_chao" && "【西涼鐵騎】初次交戰發動首擊衝鋒，造成 2.5x 致命傷害！"}
            {baseId === "zhao_yun" && "【一身是膽】擁有 25% 機率閃避攻擊，並以 100% 力量致命反擊！"}
            {baseId === "guan_yu" && "【義薄雲天】青龍偃月光環，周遭敵軍移動速度降低 40%！"}
            {baseId === "zhang_fei" && "【萬夫莫敵】咆哮長坂坡，周圍友軍攻擊速度提升 30%！"}
            {baseId === "zhou_yu" && "【赤壁烈焰】每次普攻點燃敵軍，造成 4 秒持續灼燒！"}
            {baseId === "huang_zhong" && "【神弓破軍】攻擊範圍大幅擴大，且有 20% 機率雙箭齊發！"}
            {baseId === "liu_bei" && "【仁德昭烈】大德仁心，提升周圍友方武將 35% 防禦力！"}
            {baseId === "wei_yan" && "【狂骨飲血】每次命中敵軍將 25% 傷害化作自身生命回復！"}
            {baseId === "cao_cao" && "【亂世霸業】奸雄威壓四方，周圍敵軍攻擊力降低 25%！"}
            {baseId === "xia_hou_dun" && "【剛烈不屈】拔矢啖睛，生命值越低所受傷害越少！"}
            {baseId === "liao_hua" && "【百戰先鋒】意志堅定，即使瀕臨死線依然能屹立不倒！"}
            {baseId === "yan_liang" && "【勇冠三軍】狂暴攻擊有 20% 機率直接將敵人擊暈 1 秒！"}
            {baseId === "sun_shang_xiang" && "【弓腰飛箭】身法敏捷，35% 機率發動連續雙重齊射！"}
          </div>
        </div>

        <button
          type="button"
          className={`${styles.actionBtn} ${styles.upgradeBtn}`}
          onClick={onClose}
        >
          確認關閉
        </button>
      </div>
    </div>
  );
};
