"use client";

import React, { useLayoutEffect, useRef } from "react";
import { Col, Row } from "react-bootstrap";
import { formatSec } from "../../utils/heroStats";
import styles from "../../styles/shenmaSanguo.module.css";

/** 防禦塔的目標優先（Round 17）：和 Godot Tower.gd 的 TARGET_MODES 相同 */
export type TowerTargetMode = "first" | "strongest" | "weakest";

const TARGET_OPTIONS: { mode: TowerTargetMode; label: string; hint: string }[] =
  [
    {
      mode: "first",
      label: "優先前方",
      hint: "打路線上走得最前面的敵人（預設）",
    },
    {
      mode: "strongest",
      label: "血量最多",
      hint: "打射程內目前血量最多的敵人",
    },
    {
      mode: "weakest",
      label: "血量最少",
      hint: "打射程內目前血量最少的敵人",
    },
  ];

interface UpgradePanelProps {
  data: {
    unit_type: "hero" | "tower";
    hero_id?: string;
    tower_type?: string;
    name: string;
    level: number;
    atk: number;
    atk_spd: number;
    range: number;
    hp?: number;
    upgrade_cost?: number;
    max_level?: boolean;
    can_afford?: boolean;
    /** 防禦塔：Godot 目前的實際目標優先、這座塔的識別碼與這一場的 battle_id（Round 17） */
    target_mode?: TowerTargetMode;
    tower_uid?: string;
    battle_id?: string;
    screen_pos: { x: number; y: number };
  };
  onUpgrade: () => void;
  onClose: () => void;
  /** 選擇目標優先：送出命令，畫面等 Godot 回傳實際模式後才更新 */
  onSetTargetMode?: (mode: TowerTargetMode) => void;
}

export default function UpgradePanel({
  data,
  onUpgrade,
  onClose,
  onSetTargetMode,
}: UpgradePanelProps) {
  const { screen_pos: pos } = data;
  const panelRef = useRef<HTMLDivElement>(null);
  // 每次繪製後依實際大小定位（面板在遊戲畫面容器裡，position: absolute）：
  // - Godot 送來的 screen_pos 是未縮放的遊戲畫面座標，乘上縮放比例 min(寬/540, 高/720)（和遊戲的畫面縮放相同）
  // - 放在單位上方，上方放不下時放在下方；只放在看得到的範圍（獨立戰鬥頁的遊戲畫面比視窗寬，左右超出視窗），
  //   面板的按鈕（目標選項、升級、關閉）才不會跑到畫面外
  useLayoutEffect(() => {
    const el = panelRef.current;
    const parent = el?.offsetParent;
    if (!el || !(parent instanceof HTMLElement)) return;
    const pr = parent.getBoundingClientRect();
    const k = Math.min(pr.width / 540, pr.height / 720) || 1;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const minL = Math.max(0, -pr.left) + 10;
    const maxL = Math.min(pr.width, window.innerWidth - pr.left) - w - 10;
    const minT = Math.max(0, -pr.top) + 10;
    const maxT = Math.min(pr.height, window.innerHeight - pr.top) - h - 10;
    const x = pos.x * k;
    const y = pos.y * k;
    const above = y - h - 24;
    const top = above >= minT ? above : y + 24;
    el.style.left = `${Math.max(minL, Math.min(maxL, x - w / 2))}px`;
    el.style.top = `${Math.max(minT, Math.min(maxT, top))}px`;
  });

  const style: React.CSSProperties = {
    position: "absolute",
    left: Math.min(window.innerWidth - 220, Math.max(10, pos.x - 100)),
    top: Math.min(window.innerHeight - 220, Math.max(10, pos.y - 180)),
    zIndex: 1000,
  };

  const showTarget =
    data.unit_type === "tower" &&
    !!data.tower_uid &&
    !!data.target_mode &&
    !!onSetTargetMode;
  const active = TARGET_OPTIONS.find((o) => o.mode === data.target_mode);

  return (
    <div
      ref={panelRef}
      className={styles.upgradePanel}
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.upgradeHeader}>
        <span className={styles.unitName}>
          {data.name} <small>Lv.{data.level}</small>
        </span>
        <button className={styles.closeBtn} onClick={onClose}>
          ×
        </button>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.upgStatItem}>
          <span className={styles.upgStatLabel}>攻擊力</span>
          <span className={styles.upgStatValue}>{data.atk.toFixed(0)}</span>
        </div>
        <div className={styles.upgStatItem}>
          {/* Godot 送來的是每秒攻擊次數（1 ÷ 攻擊間隔）；顯示成攻擊間隔，和武將列表、升級預覽一致 */}
          <span className={styles.upgStatLabel}>攻擊間隔</span>
          <span
            className={styles.upgStatValue}
            data-testid="upgrade-panel-interval"
          >
            {data.atk_spd > 0 ? `${formatSec(1 / data.atk_spd)}秒` : "—"}
          </span>
        </div>
        <div className={styles.upgStatItem}>
          <span className={styles.upgStatLabel}>射程</span>
          <span className={styles.upgStatValue}>{data.range.toFixed(1)}格</span>
        </div>
        {data.unit_type === "hero" && (
          <div className={styles.upgStatItem}>
            <span className={styles.upgStatLabel}>生命值</span>
            <span className={styles.upgStatValue}>{data.hp?.toFixed(0)}</span>
          </div>
        )}
      </div>

      {showTarget && (
        <div className={styles.targetModeBox} data-testid="tower-target">
          <div className={styles.upgStatLabel}>攻擊目標</div>
          <Row
            className={`g-1 ${styles.targetModeRow}`}
            role="group"
            aria-label="攻擊目標"
          >
            {TARGET_OPTIONS.map((o) => (
              <Col xs={4} key={o.mode}>
                <button
                  className={`${styles.targetModeBtn} ${
                    o.mode === data.target_mode
                      ? styles.targetModeBtnActive
                      : ""
                  }`}
                  aria-pressed={o.mode === data.target_mode}
                  data-testid={`tower-target-${o.mode}`}
                  onClick={() => {
                    if (o.mode !== data.target_mode) onSetTargetMode?.(o.mode);
                  }}
                >
                  {o.label}
                </button>
              </Col>
            ))}
          </Row>
          {active && (
            <div
              className={styles.targetModeHint}
              data-testid="tower-target-hint"
            >
              {active.hint}
            </div>
          )}
        </div>
      )}

      <div className={styles.upgradeActions}>
        {data.unit_type === "tower" && !data.max_level && (
          <button
            className={`${styles.actionBtn} ${styles.upgradeBtn} ${!data.can_afford ? styles.btnDisabled : ""}`}
            disabled={!data.can_afford}
            onClick={onUpgrade}
          >
            升級 (💰{data.upgrade_cost})
          </button>
        )}
        {data.max_level && (
          <div className={styles.maxLevelTag}>已達最高等級</div>
        )}
      </div>
    </div>
  );
}
