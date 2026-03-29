/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from "react";
import {
  PlayerState,
  UpgradeShopType,
  UpgradeEffectType,
  CurrencyType,
} from "../types";
import { formatBigNumber } from "../utils/formatNumber";
import "../styles/clickAscension.css";

type ShopTab = "DAILY" | "GOLD" | "LEVEL" | "CLICK" | "ASCENSION" | "EQUIPMENT";

import { GameStaticData } from "../api/clickAscensionApi";

interface ShopPageProps {
  player: PlayerState;
  onPurchase: (itemId: string) => void;
  onBulkPurchase?: (itemId: string, quantity: number) => void;
  onResetLevelPoints?: () => void;
  gameConfig?: GameStaticData | null;
  autoGachaBox?: string | null;
  onToggleAutoGacha?: (box: string | null) => void;
}

// Realm Helper - Based on Total Click Shop Upgrades (Cultivation Depth)
const getRealmInfo = (totalLevels: number) => {
  if (totalLevels <= 50) return { name: "練氣期", color: "#a7f3d0" };
  if (totalLevels <= 150) return { name: "築基期", color: "#6ee7b7" };
  if (totalLevels <= 300) return { name: "金丹期", color: "#fbbf24" };
  if (totalLevels <= 500) return { name: "元嬰期", color: "#f472b6" };
  if (totalLevels <= 800) return { name: "化神期", color: "#818cf8" };
  return { name: "渡劫飛昇", color: "#c084fc" };
};

// 使用新的字母單位系統格式化數字
const formatNumber = (num: number): string => formatBigNumber(num, 2, 1000);

export default function ShopPage({
  player,
  onPurchase,
  onBulkPurchase,
  onResetLevelPoints,
  gameConfig,
  autoGachaBox,
  onToggleAutoGacha,
}: ShopPageProps) {
  const [activeTab, setActiveTab] = useState<ShopTab>("DAILY");
  const [goldSubTab, setGoldSubTab] = useState<"UPGRADE" | "RECRUIT">(
    "UPGRADE"
  );
  const [activeProbBox, setActiveProbBox] = useState<string | null>(null);
  const [gachaCurrency, setGachaCurrency] = useState<"AP" | "DIAMOND">(
    "DIAMOND"
  );

  // Calculate Total Click Shop Levels (Cultivation)
  // Fix: Only sum levels for items that actually exist in the current Game Configuration.
  // This prevents stale keys from old saves from inflating the count.
  const totalClickLevels = React.useMemo(() => {
    if (!gameConfig?.upgrades) return 0;

    // Get valid IDs from config
    const validClickUpgradeIds = gameConfig.upgrades
      .filter((u: any) => u.Shop_Type === UpgradeShopType.CLICK)
      .map((u: any) => u.ID);

    // Sum levels only for these valid IDs
    return validClickUpgradeIds.reduce((total, id) => {
      return total + (player.clickShop[id] || 0);
    }, 0);
  }, [player.clickShop, gameConfig]);

  // Calculate Gacha Costs dynamically
  const gachaCosts = React.useMemo(() => {
    const s = gameConfig?.settings || {};
    const isDia = gachaCurrency === "DIAMOND";
    return {
      basic: isDia
        ? Number(s.GACHA_COST_BASIC_DIAMOND) || 2
        : Number(s.GACHA_COST_BASIC_AP) || 20,
      adv: isDia
        ? Number(s.GACHA_COST_ADV_DIAMOND) || 20
        : Number(s.GACHA_COST_ADV_AP) || 200,
      prem: isDia
        ? Number(s.GACHA_COST_PREM_DIAMOND) || 100
        : Number(s.GACHA_COST_PREM_AP) || 1000,
    };
  }, [gameConfig?.settings, gachaCurrency]);

  const gachaSuffix = gachaCurrency === "DIAMOND" ? "diamond" : "ap";
  const gachaSymbol = gachaCurrency === "DIAMOND" ? "💎" : "🕊️";

  const realm = getRealmInfo(totalClickLevels);

  // Helper to get current level of an upgrade from PlayerState
  const getUpgradeLevel = (id: string): number => {
    // Special case for consumable items
    if (id === "gold_potion_rage") return player.inventory.ragePotionCount || 0;

    // Dynamic Lookup based on ID prefix
    if (id.startsWith("gold_shop_")) return player.goldShop[id] || 0;
    if (id.startsWith("level_shop_")) return player.levelShop[id] || 0;
    if (id.startsWith("click_shop_")) return player.clickShop[id] || 0;
    if (id.startsWith("ascension_shop_") || id.startsWith("asc_"))
      return player.ascensionShop[id] || 0;

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
    if (type === UpgradeEffectType.ADD_INVENTORY) return base;

    // If mult === 1, use LINEAR formula: Base + Level
    // Otherwise use EXPONENTIAL: Base * (Mult ^ Level)
    if (mult === 1 || mult === 1.0) {
      return Math.floor(base + level);
    }
    return Math.floor(base * Math.pow(mult, level));
  };

  // Helper to get currency label emoji
  const getCurrencyLabel = (currency: string) => {
    if (currency === CurrencyType.GOLD) return "💰";
    if (currency === CurrencyType.LP) return "🆙";
    if (currency === CurrencyType.CP) return "⚡";
    if (currency === CurrencyType.DIAMOND) return "💎";
    if (currency === CurrencyType.AP) return "🕊️";
    return currency;
  };

  // Helper to get player currency amount
  const getPlayerCurrency = (currency: string) => {
    if (currency === CurrencyType.GOLD) return player.wallet.gold;
    if (currency === CurrencyType.LP) return player.wallet.levelPoints;
    if (currency === CurrencyType.CP) return player.wallet.clickPoints;
    if (currency === CurrencyType.DIAMOND) return player.wallet.diamonds;
    if (currency === CurrencyType.AP) return player.wallet.ascensionPoints;
    return 0;
  };

  const renderUpgradeList = (items: any[], shopType?: string) => {
    if (items.length === 0)
      return (
        <div style={{ textAlign: "center", padding: "20px", color: "gray" }}>
          無項目
        </div>
      );

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
          const maxLevel = Number(it.Max_Level || 0);
          const isMaxed = maxLevel > 0 && level >= maxLevel;
          const canAfford = !isMaxed && playerCurrency >= cost;

          // 計算升25級的總費用（只對 GOLD 商店有效）
          let cost25 = 0;
          let canAfford25 = false;
          const isGoldShop =
            shopType === UpgradeShopType.GOLD ||
            it.Shop_Type === UpgradeShopType.GOLD;

          if (isGoldShop && !isMaxed) {
            // 計算連續升25級所需的總費用
            const levelsToUpgrade =
              maxLevel > 0 ? Math.min(25, maxLevel - level) : 25;

            if (levelsToUpgrade > 0) {
              for (let i = 0; i < levelsToUpgrade; i++) {
                cost25 += calculateCost(
                  it.Cost_Base,
                  it.Cost_Mult,
                  level + i,
                  it.Effect_Type
                );
              }
              canAfford25 = playerCurrency >= cost25 && levelsToUpgrade === 25;
            }
          }

          // 計算里程碑倍率提示
          const milestoneLevel = Number(it.Milestone_Level || 0);
          const milestoneMult = Number(it.Milestone_Mult || 1);
          let nextMilestone1 = 0; // 升1級後的倍率加成 (0 = 無)
          let nextMilestone25 = 0; // 升25級範圍內的倍率加成 (0 = 無)

          if (milestoneLevel > 0 && milestoneMult > 1) {
            // 檢查升 1 級是否達到里程碑
            const nextLevel = level + 1;
            if (nextLevel > 0 && nextLevel % milestoneLevel === 0) {
              nextMilestone1 = milestoneMult;
            }

            // 檢查升 25 級範圍內是否包含任何里程碑
            if (isGoldShop) {
              const endLevel = level + 25;
              // 找出範圍內的里程碑數量
              const milestonesInRange =
                Math.floor(endLevel / milestoneLevel) -
                Math.floor(level / milestoneLevel);
              if (milestonesInRange > 0) {
                // 計算新的總倍率（相比當前）
                const currentMultiplier = Math.pow(
                  milestoneMult,
                  Math.floor(level / milestoneLevel)
                );
                const newMultiplier = Math.pow(
                  milestoneMult,
                  Math.floor(endLevel / milestoneLevel)
                );
                nextMilestone25 = newMultiplier / currentMultiplier;
              }
            }
          }

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
              isMaxed={isMaxed}
              onClick={() => onPurchase(it.ID)}
              // 升25級相關 props
              showBulkUpgrade={isGoldShop}
              cost25={cost25}
              canAfford25={canAfford25}
              onBulkUpgrade={() => {
                // 使用批量購買函數，一次處理 25 級
                if (onBulkPurchase) {
                  onBulkPurchase(it.ID, 25);
                } else {
                  // fallback: 連續購買 (可能有狀態問題)
                  for (let i = 0; i < 25; i++) {
                    onPurchase(it.ID);
                  }
                }
              }}
              // 里程碑提示
              nextMilestone1={nextMilestone1}
              nextMilestone25={nextMilestone25}
            />
          );
        })}
      </div>
    );
  };

  const renderDynamicUpgrades = (shopType: string) => {
    if (!gameConfig || !gameConfig.upgrades) return null;
    const items = gameConfig.upgrades.filter(
      (u: any) => u.Shop_Type === shopType
    );
    return renderUpgradeList(items, shopType);
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
        <button
          onClick={() => setActiveTab("EQUIPMENT")}
          className={`ca-shop-tab-btn equipment ${activeTab === "EQUIPMENT" ? "active" : ""}`}
        >
          <div className="icon">⚔️</div>
          <div className="label">裝備扭蛋</div>
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
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px",
                    fontWeight: "bold",
                    fontSize: "1.1rem",
                    color: "#fde047",
                    marginTop: "8px",
                  }}
                >
                  <div>
                    {Number((gameConfig?.settings as any)?.DAILY_REWARD_GEM) ||
                      0}{" "}
                    💎 鑽石
                  </div>
                  <div>
                    {formatNumber(
                      Number(
                        (gameConfig?.settings as any)?.DAILY_REWARD_GOLD
                      ) || 0
                    )}{" "}
                    💰 金幣
                  </div>
                  <div>
                    {formatNumber(
                      Number((gameConfig?.settings as any)?.DAILY_REWARD_AP) ||
                        0
                    )}{" "}
                    🕊️ 飛昇點數
                  </div>
                </div>
              </div>
              <button
                className={`ca-btn ${isDailyAvailable && gameConfig?.settings ? "ca-btn-primary" : ""}`}
                style={{
                  marginTop: "16px",
                  width: "100%",
                  padding: "12px",
                  opacity: isDailyAvailable && gameConfig?.settings ? 1 : 0.5,
                  cursor:
                    isDailyAvailable && gameConfig?.settings
                      ? "pointer"
                      : "not-allowed",
                  background:
                    isDailyAvailable && gameConfig?.settings ? "" : "#334155",
                  color:
                    isDailyAvailable && gameConfig?.settings ? "" : "#64748b",
                }}
                disabled={!isDailyAvailable || !gameConfig?.settings}
                onClick={() => onPurchase("daily_checkin")}
              >
                {!gameConfig?.settings
                  ? "讀取中..."
                  : isDailyAvailable
                    ? "領取獎勵"
                    : "明日再來"}
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
                {formatNumber(Math.floor(player.wallet.gold))}
              </div>
              <div className="ca-realm-level" style={{ color: "#fde68a" }}>
                擊殺怪物獲得
              </div>
            </div>

            {/* Sub Tabs for Gold Shop */}
            <div
              className="ca-shop-subtabs"
              style={{ display: "flex", gap: "10px", marginBottom: "8px" }}
            >
              <button
                className={`ca-btn ${goldSubTab === "UPGRADE" ? "ca-btn-primary" : ""}`}
                style={{
                  flex: 1,
                  padding: "8px",
                  fontSize: "0.9rem",
                  background:
                    goldSubTab === "UPGRADE" ? "" : "rgba(255,255,255,0.1)",
                }}
                onClick={() => setGoldSubTab("UPGRADE")}
              >
                🛠️ 金幣強化
              </button>
              <button
                className={`ca-btn ${goldSubTab === "RECRUIT" ? "ca-btn-primary" : ""}`}
                style={{
                  flex: 1,
                  padding: "8px",
                  fontSize: "0.9rem",
                  background:
                    goldSubTab === "RECRUIT" ? "" : "rgba(255,255,255,0.1)",
                }}
                onClick={() => setGoldSubTab("RECRUIT")}
              >
                🚩 招兵買馬
              </button>
            </div>

            {/* Dynamic Upgrades with Filter */}
            {gameConfig?.upgrades ? (
              (() => {
                const allGoldItems = gameConfig.upgrades.filter(
                  (u: any) => u.Shop_Type === UpgradeShopType.GOLD
                );
                const filteredItems = allGoldItems.filter((u: any) => {
                  if (goldSubTab === "RECRUIT") {
                    return u.Effect_Type === UpgradeEffectType.ADD_AUTO_DMG;
                  } else {
                    // UPGRADE: Everything NOT ADD_AUTO_DMG
                    return u.Effect_Type !== UpgradeEffectType.ADD_AUTO_DMG;
                  }
                });
                return renderUpgradeList(filteredItems);
              })()
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                <div style={{ color: "gray", textAlign: "center" }}>
                  Loading Config...
                </div>
              </div>
            )}

            {/* Diamond Packs - Show only in Upgrade tab? Or always? User didn't specify. Assuming always at bottom. */}
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
              {onResetLevelPoints && (
                <button
                  onClick={onResetLevelPoints}
                  style={{
                    position: "absolute",
                    top: "12px",
                    right: "12px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.3)",
                    color: "white",
                    fontSize: "0.7rem",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    cursor: "pointer",
                  }}
                >
                  🔄 重製點數
                </button>
              )}
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
              <div className="ca-realm-level">
                修練總層數 {totalClickLevels}
              </div>
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
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div
              className="ca-realm-card"
              style={{
                background: "linear-gradient(135deg, #7c3aed 0%, #c084fc 100%)",
              }}
            >
              <div className="ca-realm-title">飛昇商店 (Permanent)</div>
              <div className="ca-realm-name" style={{ color: "#fff" }}>
                永恆加成
              </div>
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "rgba(255,255,255,0.7)",
                  marginTop: "4px",
                }}
              >
                飛昇後不會重置的永久強化
              </div>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {renderDynamicUpgrades("ASCENSION")}
            </div>
          </div>
        )}

        {/* === EQUIPMENT GACHA SHOP TAB === */}
        {activeTab === "EQUIPMENT" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              alignItems: "center",
            }}
          >
            <div
              className="ca-realm-card"
              style={{
                background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                position: "relative",
              }}
            >
              <div className="ca-realm-title">裝備扭蛋 (Gacha)</div>
              <div
                className="ca-realm-name"
                style={{ color: "#fff", fontSize: "1.2rem" }}
              >
                試試你的手氣！
              </div>

              {/* Gacha Currency Toggle Tabs */}
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  background: "rgba(0,0,0,0.3)",
                  padding: "4px",
                  borderRadius: "8px",
                  marginBottom: "8px",
                }}
              >
                <button
                  onClick={() => setGachaCurrency("DIAMOND")}
                  style={{
                    flex: 1,
                    padding: "8px 16px",
                    borderRadius: "6px",
                    background:
                      gachaCurrency === "DIAMOND"
                        ? "linear-gradient(135deg, #3b82f6, #2563eb)" // Blue
                        : "transparent",
                    color: gachaCurrency === "DIAMOND" ? "#fff" : "#94a3b8",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: "bold",
                    transition: "all 0.2s",
                  }}
                >
                  💎 鑽石抽取
                </button>
                <button
                  onClick={() => setGachaCurrency("AP")}
                  style={{
                    flex: 1,
                    padding: "8px 16px",
                    borderRadius: "6px",
                    background:
                      gachaCurrency === "AP"
                        ? "linear-gradient(135deg, #f59e0b, #d97706)" // Amber
                        : "transparent",
                    color: gachaCurrency === "AP" ? "#fff" : "#94a3b8",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: "bold",
                    transition: "all 0.2s",
                  }}
                >
                  🕊️ 飛昇點數抽取
                </button>
              </div>
            </div>

            <div className="ca-shop-item-grid" style={{ width: "100%" }}>
              {/* --- Basic Box --- */}
              <div
                className="ca-glass-static"
                style={{
                  gridColumn: "1 / -1",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "16px",
                  textAlign: "center",
                  position: "relative",
                  border: "1px solid #94a3b8",
                }}
              >
                <button
                  onClick={() => setActiveProbBox("basic")}
                  style={{
                    position: "absolute",
                    top: "12px",
                    right: "12px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.3)",
                    color: "white",
                    fontSize: "0.7rem",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    cursor: "pointer",
                    zIndex: 10,
                  }}
                >
                  裝備機率一覽
                </button>
                <div style={{ fontSize: "4rem" }}>📦</div>
                <div>
                  <div
                    style={{
                      fontSize: "1.2rem",
                      fontWeight: "bold",
                      color: "#fff",
                    }}
                  >
                    基礎裝備箱
                  </div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--ca-text-muted)",
                    }}
                  >
                    隨機獲得裝備 (最高至 Epic)
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                    含: Common, Uncommon, Rare, Epic
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    width: "100%",
                    justifyContent: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <GachaButton
                    label="1 抽"
                    cost={formatNumber(gachaCosts.basic)}
                    currencyLabel={gachaSymbol}
                    color="#4ade80"
                    onClick={() => onPurchase(`gacha_basic_${gachaSuffix}_1`)}
                  />
                  <GachaButton
                    label="10 抽"
                    cost={formatNumber(gachaCosts.basic * 10)}
                    currencyLabel={gachaSymbol}
                    color="#4ade80"
                    onClick={() => onPurchase(`gacha_basic_${gachaSuffix}_10`)}
                  />
                  <GachaButton
                    label="100 抽"
                    cost={formatNumber(gachaCosts.basic * 100)}
                    currencyLabel={gachaSymbol}
                    color="#4ade80"
                    onClick={() => onPurchase(`gacha_basic_${gachaSuffix}_100`)}
                  />
                </div>
                <div style={{ marginTop: "10px", width: "100%" }}>
                  <AutoGachaButton
                    isActive={autoGachaBox === `basic_${gachaSuffix}`}
                    onToggle={() =>
                      onToggleAutoGacha &&
                      onToggleAutoGacha(
                        autoGachaBox === `basic_${gachaSuffix}`
                          ? null
                          : `basic_${gachaSuffix}`
                      )
                    }
                  />
                </div>
              </div>

              {/* --- Advanced Box --- */}
              <div
                className="ca-glass-static"
                style={{
                  gridColumn: "1 / -1",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "16px",
                  textAlign: "center",
                  position: "relative",
                  border: "1px solid #eab308", // Yellow/Gold
                  background: "rgba(234, 179, 8, 0.05)",
                }}
              >
                <button
                  onClick={() => setActiveProbBox("advanced")}
                  style={{
                    position: "absolute",
                    top: "12px",
                    right: "12px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.3)",
                    color: "white",
                    fontSize: "0.7rem",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    cursor: "pointer",
                    zIndex: 10,
                  }}
                >
                  裝備機率一覽
                </button>
                <div style={{ fontSize: "4rem" }}>🎁</div>
                <div>
                  <div
                    style={{
                      fontSize: "1.2rem",
                      fontWeight: "bold",
                      color: "#facc15",
                    }}
                  >
                    高級裝備箱
                  </div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--ca-text-muted)",
                    }}
                  >
                    更高機率獲得稀有裝備 (最高至 Legendary)
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#fef08a" }}>
                    含: Common ~ Legendary
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    width: "100%",
                    justifyContent: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <GachaButton
                    label="1 抽"
                    cost={formatNumber(gachaCosts.adv)}
                    currencyLabel={gachaSymbol}
                    color="#facc15"
                    onClick={() => onPurchase(`gacha_adv_${gachaSuffix}_1`)}
                  />
                  <GachaButton
                    label="10 抽"
                    cost={formatNumber(gachaCosts.adv * 10)}
                    currencyLabel={gachaSymbol}
                    color="#facc15"
                    onClick={() => onPurchase(`gacha_adv_${gachaSuffix}_10`)}
                  />
                  <GachaButton
                    label="100 抽"
                    cost={formatNumber(gachaCosts.adv * 100)}
                    currencyLabel={gachaSymbol}
                    color="#facc15"
                    onClick={() => onPurchase(`gacha_adv_${gachaSuffix}_100`)}
                  />
                </div>
                <div style={{ marginTop: "10px", width: "100%" }}>
                  <AutoGachaButton
                    isActive={autoGachaBox === `adv_${gachaSuffix}`}
                    onToggle={() =>
                      onToggleAutoGacha &&
                      onToggleAutoGacha(
                        autoGachaBox === `adv_${gachaSuffix}`
                          ? null
                          : `adv_${gachaSuffix}`
                      )
                    }
                  />
                </div>
              </div>

              {/* --- Premium Box --- */}
              <div
                className="ca-glass-static"
                style={{
                  gridColumn: "1 / -1",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "16px",
                  textAlign: "center",
                  position: "relative",
                  border: "1px solid #a855f7", // Purple/Mythic
                  background: "rgba(168, 85, 247, 0.05)",
                }}
              >
                <button
                  onClick={() => setActiveProbBox("premium")}
                  style={{
                    position: "absolute",
                    top: "12px",
                    right: "12px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.3)",
                    color: "white",
                    fontSize: "0.7rem",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    cursor: "pointer",
                    zIndex: 10,
                  }}
                >
                  裝備機率一覽
                </button>
                <div style={{ fontSize: "4rem" }}>💎</div>
                <div>
                  <div
                    style={{
                      fontSize: "1.2rem",
                      fontWeight: "bold",
                      color: "#d8b4fe",
                    }}
                  >
                    豪華裝備箱
                  </div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--ca-text-muted)",
                    }}
                  >
                    最高機率獲得稀有裝備 (最高至 Mythic)
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#e9d5ff" }}>
                    含: Common ~ Mythic (包含所有稀有度)
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    width: "100%",
                    justifyContent: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <GachaButton
                    label="1 抽"
                    cost={formatNumber(gachaCosts.prem)}
                    currencyLabel={gachaSymbol}
                    color="#d8b4fe"
                    onClick={() => onPurchase(`gacha_prem_${gachaSuffix}_1`)}
                  />
                  <GachaButton
                    label="10 抽"
                    cost={formatNumber(gachaCosts.prem * 10)}
                    currencyLabel={gachaSymbol}
                    color="#d8b4fe"
                    onClick={() => onPurchase(`gacha_prem_${gachaSuffix}_10`)}
                  />
                  <GachaButton
                    label="100 抽"
                    cost={formatNumber(gachaCosts.prem * 100)}
                    currencyLabel={gachaSymbol}
                    color="#d8b4fe"
                    onClick={() => onPurchase(`gacha_prem_${gachaSuffix}_100`)}
                  />
                </div>
                <div style={{ marginTop: "10px", width: "100%" }}>
                  <AutoGachaButton
                    isActive={autoGachaBox === `prem_${gachaSuffix}`}
                    onToggle={() =>
                      onToggleAutoGacha &&
                      onToggleAutoGacha(
                        autoGachaBox === `prem_${gachaSuffix}`
                          ? null
                          : `prem_${gachaSuffix}`
                      )
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Probability Modal Overlay */}
      {activeProbBox && (
        <ProbabilityModal
          gameConfig={gameConfig}
          onClose={() => setActiveProbBox(null)}
          boxType={activeProbBox}
        />
      )}
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
      className="ca-glass-static ca-shop-item-card"
      style={{
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        cursor: "pointer",
        transition: "all 0.2s ease",
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
  isMaxed,
  showBulkUpgrade,
  cost25,
  canAfford25,
  onBulkUpgrade,
  nextMilestone1,
  nextMilestone25,
}: {
  name: string;
  desc: string;
  level: number;
  cost: number;
  canAfford: boolean;
  onClick: () => void;
  currencyLabel?: string;
  isMaxed?: boolean;
  showBulkUpgrade?: boolean;
  cost25?: number;
  canAfford25?: boolean;
  onBulkUpgrade?: () => void;
  nextMilestone1?: number;
  nextMilestone25?: number;
}) {
  return (
    <div className="ca-upgrade-row">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          flex: 1,
          minWidth: 0,
        }}
      >
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
      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
        {/* 升級按鈕 */}
        <button
          onClick={() => !isMaxed && canAfford && onClick()}
          disabled={isMaxed || !canAfford}
          className="ca-upgrade-btn"
          style={{
            opacity: isMaxed || !canAfford ? 0.5 : 1,
            cursor: isMaxed || !canAfford ? "not-allowed" : "pointer",
            minWidth: showBulkUpgrade ? "70px" : "90px",
            padding: "6px 8px",
            background:
              nextMilestone1 && nextMilestone1 > 1
                ? "linear-gradient(135deg, #ec4899, #be185d)"
                : undefined,
          }}
        >
          <span style={{ fontSize: "0.65rem", fontWeight: "bold" }}>
            {isMaxed
              ? "已滿級"
              : nextMilestone1 && nextMilestone1 > 1
                ? `🔥 升級`
                : "升級"}
          </span>
          {!isMaxed && (
            <span style={{ fontSize: "0.6rem" }}>
              {currencyLabel} {formatNumber(cost)}
            </span>
          )}
          {(nextMilestone1 || 0) > 1 && !isMaxed && (
            <span style={{ fontSize: "0.5rem", color: "#fbbf24" }}>
              x{nextMilestone1} 倍率
            </span>
          )}
        </button>

        {/* 升25級按鈕 - 只在 GOLD 商店顯示 */}
        {showBulkUpgrade && !isMaxed && (
          <button
            onClick={() => canAfford25 && onBulkUpgrade && onBulkUpgrade()}
            disabled={!canAfford25}
            className="ca-upgrade-btn"
            style={{
              opacity: !canAfford25 ? 0.5 : 1,
              cursor: !canAfford25 ? "not-allowed" : "pointer",
              minWidth: "85px",
              padding: "6px 8px",
              background:
                nextMilestone25 && nextMilestone25 > 1
                  ? "linear-gradient(135deg, #ec4899, #be185d)"
                  : canAfford25
                    ? "linear-gradient(135deg, #f59e0b, #d97706)"
                    : "rgba(255,255,255,0.1)",
            }}
          >
            <span style={{ fontSize: "0.65rem", fontWeight: "bold" }}>
              {nextMilestone25 && nextMilestone25 > 1 ? "🔥 +25級" : "+25級"}
            </span>
            <span style={{ fontSize: "0.55rem" }}>
              {currencyLabel} {formatNumber(cost25 || 0)}
            </span>
            {(nextMilestone25 || 0) > 1 && (
              <span style={{ fontSize: "0.5rem", color: "#fbbf24" }}>
                x{(nextMilestone25 || 0).toFixed(1)} 倍率
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// Internal Component for Probability Modal
function parseDescription(template: string, config: any, level: number = 1) {
  const val =
    (Number(config.Base_Val) || 0) +
    (level - 1) * (Number(config.Level_Mult) || 0);
  return template.replace("{val}", formatNumber(val));
}

function ProbabilityModal({
  gameConfig,
  onClose,
  boxType,
}: {
  gameConfig: GameStaticData | null | undefined;
  onClose: () => void;
  boxType: string | null;
}) {
  const [selectedItem, setSelectedItem] = React.useState<any>(null);
  const hasData =
    gameConfig && gameConfig.equipments && gameConfig.equipments.length > 0;

  // Filter equipments based on boxType
  const equipments = React.useMemo(() => {
    if (!hasData) return [];
    const all = gameConfig!.equipments;

    return all.filter((e) => {
      const r = (e.Rarity || "COMMON").toUpperCase();
      if (boxType === "basic" || boxType === "gacha_equipment_basic") {
        // Basic: Up to Epic
        return r !== "LEGENDARY" && r !== "MYTHIC";
      }
      if (boxType === "advanced" || boxType === "gacha_equipment_advanced") {
        // Advanced: Up to Legendary
        return r !== "MYTHIC";
      }
      if (boxType === "premium" || boxType === "gacha_equipment_premium") {
        // Premium: Up to Mythic
        return true;
      }
      // Premium (or default) includes all
      return true;
    });
  }, [hasData, gameConfig, boxType]);

  // Calculate total weight
  const totalWeight = equipments.reduce(
    (sum, eq) => sum + (Number(eq.Gacha_Weight) || 0),
    0
  );

  // Group by weight
  const groups: Record<number, typeof equipments> = {};
  if (totalWeight > 0) {
    equipments.forEach((eq) => {
      const weight = Number(eq.Gacha_Weight) || 0;
      if (!groups[weight]) groups[weight] = [];
      groups[weight].push(eq);
    });
  }

  // Helper for rarity colors
  const getRarityColor = (rarity: string) => {
    switch (rarity?.toLowerCase()) {
      case "common":
        return "#94a3b8"; // gray
      case "uncommon":
        return "#22c55e"; // green
      case "rare":
        return "#3b82f6"; // blue
      case "epic":
        return "#a855f7"; // purple
      case "legendary":
        return "#ef4444"; // red
      case "mythic":
        return "#f59e0b"; // orange
      default:
        return "#fff";
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.8)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        className="ca-card"
        style={{
          width: "100%",
          maxWidth: "500px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: "16px",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{ fontWeight: "bold", fontSize: "1.1rem", color: "white" }}
          >
            {boxType === "basic"
              ? "基礎"
              : boxType === "advanced"
                ? "高級"
                : "豪華"}
            裝備機率一覽
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "gray",
              fontSize: "1.5rem",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "16px", overflowY: "auto", flex: 1 }}>
          {!hasData ? (
            <div
              style={{
                textAlign: "center",
                color: "var(--ca-text-muted)",
                padding: "20px",
              }}
            >
              暫無裝備資料
              <br />
              <span style={{ fontSize: "0.8rem" }}>
                請檢查 Google Sheet 設定或重新載入
              </span>
            </div>
          ) : (
            Object.entries(groups)
              .sort((a, b) => Number(b[0]) - Number(a[0])) // Sort by weight desc
              .map(([weight, items]) => {
                const prob = ((Number(weight) / totalWeight) * 100).toFixed(2);
                return (
                  <div key={weight} style={{ marginBottom: "20px" }}>
                    <div
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        marginBottom: "12px",
                        fontSize: "0.9rem",
                        color: "#93c5fd",
                        fontWeight: "bold",
                      }}
                    >
                      機率: {prob}% (權重: {weight}, 共 {items.length} 種)
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(64px, 1fr))",
                        gap: "12px",
                      }}
                    >
                      {items.map((item) => {
                        const rarityColor = getRarityColor(item.Rarity);
                        return (
                          <div
                            key={item.ID}
                            onClick={() => setSelectedItem(item)}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: "4px",
                              cursor: "pointer",
                              transition: "transform 0.1s",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.transform = "scale(1.05)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.transform = "scale(1)")
                            }
                          >
                            <div
                              style={{
                                width: "56px",
                                height: "56px",
                                background: "rgba(0,0,0,0.3)",
                                borderRadius: "8px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "1.8rem",
                                border: `1px solid ${rarityColor}44`,
                                boxShadow: `inset 0 0 10px ${rarityColor}22`,
                              }}
                            >
                              {getIconFromSlot(item.Slot)}
                            </div>
                            <div
                              style={{
                                fontSize: "0.65rem",
                                color: rarityColor,
                                textAlign: "center",
                                lineHeight: "1.2",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                width: "100%",
                                fontWeight:
                                  item.Rarity?.toLowerCase() === "common"
                                    ? "normal"
                                    : "bold",
                              }}
                            >
                              {item.Name}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>

      {selectedItem && (
        <EquipmentDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}

/**
 * Detailed view for an equipment item in the shop
 */
function getEstimatedCP(config: any, level: number) {
  const val =
    (Number(config.Base_Val) || 0) +
    (level - 1) * (Number(config.Level_Mult) || 0);
  const effectType = String(config.Effect_Type || "").trim();

  // Base Dmg * 10
  if (effectType === UpgradeEffectType.ADD_BASE_DMG) {
    return Math.floor(val * 10);
  }
  // Auto Dmg * 20
  if (effectType === UpgradeEffectType.ADD_AUTO_DMG) {
    return Math.floor(val * 20);
  }
  // Crit% * 10 (1% = 10 CP)
  if (effectType === UpgradeEffectType.ADD_CRIT_CHANCE) {
    return Math.floor(val * 10);
  }
  // CritDmg% * 5 (1% = 5 CP)
  if (effectType === UpgradeEffectType.ADD_CRIT_DMG) {
    return Math.floor(val * 5);
  }
  // Gold/XP multipliers * 2
  if (
    effectType === UpgradeEffectType.ADD_GOLD ||
    effectType === UpgradeEffectType.ADD_GOLD_MULT ||
    effectType === UpgradeEffectType.ADD_XP_MULT
  ) {
    return Math.floor(val * 2);
  }
  // Boss Dmg * 8
  if (effectType === UpgradeEffectType.ADD_BOSS_DMG) {
    return Math.floor(val * 8);
  }

  return 0;
}

function EquipmentDetailModal({
  item,
  onClose,
}: {
  item: any;
  onClose: () => void;
}) {
  const getRarityColor = (rarity: string) => {
    switch (rarity?.toLowerCase()) {
      case "common":
        return "#94a3b8";
      case "uncommon":
        return "#22c55e";
      case "rare":
        return "#3b82f6";
      case "epic":
        return "#a855f7";
      case "legendary":
        return "#ef4444";
      case "mythic":
        return "#f59e0b";
      default:
        return "#fff";
    }
  };

  const rarityColor = getRarityColor(item.Rarity);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 10001,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        className="ca-card"
        style={{
          width: "100%",
          maxWidth: "320px",
          background: "#1e293b",
          border: `1px solid ${rarityColor}66`,
          borderRadius: "16px",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: `0 0 30px ${rarityColor}22`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <div
            style={{
              width: "80px",
              height: "80px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "3rem",
              border: `1px solid ${rarityColor}44`,
            }}
          >
            {getIconFromSlot(item.Slot)}
          </div>
          <div
            style={{
              fontSize: "1.2rem",
              fontWeight: "bold",
              color: rarityColor,
            }}
          >
            {item.Name}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span
              style={{
                fontSize: "0.8rem",
                color: rarityColor,
                fontWeight: "bold",
              }}
            >
              {item.Rarity}
            </span>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
              {item.Slot}
            </span>
          </div>
        </div>

        <div
          style={{
            background: "rgba(0,0,0,0.2)",
            padding: "12px",
            borderRadius: "8px",
            fontSize: "0.9rem",
            color: "#cbd5e1",
          }}
        >
          <div
            style={{
              color: "#94a3b8",
              marginBottom: "4px",
              fontSize: "0.8rem",
            }}
          >
            裝備初始屬性:
          </div>
          <div>{parseDescription(item.Desc_Template, item, 1)}</div>
          <div
            style={{
              marginTop: "8px",
              paddingTop: "8px",
              borderTop: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
              單件提升戰力 (Est. CP)
            </span>
            <span
              style={{
                fontSize: "0.9rem",
                color: "#fbbf24",
                fontWeight: "bold",
              }}
            >
              +{formatNumber(getEstimatedCP(item, 1))}
            </span>
          </div>
        </div>

        <button
          className="ca-btn"
          onClick={onClose}
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#fff",
          }}
        >
          返回
        </button>
      </div>
    </div>
  );
}

function getIconFromSlot(s: string) {
  switch (s) {
    case "MAIN_HAND":
      return "⚔️";
    case "HEAD":
      return "🪖";
    case "BODY":
      return "👕";
    case "HANDS":
      return "🧤";
    case "LEGS":
      return "👢";
    case "RELIC":
      return "🔮";
    default:
      return "📦";
  }
}

function GachaButton({
  label,
  cost,
  onClick,
  color = "#22d3ee",
  currencyLabel = "💰",
}: {
  label: string;
  cost: string;
  onClick: () => void;
  color?: string;
  currencyLabel?: string;
}) {
  return (
    <button
      className="ca-btn ca-btn-primary"
      style={{
        padding: "12px 16px",
        fontSize: "1rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        flex: 1,
        borderColor: color,
        background: `linear-gradient(to bottom, rgba(0,0,0,0) 0%, ${color}22 100%)`,
      }}
      onClick={onClick}
    >
      <span>{label}</span>
      <span
        style={{
          background: "rgba(0,0,0,0.2)",
          padding: "2px 8px",
          borderRadius: "12px",
          fontSize: "0.8rem",
          color: color,
        }}
      >
        {currencyLabel} {cost}
      </span>
    </button>
  );
}

function AutoGachaButton({
  isActive,
  onToggle,
}: {
  isActive: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`ca-btn ${isActive ? "" : "ca-btn-primary"}`}
      style={{
        padding: "8px 16px",
        fontSize: "0.9rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        width: "100%",
        background: isActive
          ? "linear-gradient(to bottom, #ef4444, #991b1b)"
          : "rgba(255, 255, 255, 0.1)",
        color: isActive ? "#fff" : "#cbd5e1",
        border: isActive
          ? "1px solid #f87171"
          : "1px solid rgba(255, 255, 255, 0.2)",
      }}
    >
      <span>{isActive ? "⏹️" : "🔄"}</span>
      <span>{isActive ? "停止自動抽取" : "自動抽取 (固定100連)"}</span>
    </button>
  );
}
