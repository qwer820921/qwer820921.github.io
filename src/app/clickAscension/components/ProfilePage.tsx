/* eslint-disable @next/next/no-img-element */
import React from "react";
import { PlayerState } from "../types";
import "../styles/clickAscension.css";

import { GameStaticData } from "../api/clickAscensionApi";

interface ProfilePageProps {
  player: PlayerState;
  combatPower: number;
  userId: string | null;
  onLogin: (newId: string) => void;
  onLogout: () => void;
  onManualSave: () => void;
  gameConfig?: GameStaticData | null;
}

export default function ProfilePage({
  player,
  combatPower,
  userId,
  onLogin,
  onLogout,
  onManualSave,
  gameConfig,
}: ProfilePageProps) {
  const { system, stats, records } = player;

  const [inputId, setInputId] = React.useState("");

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const formatPercent = (num: number) => {
    return `${(num * 100).toFixed(1)}%`;
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  return (
    <div className="ca-profile-page">
      {/* Overview Section */}
      <div className="ca-profile-section">
        <div className="ca-profile-header-card ca-glass-static">
          <div className="ca-profile-avatar-large">
            <img
              src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${userId || "Guest"}`}
              alt="Avatar"
              className="ca-profile-avatar-img"
            />
            <div className="ca-profile-level-badge">Lv.{system.level}</div>
          </div>

          <div className="ca-profile-summary">
            {!userId ? (
              // --- Login Form ---
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  width: "100%",
                }}
              >
                <div
                  style={{ fontSize: "0.9rem", color: "var(--ca-text-muted)" }}
                >
                  輸入 ID 以讀取/建立存檔
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    className="ca-input"
                    style={{
                      flex: 1,
                      background: "rgba(0,0,0,0.3)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#fff",
                      padding: "4px 8px",
                      borderRadius: "4px",
                    }}
                    placeholder="User ID..."
                    value={inputId}
                    onChange={(e) => setInputId(e.target.value)}
                  />
                  <button
                    className="ca-btn ca-btn-primary"
                    style={{ padding: "4px 12px", fontSize: "0.9rem" }}
                    onClick={() => {
                      if (inputId.trim()) onLogin(inputId.trim());
                    }}
                  >
                    讀取
                  </button>
                </div>
              </div>
            ) : (
              // --- Logged In Summary ---
              <>
                <div
                  className="ca-profile-name"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>勇者 {userId}</span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={onManualSave}
                      style={{
                        fontSize: "0.7rem",
                        background: "rgba(16, 185, 129, 0.2)",
                        color: "#6ee7b7",
                        border: "none",
                        borderRadius: "4px",
                        padding: "2px 8px",
                        cursor: "pointer",
                      }}
                    >
                      上傳
                    </button>
                    <button
                      onClick={onLogout}
                      style={{
                        fontSize: "0.7rem",
                        background: "rgba(239, 68, 68, 0.2)",
                        color: "#fca5a5",
                        border: "none",
                        borderRadius: "4px",
                        padding: "2px 8px",
                        cursor: "pointer",
                      }}
                    >
                      登出
                    </button>
                  </div>
                </div>
                <div className="ca-profile-cp">
                  <span className="label">戰鬥力</span>
                  <span className="value">{formatNumber(combatPower)}</span>
                </div>

                <div className="ca-profile-exp">
                  <div className="info">
                    <span>EXP</span>
                    <span>
                      {formatNumber(system.currentXp)} /{" "}
                      {formatNumber(system.requiredXp)}
                    </span>
                  </div>
                  <div className="bar-bg">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${Math.min(100, (system.currentXp / system.requiredXp) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Attributes Section */}
      <div className="ca-profile-section">
        <h3 className="ca-section-title">戰鬥屬性</h3>
        <div className="ca-stats-grid">
          <StatItem
            label="基礎攻擊"
            value={formatNumber(stats.baseDamage)}
            icon="⚔️"
          />
          <StatItem
            label="自動攻擊"
            value={formatNumber(stats.autoAttackDamage)}
            icon="🤖"
          />
          <StatItem
            label="爆擊機率"
            value={formatPercent(stats.criticalChance)}
            icon="🎯"
          />
          <StatItem
            label="爆擊倍率"
            value={formatPercent(stats.criticalDamage)}
            icon="💥"
          />
          <StatItem
            label="金幣加成"
            value={`x${stats.goldMultiplier.toFixed(2)}`}
            icon="💰"
          />
          <StatItem
            label="CP 加成"
            value={`x${stats.cpMultiplier.toFixed(2)}`}
            icon="✨"
          />
        </div>
      </div>

      {/* Statistics Section */}
      <div className="ca-profile-section">
        <h3 className="ca-section-title">冒險記錄</h3>
        <div className="ca-records-list ca-glass-static">
          <RecordRow
            label="總點擊次數"
            value={formatNumber(records.totalClicks)}
          />
          <RecordRow
            label="總造成傷害"
            value={formatNumber(records.totalDamageDealt)}
          />
          <RecordRow
            label="擊殺怪物"
            value={formatNumber(records.monstersKilled)}
          />
          <RecordRow
            label="擊殺 BOSS"
            value={formatNumber(records.bossesKilled)}
          />
          <RecordRow
            label="最高到達關卡"
            value={formatNumber(records.maxStageReached)}
          />
          <RecordRow
            label="總獲得金幣"
            value={formatNumber(records.totalGoldEarned)}
          />
          <RecordRow
            label="遊玩時間"
            value={formatTime(records.playtimeSeconds)}
          />
        </div>
      </div>

      {/* Version Footer */}
      <div
        style={{
          marginTop: "24px",
          padding: "12px",
          textAlign: "center",
          color: "var(--ca-text-muted)",
          fontSize: "0.75rem",
          borderTop: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div>🎮 Click Ascension</div>
        <div style={{ marginTop: "4px" }}>
          版本 {String(gameConfig?.settings?.GAME_VERSION || "1.0.0")}
        </div>
      </div>
    </div>
  );
}

function StatItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="ca-stat-item ca-glass-static">
      <div className="ca-stat-icon">{icon}</div>
      <div className="ca-stat-content">
        <div className="ca-stat-label">{label}</div>
        <div className="ca-stat-value">{value}</div>
      </div>
    </div>
  );
}

function RecordRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="ca-record-row">
      <span className="ca-record-label">{label}</span>
      <span className="ca-record-value">{value}</span>
    </div>
  );
}
