"use client";
import React, { useState } from "react";
import { Container } from "react-bootstrap";
import styles from "../styles/mapEditor.module.css";
import MapTab from "./mapTab";
import ObjectTabPage from "./objectTab/objectTabPage";

type PageTab = "map" | "object";

export default function MapEditorPage({
  tileImages = [],
}: {
  tileImages?: string[];
}) {
  const [activeTab, setActiveTab] = useState<PageTab>("map");

  return (
    <Container className={styles.container}>
      <div className={styles.pageTitle}>地圖編輯器</div>
      <div className={styles.pageSub}>
        繪製路徑航點 → 標記防禦區 / 障礙物 → 輸出 JSON 或直接儲存至 Sheet
      </div>

      {/* ── 頁面 Tab 導覽 ── */}
      <div className={styles.pageTabs}>
        {(
          [
            { id: "map", label: "🗺️ 地圖" },
            { id: "object", label: "⚔️ 物件" },
          ] as { id: PageTab; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            className={`${styles.pageTab} ${activeTab === id ? styles.pageTabActive : ""}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab 內容 ── */}
      {activeTab === "map" && <MapTab tileImages={tileImages} />}
      {activeTab === "object" && <ObjectTabPage />}
    </Container>
  );
}
