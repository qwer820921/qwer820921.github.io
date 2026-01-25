/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from "react";
import { PlayerState } from "../types";
import "../styles/clickAscension.css";

type ShopTab = "DAILY" | "GOLD" | "LEVEL" | "CLICK" | "ASCENSION";

import { GameStaticData } from "../api/clickAscensionApi";

interface ShopPageProps {
  player: PlayerState;
  onPurchase: (itemId: string) => void;
  gameConfig?: GameStaticData | null;
}

// Realm Helper
const getRealmInfo = (level: number) => {
  if (level <= 20) return { name: "練氣期", color: "#a7f3d0" };
  if (level <= 40) return { name: "築基期", color: "#6ee7b7" };
  if (level <= 60) return { name: "金丹期", color: "#fbbf24" };
  if (level <= 80) return { name: "元嬰期", color: "#f472b6" };
  if (level <= 100) return { name: "化神期", color: "#818cf8" };
  return { name: "渡劫飛昇", color: "#c084fc" };
};

export default function ShopPage({
  player,
  onPurchase,
  gameConfig,
}: ShopPageProps) {
  const [activeTab, setActiveTab] = useState<ShopTab>("DAILY");
  const realm = getRealmInfo(player.system.level);

  // Helper to get current level of an upgrade from PlayerState
  const getUpgradeLevel = (id: string): number => {
    // Gold Shop
    if (id === "gold_shop_weapon") return player.goldShop.weaponLevel;
    if (id === "gold_shop_mercenary") return player.goldShop.mercenaryLevel;
    if (id === "gold_shop_partner") return player.goldShop.partnerLevel;
    if (id === "gold_potion_rage") return player.inventory.ragePotionCount;

    // Level Shop
    if (id === "level_shop_wisdom") return player.levelShop.wisdomLevel;
    if (id === "level_shop_greed") return player.levelShop.greedLevel;
    if (id === "level_shop_auto") return player.levelShop.autoClickLevel;
    if (id === "level_shop_slayer") return player.levelShop.bossSlayerLevel;
    if (id === "level_shop_luck") return player.levelShop.luckLevel;

    // Click Shop
    if (id === "click_shop_damage") return player.clickShop.clickPowerLevel;
    if (id === "click_shop_crit") return player.clickShop.critDamageLevel;
    if (id === "click_shop_gold") return player.clickShop.goldBonusLevel;

    return 0; // Default
  };

  // Helper to calculate cost
  const calculateCost = (
    base: number,
    mult: number,
    level: number,
    type: string
  ) => {
    // Special case for Potion/Consumable (fixed cost)
    if (type === "ADD_INVENTORY") return base;

    // If mult === 1, use LINEAR formula: Base + Level
    // Otherwise use EXPONENTIAL: Base * (Mult ^ Level)
    if (mult === 1 || mult === 1.0) {
      return Math.floor(base + level);
    }
    return Math.floor(base * Math.pow(mult, level));
  };

  // Helper to get currency label emoji
  const getCurrencyLabel = (currency: string) => {
    if (currency === "GOLD") return "💰";
    if (currency === "LP") return "🆙";
    if (currency === "CP") return "⚡";
    if (currency === "DIAMOND") return "💎";
    return currency;
  };

  // Helper to get player currency amount
  const getPlayerCurrency = (currency: string) => {
    if (currency === "GOLD") return player.wallet.gold;
    if (currency === "LP") return player.wallet.levelPoints;
    if (currency === "CP") return player.wallet.clickPoints;
    if (currency === "DIAMOND") return player.wallet.diamonds;
    return 0;
  };

  const renderDynamicUpgrades = (shopType: string) => {
    if (!gameConfig || !gameConfig.upgrades) return null;

    const items = gameConfig.upgrades.filter(
      (u) => (u as any).Shop_Type === shopType
    );
    if (items.length === 0) return null;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {items.map((item) => {
          const it = item as any;
          const level = getUpgradeLevel(it.ID);
          const cost = calculateCost(
            it.Cost_Base,
            it.Cost_Mult,
            level,
            it.Effect_Type
          );
          const currencyLabel = getCurrencyLabel(it.Currency);
          const playerCurrency = getPlayerCurrency(it.Currency);
          const canAfford = playerCurrency >= cost;

          // Format Description - Replace {val} with Effect_Val
          let desc = it.Desc_Template || it.Name;
          if (desc.includes("{val}")) {
            desc = desc.replace("{val}", String(it.Effect_Val));
          }

          return (
            <UpgradeRow
              key={it.ID}
              name={it.Name}
              desc={`${desc} [Lv.${level}]`}
              level={level}
              cost={cost}
              currencyLabel={currencyLabel}
              canAfford={canAfford}
              onClick={() => onPurchase(it.ID)}
            />
          );
        })}
      </div>
    );
  };

  // ... (Daily Reward Logic remains same)
  const canClaimDaily = () => {
    if (!player.lastDailyRewardClaimTime) return true;
    const last = new Date(player.lastDailyRewardClaimTime);
    const now = new Date();
    return (
      last.getDate() !== now.getDate() ||
      last.getMonth() !== now.getMonth() ||
      last.getFullYear() !== now.getFullYear()
    );
  };
  const isDailyAvailable = canClaimDaily();

  return (
    <div className="ca-shop-container">
      {/* Tab Navigation */}
      <div className="ca-shop-tabs">
        {/* Daily Shop */}
        <button
          onClick={() => setActiveTab("DAILY")}
          className={`ca-shop-tab-btn daily ${activeTab === "DAILY" ? "active" : ""}`}
        >
          <div className="icon">📅</div>
          <div className="label">每日商店</div>
          {isDailyAvailable && (
            <div
              style={{
                position: "absolute",
                top: "8px",
                right: "8px",
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#ef4444",
                boxShadow: "0 0 5px #ef4444",
              }}
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab("GOLD")}
          className={`ca-shop-tab-btn gold ${activeTab === "GOLD" ? "active" : ""}`}
        >
          <div className="icon">💰</div>
          <div className="label">金幣商店</div>
        </button>
        <button
          onClick={() => setActiveTab("LEVEL")}
          className={`ca-shop-tab-btn level ${activeTab === "LEVEL" ? "active" : ""}`}
        >
          <div className="icon">🆙</div>
          <div className="label">等級商店</div>
        </button>
        <button
          onClick={() => setActiveTab("CLICK")}
          className={`ca-shop-tab-btn click ${activeTab === "CLICK" ? "active" : ""}`}
        >
          <div className="icon">⚡</div>
          <div className="label">點擊商店</div>
        </button>
        <button
          onClick={() => setActiveTab("ASCENSION")}
          className={`ca-shop-tab-btn ascension ${activeTab === "ASCENSION" ? "active" : ""}`}
        >
          <div className="icon">🕊️</div>
          <div className="label">飛昇商店</div>
        </button>
      </div>

      {/* Content Area */}
      <div className="ca-shop-content">
        {/* === DAILY SHOP TAB === */}
        {activeTab === "DAILY" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              height: "100%",
            }}
          >
            <div
              style={{
                background: "var(--ca-bg-card)",
                borderRadius: "var(--ca-radius-lg)",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 0 20px rgba(0,0,0,0.2)",
              }}
            >
              <div style={{ fontSize: "1.2rem", fontWeight: "bold" }}>
                每日簽到
              </div>
              <div
                style={{
                  fontSize: "0.9rem",
                  color: "var(--ca-text-muted)",
                  textAlign: "center",
                }}
              >
                每天登入領取免費獎勵！
              </div>
              <div
                style={{
                  marginTop: "16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  padding: "16px",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: "12px",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    fontSize: "3rem",
                    filter: isDailyAvailable
                      ? "drop-shadow(0 0 10px rgba(253, 224, 71, 0.5))"
                      : "grayscale(1)",
                  }}
                >
                  🎁
                </div>
                <div
                  style={{
                    fontWeight: "bold",
                    fontSize: "1.2rem",
                    color: "#fde047",
                  }}
                >
                  10 💎 + 500 💰
                </div>
              </div>
              <button
                className={`ca-btn ${isDailyAvailable ? "ca-btn-primary" : ""}`}
                style={{
                  marginTop: "16px",
                  width: "100%",
                  padding: "12px",
                  opacity: isDailyAvailable ? 1 : 0.5,
                  cursor: isDailyAvailable ? "pointer" : "not-allowed",
                  background: isDailyAvailable ? "" : "#334155",
                  color: isDailyAvailable ? "" : "#64748b",
                }}
                disabled={!isDailyAvailable}
                onClick={() => onPurchase("daily_checkin")}
              >
                {isDailyAvailable ? "領取獎勵" : "明日再來"}
              </button>
            </div>
          </div>
        )}

        {/* === GOLD SHOP TAB === */}
        {activeTab === "GOLD" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div
              className="ca-realm-card"
              style={{
                background: "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)",
              }}
            >
              <div className="ca-realm-title">金幣 (Gold)</div>
              <div
                className="ca-realm-name"
                style={{ color: "#fff", fontSize: "1.5rem" }}
              >
                {Math.floor(player.wallet.gold).toLocaleString()}
              </div>
              <div className="ca-realm-level" style={{ color: "#fde68a" }}>
                擊殺怪物獲得
              </div>
            </div>

            {/* Dynamic Upgrades OR Fallback */}
            {gameConfig?.upgrades ? (
              renderDynamicUpgrades("GOLD")
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                {/* Fallback to original static content if needed, but since we pushed config, we prefer empty or loading if config is missing? 
                        Let's keep original static as fallback below for safety if getGameConfigs fails.
                    */}
                <div style={{ color: "gray", textAlign: "center" }}>
                  Loading Config... (Fallback Mode)
                </div>
                {/* ... (Original static items could go here) ... */}
              </div>
            )}

            {/* Original Static Items below as fallback? 
                 Actually, better to REPLCACE the static block with determining logic. 
                 If gameConfig exists, use it. If not, show fallback logic.
             */}

            {!gameConfig?.upgrades && (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                <UpgradeRow
                  name="鍛造武器 (Fallback)"
                  desc="基礎攻擊力 +1"
                  level={player.goldShop.weaponLevel}
                  cost={10}
                  currencyLabel="💰"
                  canAfford={false}
                  onClick={() => {}}
                />
              </div>
            )}

            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.1)",
                margin: "10px 0",
              }}
            ></div>

            <p
              className="ca-text-muted"
              style={{ fontSize: "0.8rem", paddingLeft: "4px" }}
            >
              使用 💎 購買金幣補給
            </p>
            <div className="ca-shop-item-grid">
              {/* Static Diamond Items for now */}
              <ShopItemCard
                name="金幣小包"
                desc="獲得 1,000 金幣"
                icon="💰"
                cost="💎 10"
                canAfford={player.wallet.diamonds >= 10}
                onClick={() => onPurchase("gold_pack_1")}
              />
              <ShopItemCard
                name="金幣大包"
                desc="獲得 10,000 金幣"
                icon="💰"
                cost="💎 80"
                canAfford={player.wallet.diamonds >= 80}
                onClick={() => onPurchase("gold_pack_2")}
              />
            </div>
          </div>
        )}

        {/* === LEVEL SHOP TAB === */}
        {activeTab === "LEVEL" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div
              className="ca-realm-card"
              style={{
                background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
              }}
            >
              <div className="ca-realm-title">等級積分 (LP)</div>
              <div
                className="ca-realm-name"
                style={{ color: "#fff", fontSize: "1.5rem" }}
              >
                {player.wallet.levelPoints}
              </div>
              <div className="ca-realm-level" style={{ color: "#d1fae5" }}>
                升級可獲得點數
              </div>
            </div>

            <p
              className="ca-text-muted"
              style={{ fontSize: "0.8rem", paddingLeft: "4px" }}
            >
              消耗 <span style={{ color: "#10b981" }}>🆙 等級積分</span>{" "}
              學習永久天賦
            </p>

            {gameConfig?.upgrades ? (
              renderDynamicUpgrades("LEVEL")
            ) : (
              <div style={{ textAlign: "center" }}>Loading...</div>
            )}
          </div>
        )}

        {/* === CLICK SHOP TAB === */}
        {activeTab === "CLICK" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div className="ca-realm-card">
              <div className="ca-realm-title">當前境界</div>
              <div className="ca-realm-name" style={{ color: realm.color }}>
                {realm.name}
              </div>
              <div className="ca-realm-level">等級 {player.system.level}</div>
            </div>
            <p
              className="ca-text-muted"
              style={{ fontSize: "0.8rem", paddingLeft: "4px" }}
            >
              消耗{" "}
              <span style={{ color: "var(--ca-accent-cyan)" }}>
                ⚡ 點擊點數
              </span>{" "}
              提升修煉屬性
            </p>

            {gameConfig?.upgrades ? (
              renderDynamicUpgrades("CLICK")
            ) : (
              <div style={{ textAlign: "center" }}>Loading...</div>
            )}
          </div>
        )}

        {/* === ASCENSION SHOP TAB === */}
        {activeTab === "ASCENSION" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px 0",
              opacity: 0.5,
              gap: "16px",
            }}
          >
            <div style={{ fontSize: "4rem", filter: "grayscale(1)" }}>🕊️</div>
            <div style={{ fontSize: "1.2rem", fontWeight: "bold" }}>
              飛昇商店
            </div>
            <div style={{ fontSize: "0.9rem", color: "var(--ca-text-muted)" }}>
              敬請期待
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Sub-components
function ShopItemCard({
  name,
  desc,
  icon,
  cost,
  canAfford,
  onClick,
}: {
  name: string;
  desc: string;
  icon: string;
  cost: string;
  canAfford: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className="ca-glass-static"
      style={{
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        cursor: "pointer",
        transition: "transform 0.1s",
      }}
      onClick={() => canAfford && onClick()}
    >
      <div style={{ fontSize: "2rem", marginBottom: "4px" }}>{icon}</div>
      <div style={{ fontWeight: "bold", fontSize: "0.85rem", color: "#fff" }}>
        {name}
      </div>
      <div
        style={{ fontSize: "0.7rem", color: "#94a3b8", marginBottom: "8px" }}
      >
        {desc}
      </div>
      <div
        className={`ca-btn ${canAfford ? "ca-btn-primary" : ""}`}
        style={{
          fontSize: "0.75rem",
          padding: "6px",
          width: "100%",
          background: canAfford ? "" : "#334155",
          color: canAfford ? "" : "#64748b",
          cursor: canAfford ? "pointer" : "not-allowed",
        }}
      >
        {cost}
      </div>
    </div>
  );
}

function UpgradeRow({
  name,
  desc,
  level,
  cost,
  canAfford,
  onClick,
  currencyLabel = "⚡",
}: {
  name: string;
  desc: string;
  level: number;
  cost: number;
  canAfford: boolean;
  onClick: () => void;
  currencyLabel?: string;
}) {
  return (
    <div className="ca-upgrade-row">
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#fff" }}
          >
            {name}
          </span>
          <span
            style={{
              fontSize: "0.65rem",
              padding: "2px 6px",
              background: "rgba(255,255,255,0.1)",
              borderRadius: "4px",
              color: "var(--ca-accent-cyan)",
            }}
          >
            Lv.{level}
          </span>
        </div>
        <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{desc}</div>
      </div>
      <button
        onClick={() => canAfford && onClick()}
        disabled={!canAfford}
        className="ca-upgrade-btn"
      >
        <span style={{ fontSize: "0.7rem", fontWeight: "bold" }}>升級</span>
        <span style={{ fontSize: "0.7rem" }}>
          {currencyLabel} {cost.toLocaleString()}
        </span>
      </button>
    </div>
  );
}
