/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import {
  PlayerState,
  GameConfig,
  AccessorySlot,
  // PlayerAttributes,
  AccessoryItemConfig,
  UpgradeEffectType,
} from "../types";
import { formatBigNumber } from "../utils/formatNumber";
import "../styles/clickAscension.css";

interface CraftViewProps {
  player: PlayerState;
  // effectiveStats: PlayerAttributes;
  gameConfig: GameConfig | null;
  onCraft: (accessoryId: string) => void;
  onUpgrade: (accessoryId: string) => void;
  onEquip: (accessoryId: string, slot: AccessorySlot) => void;
  onUnequip: (slot: AccessorySlot) => void;
}

// 飾品部位對應的名稱（圖示從表格資料動態獲取）
const SLOT_NAMES: Record<AccessorySlot, string> = {
  [AccessorySlot.CRAFT_WING]: "飛羽",
  [AccessorySlot.CRAFT_TOME]: "心法",
  [AccessorySlot.CRAFT_TALISMAN]: "破魔符",
  [AccessorySlot.CRAFT_DECREE]: "誅仙令",
  [AccessorySlot.CRAFT_JADE]: "玉佩",
  [AccessorySlot.CRAFT_TREASURE]: "聚寶盆",
};

// 預設圖示（當表格沒有資料時使用）
const DEFAULT_SLOT_ICONS: Record<AccessorySlot, string> = {
  [AccessorySlot.CRAFT_WING]: "🪶",
  [AccessorySlot.CRAFT_TOME]: "📖",
  [AccessorySlot.CRAFT_TALISMAN]: "📿",
  [AccessorySlot.CRAFT_DECREE]: "�",
  [AccessorySlot.CRAFT_JADE]: "💎",
  [AccessorySlot.CRAFT_TREASURE]: "🏺",
};

// 稀有度顏色
function getRarityColor(rarity: string) {
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
      return "#94a3b8";
  }
}

// 解析描述模板
function parseDescription(
  template: string,
  config: AccessoryItemConfig,
  level: number
) {
  const val =
    (Number(config.Base_Val) || 0) +
    (level - 1) * (Number(config.Level_Mult) || 0);
  return template.replace("{val}", formatBigNumber(val, 2, 1000));
}

// 計算升級費用
function getUpgradeCost(config: AccessoryItemConfig, level: number): number {
  const baseCost = Number(config.Upgrade_Cost_Base) || 100;
  const mult = Number(config.Upgrade_Cost_Mult) || 1.15;
  return Math.floor(baseCost * Math.pow(mult, level - 1));
}

// 效果類型顯示名稱
function getEffectName(effectType: string): string {
  const names: Record<string, string> = {
    [UpgradeEffectType.ADD_AP_MULT]: "飛昇點數",
    [UpgradeEffectType.ADD_XP_MULT]: "經驗值",
    [UpgradeEffectType.REDUCE_MONSTER_HP]: "小怪血量減少",
    [UpgradeEffectType.REDUCE_BOSS_HP]: "BOSS血量減少",
    [UpgradeEffectType.ACC_DMG_MULT]: "飾品攻擊力",
    [UpgradeEffectType.ADD_DIAMOND_MULT]: "鑽石掉落",
  };
  return names[effectType] || effectType;
}

// 飾品詳情彈窗
function AccessoryDetailModal({
  accessory,
  onClose,
  onCraft,
  onUpgrade,
  onEquip,
  onUnequip,
  isOwned,
  isEquipped,
  currentLevel,
  equipmentShards,
}: {
  accessory: AccessoryItemConfig;
  onClose: () => void;
  onCraft: (id: string) => void;
  onUpgrade: (id: string) => void;
  onEquip: (id: string, slot: AccessorySlot) => void;
  onUnequip: (slot: AccessorySlot) => void;
  isOwned: boolean;
  isEquipped: boolean;
  currentLevel: number;
  equipmentShards: number;
}) {
  const rarityColor = getRarityColor(accessory.Rarity);
  const slotName = SLOT_NAMES[accessory.Slot as AccessorySlot] || "未知";
  const defaultIcon =
    DEFAULT_SLOT_ICONS[accessory.Slot as AccessorySlot] || "❓";
  const craftCost = Number(accessory.Craft_Cost) || 100;
  const upgradeCost = getUpgradeCost(accessory, currentLevel);
  const isMaxLevel = currentLevel >= (accessory.Max_Level || 99);
  const canCraft = !isOwned && equipmentShards >= craftCost;
  const canUpgrade = isOwned && !isMaxLevel && equipmentShards >= upgradeCost;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        className="ca-card"
        style={{
          width: "100%",
          maxWidth: "340px",
          background: "#1e293b",
          border: `1px solid ${rarityColor}66`,
          borderRadius: "16px",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: `0 0 40px ${rarityColor}33`,
        }}
      >
        {/* 標題區 */}
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
              background: `linear-gradient(135deg, ${rarityColor}22, rgba(0,0,0,0.3))`,
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "3rem",
              border: `2px solid ${rarityColor}66`,
            }}
          >
            {accessory.Emoji || defaultIcon}
          </div>
          <div
            style={{
              fontSize: "1.2rem",
              fontWeight: "bold",
              color: rarityColor,
            }}
          >
            {accessory.Name}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span
              style={{
                fontSize: "0.8rem",
                color: rarityColor,
                fontWeight: "bold",
              }}
            >
              {accessory.Rarity}
            </span>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
              {accessory.Emoji || defaultIcon} {slotName}
            </span>
          </div>
        </div>

        {/* 屬性區 */}
        <div
          style={{
            background: "rgba(0,0,0,0.2)",
            padding: "12px",
            borderRadius: "8px",
            fontSize: "0.9rem",
            color: "#cbd5e1",
          }}
        >
          {isOwned ? (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "#94a3b8",
                  marginBottom: "4px",
                  fontSize: "0.8rem",
                }}
              >
                <span>
                  當前屬性 (Lv.{currentLevel}/{accessory.Max_Level || "??"}):
                </span>
                {isMaxLevel && (
                  <span
                    style={{
                      color: "var(--ca-accent-gold)",
                      fontWeight: "bold",
                    }}
                  >
                    MAX
                  </span>
                )}
              </div>
              <div style={{ color: "#22c55e", fontWeight: "bold" }}>
                {getEffectName(accessory.Effect_Type)}:{" "}
                {parseDescription(
                  accessory.Desc_Template,
                  accessory,
                  currentLevel
                )}
              </div>
              {!isMaxLevel && (
                <div
                  style={{
                    marginTop: "8px",
                    paddingTop: "8px",
                    borderTop: "1px solid rgba(255,255,255,0.1)",
                    color: "#94a3b8",
                    fontSize: "0.8rem",
                  }}
                >
                  下一級:{" "}
                  <span style={{ color: "#60a5fa" }}>
                    {parseDescription(
                      accessory.Desc_Template,
                      accessory,
                      currentLevel + 1
                    )}
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              <div
                style={{
                  color: "#94a3b8",
                  marginBottom: "4px",
                  fontSize: "0.8rem",
                }}
              >
                打造後獲得 (Lv.1):
              </div>
              <div style={{ color: "#60a5fa" }}>
                {getEffectName(accessory.Effect_Type)}:{" "}
                {parseDescription(accessory.Desc_Template, accessory, 1)}
              </div>
            </>
          )}
        </div>

        {/* 費用顯示 */}
        <div
          style={{
            background: "rgba(0,0,0,0.3)",
            padding: "10px",
            borderRadius: "8px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
            {isOwned ? "升級費用" : "打造費用"}:
          </span>
          <span
            style={{
              color:
                equipmentShards >= (isOwned ? upgradeCost : craftCost)
                  ? "#22c55e"
                  : "#ef4444",
              fontWeight: "bold",
            }}
          >
            🧩 {formatBigNumber(isOwned ? upgradeCost : craftCost, 2, 1000)} /{" "}
            {formatBigNumber(equipmentShards, 2, 1000)}
          </span>
        </div>

        {/* 按鈕區 */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            marginTop: "8px",
          }}
        >
          {!isOwned ? (
            <button
              className="ca-btn"
              onClick={() => {
                onCraft(accessory.ID);
                onClose();
              }}
              disabled={!canCraft}
              style={{
                flex: 1,
                background: canCraft ? "var(--ca-accent-gold)" : "#4b5563",
                color: canCraft ? "black" : "#9ca3af",
                fontWeight: "bold",
                cursor: canCraft ? "pointer" : "not-allowed",
              }}
            >
              🔨 打造
            </button>
          ) : (
            <>
              {!isMaxLevel && (
                <button
                  className="ca-btn"
                  onClick={() => {
                    onUpgrade(accessory.ID);
                  }}
                  disabled={!canUpgrade}
                  style={{
                    flex: 1,
                    background: canUpgrade ? "#3b82f6" : "#4b5563",
                    color: canUpgrade ? "white" : "#9ca3af",
                    fontWeight: "bold",
                    cursor: canUpgrade ? "pointer" : "not-allowed",
                  }}
                >
                  ⬆️ 升級
                </button>
              )}
              {!isEquipped ? (
                <button
                  className="ca-btn"
                  onClick={() => {
                    onEquip(accessory.ID, accessory.Slot as AccessorySlot);
                    onClose();
                  }}
                  style={{
                    flex: 1,
                    background: "var(--ca-accent-gold)",
                    color: "black",
                    fontWeight: "bold",
                  }}
                >
                  裝備
                </button>
              ) : (
                <button
                  className="ca-btn"
                  onClick={() => {
                    onUnequip(accessory.Slot as AccessorySlot);
                    onClose();
                  }}
                  style={{
                    flex: 1,
                    background: "#ef4444",
                    color: "white",
                    fontWeight: "bold",
                  }}
                >
                  卸下
                </button>
              )}
            </>
          )}
          <button
            className="ca-btn"
            onClick={onClose}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CraftView({
  player,
  // effectiveStats,
  gameConfig,
  onCraft,
  onUpgrade,
  onEquip,
  onUnequip,
}: CraftViewProps) {
  const [selectedAccessory, setSelectedAccessory] =
    React.useState<AccessoryItemConfig | null>(null);
  const [activeSlot, setActiveSlot] = React.useState<AccessorySlot>(
    AccessorySlot.CRAFT_WING
  );

  const accessories = React.useMemo(
    () => gameConfig?.accessories || [],
    [gameConfig]
  );
  const equipmentShards = player.wallet.equipmentShards || 0;

  // 按部位分組
  const accessoriesBySlot = React.useMemo(() => {
    const grouped: Record<AccessorySlot, AccessoryItemConfig[]> = {
      [AccessorySlot.CRAFT_WING]: [],
      [AccessorySlot.CRAFT_TOME]: [],
      [AccessorySlot.CRAFT_TALISMAN]: [],
      [AccessorySlot.CRAFT_DECREE]: [],
      [AccessorySlot.CRAFT_JADE]: [],
      [AccessorySlot.CRAFT_TREASURE]: [],
    };
    accessories.forEach((acc: AccessoryItemConfig) => {
      const slot = acc.Slot as AccessorySlot;
      if (grouped[slot]) {
        grouped[slot].push(acc);
      }
    });
    return grouped;
  }, [accessories]);

  const currentSlotAccessories = accessoriesBySlot[activeSlot] || [];

  // 取得當前部位的名稱和圖示（圖示從第一個飾品的 Emoji 取得）
  // const currentSlotName = SLOT_NAMES[activeSlot] || "未知";
  const currentSlotIcon =
    currentSlotAccessories[0]?.Emoji || DEFAULT_SLOT_ICONS[activeSlot] || "❓";

  // 計算飾品總加成預覽
  // 計算飾品總加成預覽（獨立計算，不依賴 effectiveStats）
  const accessoryBonuses = React.useMemo(() => {
    const bonuses = {
      apMultiplier: 0,
      xpMultiplier: 0,
      monsterHpReduction: 0,
      bossHpReduction: 0,
      accDamageMultiplier: 0,
      diamondMultiplier: 0,
    };

    if (!gameConfig?.accessories) return bonuses;

    Object.values(player.accessories.equipped).forEach((equippedId) => {
      if (!equippedId) return;

      const config = gameConfig.accessories.find(
        (a: any) => String(a.ID) === String(equippedId)
      );
      if (!config) return;

      const level = Number(player.accessories.inventory[equippedId] || 1);
      const baseVal = Number(config.Base_Val || 0);
      const multVal = Number(config.Level_Mult || 0);
      const val = baseVal + (level - 1) * multVal;

      const effectType = String(config.Effect_Type || "")
        .toUpperCase()
        .trim();

      // 根據類型累加 (與 effectMapper 邏輯一致)
      if (effectType === UpgradeEffectType.ADD_AP_MULT)
        bonuses.apMultiplier += val / 100;
      if (effectType === UpgradeEffectType.ADD_XP_MULT)
        bonuses.xpMultiplier += val / 100;
      if (effectType === UpgradeEffectType.REDUCE_MONSTER_HP)
        bonuses.monsterHpReduction += val / 100;
      if (effectType === UpgradeEffectType.REDUCE_BOSS_HP)
        bonuses.bossHpReduction += val / 100;
      if (effectType === UpgradeEffectType.ACC_DMG_MULT)
        bonuses.accDamageMultiplier += val; // 整數百分比
      if (effectType === UpgradeEffectType.ADD_DIAMOND_MULT)
        bonuses.diamondMultiplier += val / 100;
    });

    return bonuses;
  }, [player.accessories.equipped, player.accessories.inventory, gameConfig]);

  return (
    <div
      className="ca-craft-view"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "12px",
        overflow: "hidden",
      }}
    >
      {/* 貨幣顯示 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
          padding: "10px 14px",
          background: "rgba(15, 23, 42, 0.6)",
          borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
          🧩 裝備碎片
        </span>
        <span
          style={{
            color: "var(--ca-accent-gold)",
            fontWeight: "bold",
            fontSize: "1.1rem",
          }}
        >
          {formatBigNumber(equipmentShards, 2, 1000)}
        </span>
      </div>

      {/* 飾品加成預覽 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "4px",
          marginBottom: "12px",
        }}
      >
        <div className="ca-stat-pill" style={{ fontSize: "0.7rem" }}>
          <span>
            🌟 飛昇點數 + {(accessoryBonuses.apMultiplier * 100).toFixed(1)}%
          </span>
        </div>
        <div className="ca-stat-pill" style={{ fontSize: "0.7rem" }}>
          <span>
            📚 經驗 + {(accessoryBonuses.xpMultiplier * 100).toFixed(1)}%
          </span>
        </div>
        <div className="ca-stat-pill" style={{ fontSize: "0.7rem" }}>
          <span>
            👾 怪HP - {(accessoryBonuses.monsterHpReduction * 100).toFixed(1)}%
          </span>
        </div>
        <div className="ca-stat-pill" style={{ fontSize: "0.7rem" }}>
          <span>
            👹 BossHP - {(accessoryBonuses.bossHpReduction * 100).toFixed(1)}%
          </span>
        </div>
        <div className="ca-stat-pill" style={{ fontSize: "0.7rem" }}>
          <span>
            ⚔️ 飾品攻擊力 + {accessoryBonuses.accDamageMultiplier.toFixed(1)}%
          </span>
        </div>
        <div className="ca-stat-pill" style={{ fontSize: "0.7rem" }}>
          <span>
            💎 鑽石掉落 +{" "}
            {(accessoryBonuses.diamondMultiplier * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* 部位選擇 Tabs */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          marginBottom: "12px",
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {Object.entries(SLOT_NAMES).map(([slot, name]) => {
          const slotKey = slot as AccessorySlot;
          const isActive = activeSlot === slotKey;
          const equippedId = player.accessories.equipped[slotKey];
          const hasEquipped = !!equippedId;
          // 從該部位的飾品中取得圖示
          const slotAccessories = accessoriesBySlot[slotKey] || [];
          const icon =
            slotAccessories[0]?.Emoji || DEFAULT_SLOT_ICONS[slotKey] || "❓";

          return (
            <button
              key={slot}
              onClick={() => setActiveSlot(slotKey)}
              style={{
                flex: "1 0 auto",
                padding: "8px 12px",
                background: isActive
                  ? "var(--ca-accent-gold)"
                  : "rgba(30, 41, 59, 0.6)",
                color: isActive ? "black" : "#e2e8f0",
                border: hasEquipped
                  ? "2px solid #22c55e"
                  : "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: isActive ? "bold" : "normal",
                fontSize: "0.8rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
              }}
            >
              <span style={{ fontSize: "1.2rem" }}>{icon}</span>
              <span>{name}</span>
            </button>
          );
        })}
      </div>

      {/* 當前裝備顯示 */}
      {player.accessories.equipped[activeSlot] && (
        <div
          style={{
            padding: "10px",
            marginBottom: "8px",
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span
            style={{
              color: "#22c55e",
              fontWeight: "bold",
              fontSize: "0.85rem",
            }}
          >
            已裝備:
          </span>
          {(() => {
            const equippedId = player.accessories.equipped[activeSlot];
            const config = accessories.find(
              (a: any) => String(a.ID) === String(equippedId)
            );
            const level = player.accessories.inventory[equippedId || ""] || 1;
            if (!config) return null;
            return (
              <span
                style={{
                  color: getRarityColor(config.Rarity),
                  fontWeight: "bold",
                }}
              >
                {config.Emoji || currentSlotIcon} {config.Name} Lv.{level}
              </span>
            );
          })()}
        </div>
      )}

      {/* 飾品列表 */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          background: "rgba(15, 23, 42, 0.4)",
          borderRadius: "12px",
          padding: "8px",
        }}
      >
        {currentSlotAccessories.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "#94a3b8",
              padding: "40px 20px",
            }}
          >
            此部位尚無可打造的飾品
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "8px",
            }}
          >
            {currentSlotAccessories.map((acc: AccessoryItemConfig) => {
              const isOwned = (player.accessories.inventory[acc.ID] || 0) > 0;
              const level = player.accessories.inventory[acc.ID] || 0;
              const isEquipped =
                player.accessories.equipped[activeSlot] === acc.ID;
              const rarityColor = getRarityColor(acc.Rarity);

              return (
                <div
                  key={acc.ID}
                  onClick={() => setSelectedAccessory(acc)}
                  style={{
                    padding: "12px",
                    background: isOwned
                      ? "rgba(30, 41, 59, 0.8)"
                      : "rgba(30, 41, 59, 0.4)",
                    border: isEquipped
                      ? "2px solid #22c55e"
                      : `1px solid ${rarityColor}44`,
                    borderRadius: "12px",
                    cursor: "pointer",
                    opacity: isOwned ? 1 : 0.7,
                    transition: "all 0.2s",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "6px",
                    }}
                  >
                    <span style={{ fontSize: "1.5rem" }}>
                      {acc.Emoji || currentSlotIcon}
                    </span>
                    <div>
                      <div
                        style={{
                          color: rarityColor,
                          fontWeight: "bold",
                          fontSize: "0.85rem",
                        }}
                      >
                        {acc.Name}
                      </div>
                      <div
                        style={{
                          color: "#94a3b8",
                          fontSize: "0.7rem",
                        }}
                      >
                        {acc.Rarity}
                      </div>
                    </div>
                  </div>
                  {isOwned ? (
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#22c55e",
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>Lv.{level}</span>
                      {isEquipped && (
                        <span style={{ color: "#22c55e" }}>裝備中</span>
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#94a3b8",
                      }}
                    >
                      🧩{" "}
                      {formatBigNumber(Number(acc.Craft_Cost) || 100, 2, 1000)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 詳情彈窗 */}
      {selectedAccessory && (
        <AccessoryDetailModal
          accessory={selectedAccessory}
          onClose={() => setSelectedAccessory(null)}
          onCraft={onCraft}
          onUpgrade={onUpgrade}
          onEquip={onEquip}
          onUnequip={onUnequip}
          isOwned={
            (player.accessories.inventory[selectedAccessory.ID] || 0) > 0
          }
          isEquipped={
            player.accessories.equipped[
              selectedAccessory.Slot as AccessorySlot
            ] === selectedAccessory.ID
          }
          currentLevel={player.accessories.inventory[selectedAccessory.ID] || 1}
          equipmentShards={equipmentShards}
        />
      )}
    </div>
  );
}
