"use client";

import React from "react";
import styles from "../styles/shenmaSanguoJs.module.css";

interface BattleTipsProps {
  onClose: () => void;
}

export const BattleTips: React.FC<BattleTipsProps> = ({ onClose }) => {
  return (
    <section className={styles.battleTips} aria-label="玩法提示">
      <div className={styles.battleTipsHeader}>
        <span className={styles.battleTipsTitle}>玩法提示</span>
        <button
          type="button"
          className={styles.battleTipsClose}
          onClick={onClose}
          aria-label="收起玩法提示"
        >
          收起
        </button>
      </div>
      <ol className={styles.battleTipsList}>
        <li>點地圖上的道路或建築位，從選單派出隊伍裡的武將（不花金幣）。</li>
        <li>
          在建築位用這一場的戰場金幣建造防禦塔，點選已建的塔可以升級；擊倒敵人會再得到金幣。
        </li>
        <li>
          準備好後按「迎戰」開始下一波。敵人走到終點會扣城防，城防歸零就落敗。
        </li>
      </ol>
      <p className={styles.battleTipsNote}>
        戰場金幣每一場開始時重新發放、只在戰場內使用；升級武將用的是存檔裡的世界金幣，兩者不同。
      </p>
    </section>
  );
};
