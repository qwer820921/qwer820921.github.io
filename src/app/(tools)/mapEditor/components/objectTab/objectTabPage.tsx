"use client";
import React, { useState } from "react";
import styles from "../../styles/objectTab.module.css";
import EnemyConfigEditor from "./enemyConfigEditor";
import HeroConfigEditor from "./heroConfigEditor";

type SubTab = "enemy" | "hero";

export default function ObjectTabPage() {
  const [subTab, setSubTab] = useState<SubTab>("enemy");

  return (
    <div>
      {/* 子 Tab 導覽 */}
      <div className={styles.subTabs}>
        {(
          [
            { id: "enemy", label: "⚔️ 敵人設定" },
            { id: "hero", label: "🦸 武將設定" },
          ] as { id: SubTab; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            className={`${styles.subTab} ${subTab === id ? styles.subTabActive : ""}`}
            onClick={() => setSubTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 內容：兩個編輯器皆保持 mounted，只切換顯示，避免狀態遺失 */}
      <div style={{ display: subTab === "enemy" ? "block" : "none" }}>
        <EnemyConfigEditor />
      </div>
      <div style={{ display: subTab === "hero" ? "block" : "none" }}>
        <HeroConfigEditor />
      </div>
    </div>
  );
}
