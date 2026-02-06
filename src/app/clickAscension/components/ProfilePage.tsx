/* eslint-disable @next/next/no-img-element */
import React from "react";
import { PlayerState, PlayerAttributes } from "../types";
import { formatBigNumber } from "../utils/formatNumber";
import "../styles/clickAscension.css";

import { GameStaticData } from "../api/clickAscensionApi";

interface ProfilePageProps {
  player: PlayerState;
  effectiveStats: PlayerAttributes; // Using proper type
  combatPower: number;
  userId: string | null;
  onLogin: (newId: string) => void;
  onLogout: () => void;
  onManualSave: () => Promise<void>;
  gameConfig?: GameStaticData | null;
}

export default function ProfilePage({
  player,
  effectiveStats,
  combatPower,
  userId,
  onLogin,
  onLogout,
  onManualSave,
  gameConfig,
}: ProfilePageProps) {
  const { system, wallet, records } = player;

  const [inputId, setInputId] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSaveClick = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onManualSave();
    } finally {
      setIsSaving(false);
    }
  };

  // 使用新的字母單位系統格式化數字
  const formatNumber = (num: number) =>
    formatBigNumber(Math.floor(num || 0), 2, 1000);

  // 別名，保持向後兼容
  const formatLargeNumber = formatNumber;

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

  // Rage Potion Status
  const isRageActive = player.activeBuffs?.ragePotionExpiresAt > Date.now();
  const rageTimeLeft = Math.max(
    0,
    Math.floor((player.activeBuffs?.ragePotionExpiresAt - Date.now()) / 1000)
  );

  return (
    <div className="ca-profile-page" style={{ paddingBottom: "20px" }}>
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
                  gap: "10px",
                  width: "100%",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--ca-text-secondary)",
                    fontWeight: "600",
                  }}
                >
                  輸入 ID 以讀取/建立存檔
                </div>
                <div style={{ display: "flex", gap: "6px", width: "100%" }}>
                  <input
                    type="text"
                    className="ca-input"
                    style={{
                      flex: 1,
                      minWidth: 0, // Critical for preventing flex overflow
                      background: "rgba(0,0,0,0.4)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "#fff",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      fontSize: "0.9rem",
                      outline: "none",
                    }}
                    placeholder="User ID..."
                    value={inputId}
                    onChange={(e) => setInputId(e.target.value)}
                  />
                  <button
                    className="ca-btn ca-btn-primary"
                    style={{
                      padding: "0 16px",
                      fontSize: "0.85rem",
                      height: "auto",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      borderRadius: "8px",
                    }}
                    onClick={() => inputId.trim() && onLogin(inputId.trim())}
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
                      onClick={handleSaveClick}
                      className="ca-profile-action-btn"
                      style={{
                        background: "rgba(16, 185, 129, 0.2)",
                        color: "#6ee7b7",
                        cursor: isSaving ? "wait" : "pointer",
                        opacity: isSaving ? 0.7 : 1,
                      }}
                    >
                      {isSaving ? "上傳中" : "上傳"}
                    </button>
                    <button
                      onClick={onLogout}
                      className="ca-profile-action-btn"
                      style={{
                        background: "rgba(239, 68, 68, 0.2)",
                        color: "#fca5a5",
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

      {/* Wallet / Currencies Section */}
      <div className="ca-profile-section">
        <h3 className="ca-section-title">財富狀態</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            background: "rgba(15, 23, 42, 0.4)",
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <CurrencyItem
            icon="💰"
            label="金幣"
            value={formatNumber(wallet.gold)}
            color="#fbbf24"
          />
          <CurrencyItem
            icon="💎"
            label="鑽石"
            value={formatNumber(wallet.diamonds)}
            color="#38bdf8"
          />
          <CurrencyItem
            icon="✨"
            label="點擊點數"
            value={formatNumber(wallet.clickPoints)}
            color="#c084fc"
          />
          <CurrencyItem
            icon="⚡"
            label="飛昇點數"
            value={formatNumber(wallet.ascensionPoints)}
            color="#f472b6"
          />
          <CurrencyItem
            icon="📜"
            label="等級積分"
            value={formatNumber(wallet.levelPoints)}
            color="#60a5fa"
          />
        </div>
      </div>

      {/* Attributes Section (Effective Stats) */}
      <div className="ca-profile-section">
        <h3 className="ca-section-title">最終戰鬥屬性 (含裝備加成)</h3>
        <div className="ca-stats-grid">
          <StatItem
            label="點擊基礎傷害"
            value={formatNumber(effectiveStats.baseDamage)}
            icon="⚔️"
          />
          <StatItem
            label="夥伴秒傷 (Ally DPS)"
            value={formatLargeNumber(effectiveStats.autoAttackDamage)}
            icon="🤖"
          />
          <StatItem
            label="爆擊機率"
            value={formatPercent(effectiveStats.criticalChance)}
            icon="🎯"
          />
          <StatItem
            label="爆擊傷害"
            value={formatPercent(effectiveStats.criticalDamage)}
            icon="💥"
          />
          <StatItem
            label="金幣獲取倍率"
            value={`${effectiveStats.goldMultiplier.toFixed(2)}x`}
            icon="💰"
          />
          <StatItem
            label="經驗獲取倍率"
            value={`${effectiveStats.xpMultiplier.toFixed(2)}x`}
            icon="📖"
          />
          <StatItem
            label="BOSS 傷害加成"
            value={`${effectiveStats.bossDamageMultiplier.toFixed(2)}x`}
            icon="👹"
          />
          <StatItem
            label="點擊點數倍率"
            value={`${effectiveStats.cpMultiplier.toFixed(2)}x`}
            icon="✨"
          />
          {/* New Stats */}
          <StatItem
            label="自動點擊 (每秒)"
            value={`${effectiveStats.autoClickPerSec.toFixed(1)} 次`}
            icon="⚡"
          />
          <StatItem
            label="關卡目標減少"
            value={`-${formatNumber(Math.floor(effectiveStats.monsterKillReduction))} 隻`}
            icon="📉"
          />
          <StatItem
            label="稀有怪出現機率"
            value={formatPercent(effectiveStats.rareMonsterChance)}
            icon="🌟"
          />
        </div>
      </div>

      {/* Active Buffs Section */}
      <div className="ca-profile-section">
        <h3 className="ca-section-title">當前狀態 / 藥水</h3>
        <div
          className="ca-glass-static"
          style={{
            padding: "12px",
            borderRadius: "12px",
            border: "1px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          {isRageActive ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                color: "#f87171",
              }}
            >
              <span style={{ fontSize: "1.4rem" }}>🧪</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: "bold", fontSize: "0.95rem" }}>
                  狂暴藥水 (Rage Potion)
                </div>
                <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>
                  剩餘時間:{" "}
                  <span style={{ fontFamily: "monospace" }}>
                    {formatTime(rageTimeLeft)}
                  </span>
                </div>
              </div>
              <div
                className="ca-pulse"
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: "#ef4444",
                  boxShadow: "0 0 10px #ef4444",
                }}
              />
            </div>
          ) : (
            <div
              style={{
                color: "var(--ca-text-muted)",
                fontSize: "0.85rem",
                textAlign: "center",
                padding: "10px",
              }}
            >
              尚無啟用的增益效果
            </div>
          )}
        </div>
      </div>

      {/* Statistics Section */}
      <div className="ca-profile-section">
        <h3 className="ca-section-title">生涯冒險記錄</h3>
        <div
          className="ca-records-list ca-glass-static"
          style={{ borderRadius: "12px" }}
        >
          <RecordRow
            label="🎮 遊戲總點擊"
            value={formatNumber(records.totalClicks)}
          />
          <RecordRow
            label="⚔️ 累計總傷害"
            value={formatNumber(records.totalDamageDealt)}
          />
          <RecordRow
            label="👾 擊敗怪物數"
            value={formatNumber(records.monstersKilled)}
          />
          <RecordRow
            label="😈 擊敗 BOSS 數"
            value={formatNumber(records.bossesKilled)}
          />
          <RecordRow
            label="📍 歷史最高關卡"
            value={`第 ${formatNumber(records.maxStageReached)} 關`}
          />
          <RecordRow
            label="💎 累計儲蓄/金幣"
            value={formatNumber(records.totalGoldEarned)}
          />
          <RecordRow
            label="⏳ 生涯遊玩時間"
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
          fontSize: "0.7rem",
          opacity: 0.6,
        }}
      >
        <div>
          遊戲版本: {String(gameConfig?.settings?.GAME_VERSION || "1.0.0")}
        </div>
        <div style={{ marginTop: "4px" }}>Click Ascension Project © 2026</div>
      </div>
    </div>
  );
}

function CurrencyItem({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ fontSize: "1rem" }}>{icon}</span>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span
          style={{
            fontSize: "0.6rem",
            color: "rgba(255,255,255,0.4)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: "0.85rem", color: color, fontWeight: "bold" }}>
          {value}
        </span>
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
