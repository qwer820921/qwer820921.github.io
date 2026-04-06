import React from "react";
import {
  PlayerState,
  GameConfig,
  EquipmentSlot,
  AccessorySlot,
  PlayerAttributes,
  EquipmentItemConfig,
  AccessoryItemConfig,
  UpgradeEffectType,
} from "../types";
import { formatBigNumber } from "../utils/formatNumber";
// import { applyEffect } from "../utils/effectMapper";
import styles from "../styles/clickAscension.module.css";

const DEFAULT_ACCESSORY_ICONS: Record<AccessorySlot, string> = {
  [AccessorySlot.CRAFT_WING]: "🪶",
  [AccessorySlot.CRAFT_TOME]: "📖",
  [AccessorySlot.CRAFT_TALISMAN]: "📿",
  [AccessorySlot.CRAFT_DECREE]: "📜",
  [AccessorySlot.CRAFT_JADE]: "💎",
  [AccessorySlot.CRAFT_TREASURE]: "🏺",
};

interface CharacterViewProps {
  player: PlayerState;
  effectiveStats: PlayerAttributes;
  userId: string | null;
  gameConfig: GameConfig | null;
  onEquip?: (itemId: string, slot: EquipmentSlot) => void;
  onUnequip?: (slot: EquipmentSlot) => void;
  onEquipAccessory?: (itemId: string, slot: AccessorySlot) => void;
  onUnequipAccessory?: (slot: AccessorySlot) => void;
}

/**
 * Shared Item Detail Modal Component
 */
function parseDescription(
  template: string,
  config: EquipmentItemConfig,
  level: number
) {
  const val =
    (Number(config.Base_Val) || 0) +
    (level - 1) * (Number(config.Level_Mult) || 0);
  return template.replace(/\{val\}/gi, formatBigNumber(val, 2, 1000));
}

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

function getEstimatedCP(config: EquipmentItemConfig, level: number) {
  const val =
    (Number(config.Base_Val) || 0) +
    (level - 1) * (Number(config.Level_Mult) || 0);
  const t = String(config.Effect_Type || "")
    .toUpperCase()
    .trim();

  // Base Dmg * 10
  if (t === UpgradeEffectType.ADD_BASE_DMG) return Math.floor(val * 10);
  // Auto Dmg * 20
  if (t === UpgradeEffectType.ADD_AUTO_DMG) return Math.floor(val * 20);
  // Crit% * 10 (1% = 10 CP)
  if (t === UpgradeEffectType.ADD_CRIT_CHANCE) return Math.floor(val * 10);
  // CritDmg% * 5 (1% = 5 CP)
  if (t === UpgradeEffectType.ADD_CRIT_DMG) return Math.floor(val * 5);

  // Percent Multipliers
  // Equip Dmg % (1% = 15 CP)
  if (t === UpgradeEffectType.EQUIP_DMG_MULT) return Math.floor(val * 15);
  // Atk % (1% = 20 CP)
  if (t === UpgradeEffectType.ADD_ATK_P) return Math.floor(val * 20);
  // Boss Dmg % (1% = 8 CP)
  if (t === UpgradeEffectType.ADD_BOSS_DMG) return Math.floor(val * 8);

  // Resource Multipliers
  // Gold/XP (1% = 5 CP)
  if (t === UpgradeEffectType.ADD_GOLD_MULT || t === UpgradeEffectType.ADD_GOLD)
    return Math.floor(val * 5);
  if (t === UpgradeEffectType.ADD_XP_MULT) return Math.floor(val * 5);
  // AP (1% = 10 CP)
  if (t === UpgradeEffectType.ADD_AP_MULT) return Math.floor(val * 10);

  // Accessory / Special Stats
  if (t === UpgradeEffectType.ACC_DMG_MULT) return Math.floor(val * 15);
  if (t === UpgradeEffectType.REDUCE_MONSTER_HP) return Math.floor(val * 10);
  if (t === UpgradeEffectType.REDUCE_BOSS_HP) return Math.floor(val * 10);
  if (t === UpgradeEffectType.ADD_DIAMOND_MULT) return Math.floor(val * 20);

  return 0;
}

function ItemDetailModal({
  item,
  onClose,
  onEquip,
  onUnequip,
  isEquipped,
}: {
  item: { id: string; level: number; config: EquipmentItemConfig };
  onClose: () => void;
  onEquip: (id: string, slot: EquipmentSlot) => void;
  onUnequip: (slot: EquipmentSlot) => void;
  isEquipped: boolean;
}) {
  const { config, level } = item;
  const rarityColor = getRarityColor(config.Rarity);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.8)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        className={styles["ca-card"]}
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
            {config.Emoji || getIconFromSlot(config.Slot)}
          </div>
          <div
            style={{
              fontSize: "1.2rem",
              fontWeight: "bold",
              color: rarityColor,
            }}
          >
            {config.Name}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span
              style={{
                fontSize: "0.8rem",
                color: rarityColor,
                fontWeight: "bold",
              }}
            >
              {config.Rarity}
            </span>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
              {config.Slot}
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
              display: "flex",
              justifyContent: "space-between",
              color: "#94a3b8",
              marginBottom: "4px",
              fontSize: "0.8rem",
            }}
          >
            <span>
              當前屬性 (Lv.{level}/{config.Max_Level || "??"}):
            </span>
            {level >= (config.Max_Level || 99) && (
              <span
                style={{ color: "var(--ca-accent-gold)", fontWeight: "bold" }}
              >
                MAX
              </span>
            )}
          </div>
          <div>{parseDescription(config.Desc_Template, config, level)}</div>
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
              戰力加成 (Est. CP)
            </span>
            <span
              style={{
                fontSize: "0.9rem",
                color: "#fbbf24",
                fontWeight: "bold",
              }}
            >
              +{formatBigNumber(getEstimatedCP(config, level), 2, 1000)}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            marginTop: "8px",
          }}
        >
          {!isEquipped ? (
            <button
              className={styles["ca-btn"]}
              onClick={() => {
                onEquip(item.id, config.Slot);
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
              className={styles["ca-btn"]}
              onClick={() => {
                onUnequip(config.Slot);
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
          <button
            className={styles["ca-btn"]}
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

/**
 * 飾品詳情彈窗
 */
function AccessoryDetailModal({
  item,
  onClose,
  onEquip,
  onUnequip,
  isEquipped,
}: {
  item: { id: string; level: number; config: AccessoryItemConfig };
  onClose: () => void;
  onEquip?: (itemId: string, slot: AccessorySlot) => void;
  onUnequip?: (slot: AccessorySlot) => void;
  isEquipped: boolean;
}) {
  const rarityColor = getRarityColor(item.config.Rarity);
  const slotName = getAccessorySlotName(item.config.Slot as AccessorySlot);

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
        className={styles["ca-card"]}
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
              width: "70px",
              height: "70px",
              background: `linear-gradient(135deg, ${rarityColor}22, rgba(0,0,0,0.3))`,
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "2.5rem",
              border: `2px solid ${rarityColor}66`,
            }}
          >
            {item.config.Emoji || "💍"}
          </div>
          <div
            style={{
              fontSize: "1.1rem",
              fontWeight: "bold",
              color: rarityColor,
            }}
          >
            {item.config.Name}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span
              style={{
                fontSize: "0.75rem",
                color: rarityColor,
                fontWeight: "bold",
              }}
            >
              {item.config.Rarity}
            </span>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
              {slotName}
            </span>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
            <span style={{ fontSize: "0.75rem", color: "#60a5fa" }}>
              Lv.{item.level}
            </span>
          </div>
        </div>

        {/* 按鈕區 */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginTop: "8px",
          }}
        >
          {!isEquipped ? (
            <button
              className={styles["ca-btn"]}
              onClick={() => {
                onEquip?.(item.id, item.config.Slot as AccessorySlot);
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
              className={styles["ca-btn"]}
              onClick={() => {
                onUnequip?.(item.config.Slot as AccessorySlot);
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
          <button
            className={styles["ca-btn"]}
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

function getAccessorySlotName(slot: AccessorySlot): string {
  switch (slot) {
    case AccessorySlot.CRAFT_WING:
      return "飛羽";
    case AccessorySlot.CRAFT_TOME:
      return "心法";
    case AccessorySlot.CRAFT_TALISMAN:
      return "破魔符";
    case AccessorySlot.CRAFT_DECREE:
      return "誅仙令";
    case AccessorySlot.CRAFT_JADE:
      return "玉佩";
    case AccessorySlot.CRAFT_TREASURE:
      return "聚寶盆";
    default:
      return "飾品";
  }
}

export default function CharacterView({
  player,
  effectiveStats,
  userId,
  gameConfig,
  onEquip,
  onUnequip,
  onEquipAccessory,
  onUnequipAccessory,
}: CharacterViewProps) {
  const [selectedItem, setSelectedItem] = React.useState<{
    id: string;
    level: number;
    config: EquipmentItemConfig;
  } | null>(null);

  const [selectedAccessory, setSelectedAccessory] = React.useState<{
    id: string;
    level: number;
    config: AccessoryItemConfig;
  } | null>(null);

  // 倉庫 Tab 切換狀態
  const [inventoryTab, setInventoryTab] = React.useState<
    "EQUIPMENT" | "ACCESSORY"
  >("EQUIPMENT");

  // 稀有度排序權重（越高越前面）
  const RARITY_ORDER: Record<string, number> = {
    mythic: 6,
    legendary: 5,
    epic: 4,
    rare: 3,
    uncommon: 2,
    common: 1,
  };

  // 部位排序權重
  const SLOT_ORDER: Record<string, number> = {
    MAIN_HAND: 1,
    HEAD: 2,
    BODY: 3,
    HANDS: 4,
    LEGS: 5,
    RELIC: 6,
  };

  const inventoryItems = Object.entries(player.equipment?.inventory || {})
    .filter(([, level]) => level > 0)
    .map(([id, level]) => ({
      id,
      level,
      config: gameConfig?.equipments?.find((e) => String(e.ID) === String(id)),
    }))
    .filter(
      (
        item
      ): item is { id: string; level: number; config: EquipmentItemConfig } =>
        !!item.config
    )
    .sort((a, b) => {
      // 先按稀有度排序（高到低）
      const rarityA = RARITY_ORDER[a.config.Rarity?.toLowerCase()] || 0;
      const rarityB = RARITY_ORDER[b.config.Rarity?.toLowerCase()] || 0;
      if (rarityB !== rarityA) return rarityB - rarityA;

      // 再按部位排序
      const slotA = SLOT_ORDER[a.config.Slot] || 99;
      const slotB = SLOT_ORDER[b.config.Slot] || 99;
      return slotA - slotB;
    });

  // 飾品部位排序權重
  const ACCESSORY_SLOT_ORDER: Record<string, number> = {
    CRAFT_WING: 1,
    CRAFT_TOME: 2,
    CRAFT_TALISMAN: 3,
    CRAFT_DECREE: 4,
    CRAFT_JADE: 5,
    CRAFT_TREASURE: 6,
  };

  // 飾品倉庫資料
  const accessoryItems = Object.entries(player.accessories?.inventory || {})
    .filter(([, level]) => level > 0)
    .map(([id, level]) => ({
      id,
      level,
      config: gameConfig?.accessories?.find(
        (a: AccessoryItemConfig) => String(a.ID) === String(id)
      ),
    }))
    .filter(
      (
        item
      ): item is { id: string; level: number; config: AccessoryItemConfig } =>
        !!item.config
    )
    .sort((a, b) => {
      // 先按稀有度排序（高到低）
      const rarityA = RARITY_ORDER[a.config.Rarity?.toLowerCase()] || 0;
      const rarityB = RARITY_ORDER[b.config.Rarity?.toLowerCase()] || 0;
      if (rarityB !== rarityA) return rarityB - rarityA;

      // 再按部位排序
      const slotA = ACCESSORY_SLOT_ORDER[a.config.Slot] || 99;
      const slotB = ACCESSORY_SLOT_ORDER[b.config.Slot] || 99;
      return slotA - slotB;
    });

  // 計算「只有裝備」帶來的加成
  const equipmentBonuses = React.useMemo(() => {
    const bonuses = {
      baseDamage: 0,
      criticalChance: 0,
      criticalDamage: 0,
      goldMultiplier: 0,
      xpMultiplier: 0,
      autoClickPerSec: 0,
      autoAttackDamage: 0,
      bossDamageMultiplier: 0,
      equipDamageMultiplier: 0,
      atkPercentBonus: 0,
    };

    if (!gameConfig?.equipments) return bonuses;

    Object.values(player.equipment?.equipped || {}).forEach((equippedId) => {
      if (!equippedId) return;
      const config = gameConfig.equipments.find(
        (e: EquipmentItemConfig) => String(e.ID) === String(equippedId)
      );
      if (!config) return;

      const level = Number(player.equipment?.inventory?.[equippedId] || 1);
      const baseVal = Number(config.Base_Val || 0);
      const multVal = Number(config.Level_Mult || 0);
      const val = baseVal + (level - 1) * multVal;

      // Handle both "Effect_Type" and "Effect_Type " (with trailing space)
      const legacyConfig = config as any;
      const rawEffectType = config.Effect_Type || legacyConfig["Effect_Type "];
      const effectType = String(rawEffectType || "")
        .toUpperCase()
        .trim();

      switch (effectType) {
        case UpgradeEffectType.ADD_BASE_DMG:
          bonuses.baseDamage += val;
          break;
        case UpgradeEffectType.ADD_AUTO_DMG:
          bonuses.autoAttackDamage += val;
          break;
        case UpgradeEffectType.ADD_CRIT_CHANCE:
          bonuses.criticalChance += val / 100;
          break;
        case UpgradeEffectType.ADD_CRIT_DMG:
          bonuses.criticalDamage += val / 100;
          break;
        case UpgradeEffectType.ADD_GOLD:
        case UpgradeEffectType.ADD_GOLD_MULT:
          bonuses.goldMultiplier += val / 100;
          break;
        case UpgradeEffectType.ADD_XP_MULT:
          bonuses.xpMultiplier += val / 100;
          break;
        case UpgradeEffectType.AUTO_CLICK_V:
          bonuses.autoClickPerSec += val;
          break;
        case UpgradeEffectType.ADD_BOSS_DMG:
          bonuses.bossDamageMultiplier += val / 100;
          break;
        case UpgradeEffectType.EQUIP_DMG_MULT:
          bonuses.equipDamageMultiplier += val;
          break;
        case UpgradeEffectType.ADD_ATK_P:
          bonuses.atkPercentBonus += val;
          break;
      }
    });

    return bonuses;
  }, [player.equipment?.equipped, player.equipment?.inventory, gameConfig]);

  return (
    <div
      className={styles["ca-character-view"]}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "12px", // Reduced padding
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: "0 0 auto", // Don't enforce 50%, just take what's needed
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          position: "relative",
          paddingBottom: "12px",
        }}
      >
        {/* --- Stats Summary Grid (Pill Style) --- */}
        <div
          style={{
            width: "100%",
            maxWidth: "500px",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "4px",
            marginBottom: "8px", // Reduced margin
            zIndex: 10,
            padding: "0 4px",
          }}
        >
          {/* 1. Equipment Damage Multiplier (武器 MAIN_HAND) */}
          <div className={styles["ca-stat-pill"]}>
            <span className={styles["ca-stat-icon"]}>⚔️</span>
            <span className={styles["ca-stat-value"]}>
              {equipmentBonuses.equipDamageMultiplier.toFixed(0)}%
            </span>
            {equipmentBonuses.equipDamageMultiplier > 0 && (
              <span className={styles["ca-stat-bonus"]}>
                (+{equipmentBonuses.equipDamageMultiplier.toFixed(0)}%)
              </span>
            )}
          </div>

          {/* 2. Critical Chance (頭盔 HEAD) */}
          <div className={styles["ca-stat-pill"]}>
            <span className={styles["ca-stat-icon"]}>🎯</span>
            <span className={styles["ca-stat-value"]}>
              {(effectiveStats.criticalChance * 100).toFixed(1)}%
            </span>
            {equipmentBonuses.criticalChance > 0 && (
              <span className={styles["ca-stat-bonus"]}>
                (+
                {(equipmentBonuses.criticalChance * 100).toFixed(1)}
                %)
              </span>
            )}
          </div>

          {/* 3. Auto Click (護甲 BODY) */}
          <div className={styles["ca-stat-pill"]}>
            <span className={styles["ca-stat-icon"]}>🤖</span>
            <span className={styles["ca-stat-value"]}>
              {Number(effectiveStats.autoClickPerSec || 0).toFixed(1)}/s
            </span>
            {equipmentBonuses.autoClickPerSec > 0 && (
              <span className={styles["ca-stat-bonus"]}>
                (+
                {Number(equipmentBonuses.autoClickPerSec).toFixed(1)})
              </span>
            )}
          </div>

          {/* 4. Critical Damage (手套 HANDS) */}
          <div className={styles["ca-stat-pill"]}>
            <span className={styles["ca-stat-icon"]}>💥</span>
            <span className={styles["ca-stat-value"]}>
              {(effectiveStats.criticalDamage * 100).toFixed(0)}%
            </span>
            {equipmentBonuses.criticalDamage > 0 && (
              <span className={styles["ca-stat-bonus"]}>
                (+
                {(effectiveStats.criticalDamage * 100).toFixed(0)}
                %)
              </span>
            )}
          </div>

          {/* 5. Gold Multiplier (鞋 LEGS) */}
          <div className={styles["ca-stat-pill"]}>
            <span className={styles["ca-stat-icon"]}>💰</span>
            <span className={styles["ca-stat-value"]}>
              {(effectiveStats.goldMultiplier * 100).toFixed(0)}%
            </span>
            {equipmentBonuses.goldMultiplier > 0 && (
              <span className={styles["ca-stat-bonus"]}>
                (+
                {(effectiveStats.goldMultiplier * 100).toFixed(0)}
                %)
              </span>
            )}
          </div>

          {/* 6. Boss Damage (RELIC) */}
          <div className={styles["ca-stat-pill"]}>
            <span className={styles["ca-stat-icon"]}>👹</span>
            <span className={styles["ca-stat-value"]}>
              {(effectiveStats.bossDamageMultiplier * 100).toFixed(0)}%
            </span>
            {equipmentBonuses.bossDamageMultiplier > 0 && (
              <span className={styles["ca-stat-bonus"]}>
                (+
                {(effectiveStats.bossDamageMultiplier * 100).toFixed(0)}
                %)
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "54px 54px 1fr 54px 54px",
            width: "100%",
            maxWidth: "500px",
            alignItems: "center",
            zIndex: 2,
            padding: "0 4px",
            minHeight: "200px",
            margin: "0 auto",
            gap: "6px",
          }}
        >
          {/* Left Equipment Column (Outer) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <EquipmentSlotItem
              slot={EquipmentSlot.MAIN_HAND}
              player={player}
              gameConfig={gameConfig}
              onClick={(id) => {
                const cfg = gameConfig?.equipments?.find(
                  (e) => String(e.ID) === String(id)
                );
                if (cfg)
                  setSelectedItem({
                    id,
                    level: player.equipment.inventory[id],
                    config: cfg,
                  });
              }}
            />
            <EquipmentSlotItem
              slot={EquipmentSlot.HEAD}
              player={player}
              gameConfig={gameConfig}
              onClick={(id) => {
                const cfg = gameConfig?.equipments?.find(
                  (e) => String(e.ID) === String(id)
                );
                if (cfg)
                  setSelectedItem({
                    id,
                    level: player.equipment.inventory[id],
                    config: cfg,
                  });
              }}
            />
            <EquipmentSlotItem
              slot={EquipmentSlot.BODY}
              player={player}
              gameConfig={gameConfig}
              onClick={(id) => {
                const cfg = gameConfig?.equipments?.find(
                  (e) => String(e.ID) === String(id)
                );
                if (cfg)
                  setSelectedItem({
                    id,
                    level: player.equipment.inventory[id],
                    config: cfg,
                  });
              }}
            />
          </div>

          {/* Left Accessory Column (Inner) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AccessorySlotItem
              slot={AccessorySlot.CRAFT_WING}
              player={player}
              gameConfig={gameConfig}
              onClick={(id) => {
                const cfg = gameConfig?.accessories?.find(
                  (a) => String(a.ID) === String(id)
                );
                if (cfg)
                  setSelectedAccessory({
                    id,
                    level: player.accessories.inventory[id],
                    config: cfg,
                  });
              }}
            />
            <AccessorySlotItem
              slot={AccessorySlot.CRAFT_TOME}
              player={player}
              gameConfig={gameConfig}
              onClick={(id) => {
                const cfg = gameConfig?.accessories?.find(
                  (a) => String(a.ID) === String(id)
                );
                if (cfg)
                  setSelectedAccessory({
                    id,
                    level: player.accessories.inventory[id],
                    config: cfg,
                  });
              }}
            />
            <AccessorySlotItem
              slot={AccessorySlot.CRAFT_TALISMAN}
              player={player}
              gameConfig={gameConfig}
              onClick={(id) => {
                const cfg = gameConfig?.accessories?.find(
                  (a) => String(a.ID) === String(id)
                );
                if (cfg)
                  setSelectedAccessory({
                    id,
                    level: player.accessories.inventory[id],
                    config: cfg,
                  });
              }}
            />
          </div>

          {/* Center Character */}
          <div
            className={styles["ca-character-figure"]}
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${userId || "Guest"}`}
              alt="Character"
              style={{
                width: "100px",
                height: "100px",
                filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.5))",
              }}
            />
            <div
              className={styles["ca-glass"]}
              style={{
                marginTop: "4px",
                padding: "2px 10px",
                borderRadius: "20px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(15, 23, 42, 0.6)",
              }}
            >
              <span style={{ fontSize: "0.9rem" }}>
                Lv.{player.system.level}
              </span>
              <span
                style={{
                  width: "1px",
                  height: "10px",
                  background: "rgba(255,255,255,0.2)",
                }}
              />
              <span
                style={{
                  color: "var(--ca-accent-gold)",
                  fontWeight: "bold",
                  fontSize: "0.8rem",
                }}
              >
                {userId || "Guest"}
              </span>
            </div>
          </div>

          {/* Right Accessory Column (Inner) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AccessorySlotItem
              slot={AccessorySlot.CRAFT_DECREE}
              player={player}
              gameConfig={gameConfig}
              onClick={(id) => {
                const cfg = gameConfig?.accessories?.find(
                  (a) => String(a.ID) === String(id)
                );
                if (cfg)
                  setSelectedAccessory({
                    id,
                    level: player.accessories.inventory[id],
                    config: cfg,
                  });
              }}
            />
            <AccessorySlotItem
              slot={AccessorySlot.CRAFT_JADE}
              player={player}
              gameConfig={gameConfig}
              onClick={(id) => {
                const cfg = gameConfig?.accessories?.find(
                  (a) => String(a.ID) === String(id)
                );
                if (cfg)
                  setSelectedAccessory({
                    id,
                    level: player.accessories.inventory[id],
                    config: cfg,
                  });
              }}
            />
            <AccessorySlotItem
              slot={AccessorySlot.CRAFT_TREASURE}
              player={player}
              gameConfig={gameConfig}
              onClick={(id) => {
                const cfg = gameConfig?.accessories?.find(
                  (a) => String(a.ID) === String(id)
                );
                if (cfg)
                  setSelectedAccessory({
                    id,
                    level: player.accessories.inventory[id],
                    config: cfg,
                  });
              }}
            />
          </div>

          {/* Right Equipment Column (Outer) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <EquipmentSlotItem
              slot={EquipmentSlot.HANDS}
              player={player}
              gameConfig={gameConfig}
              onClick={(id) => {
                const cfg = gameConfig?.equipments?.find(
                  (e) => String(e.ID) === String(id)
                );
                if (cfg)
                  setSelectedItem({
                    id,
                    level: player.equipment.inventory[id],
                    config: cfg,
                  });
              }}
            />
            <EquipmentSlotItem
              slot={EquipmentSlot.LEGS}
              player={player}
              gameConfig={gameConfig}
              onClick={(id) => {
                const cfg = gameConfig?.equipments?.find(
                  (e) => String(e.ID) === String(id)
                );
                if (cfg)
                  setSelectedItem({
                    id,
                    level: player.equipment.inventory[id],
                    config: cfg,
                  });
              }}
            />
            <EquipmentSlotItem
              slot={EquipmentSlot.RELIC}
              player={player}
              gameConfig={gameConfig}
              onClick={(id) => {
                const cfg = gameConfig?.equipments?.find(
                  (e) => String(e.ID) === String(id)
                );
                if (cfg)
                  setSelectedItem({
                    id,
                    level: player.equipment.inventory[id],
                    config: cfg,
                  });
              }}
            />
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: "55%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "220px",
            height: "220px",
            background:
              "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      </div>

      <div
        style={{
          flex: "1 1 0px", // Allow it to take remaining space, starting from 0 to force shrink if needed
          width: "100%",
          background: "rgba(15, 23, 42, 0.4)",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minHeight: "0", // Important for flex text-overflow
        }}
      >
        {/* Tab 切換區 */}
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(0,0,0,0.2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setInventoryTab("EQUIPMENT")}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: "none",
                background:
                  inventoryTab === "EQUIPMENT"
                    ? "var(--ca-accent-gold)"
                    : "rgba(255,255,255,0.1)",
                color: inventoryTab === "EQUIPMENT" ? "black" : "#e2e8f0",
                fontWeight: inventoryTab === "EQUIPMENT" ? "bold" : "normal",
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              🎒 裝備 ({inventoryItems.length})
            </button>
            <button
              onClick={() => setInventoryTab("ACCESSORY")}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: "none",
                background:
                  inventoryTab === "ACCESSORY"
                    ? "var(--ca-accent-gold)"
                    : "rgba(255,255,255,0.1)",
                color: inventoryTab === "ACCESSORY" ? "black" : "#e2e8f0",
                fontWeight: inventoryTab === "ACCESSORY" ? "bold" : "normal",
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              💍 飾品 ({accessoryItems.length})
            </button>
          </div>
          <span style={{ fontSize: "0.65rem", color: "var(--ca-text-muted)" }}>
            點擊{inventoryTab === "EQUIPMENT" ? "裝備" : "飾品"}以穿戴
          </span>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {inventoryTab === "EQUIPMENT" ? (
            // 裝備倉庫
            inventoryItems.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "gray",
                  padding: "20px 0",
                  fontSize: "0.8rem",
                }}
              >
                裝備倉庫空空如也...
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))",
                  gap: "8px",
                }}
              >
                {inventoryItems.map((item) => {
                  const isEquipped = Object.values(
                    player.equipment?.equipped || {}
                  ).includes(item.id);
                  const rarityColor = getRarityColor(item.config.Rarity);

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={styles["ca-inventory-item"]}
                      style={{
                        width: "56px",
                        height: "56px",
                        background: "rgba(30, 41, 59, 0.6)",
                        border: `2px solid ${rarityColor}`,
                        borderRadius: "10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        cursor: "pointer",
                        opacity: isEquipped ? 1 : 0.8,
                        boxShadow: isEquipped
                          ? "0 0 10px #22c55e, inset 0 0 5px #22c55e"
                          : "none",
                      }}
                      title={`${item.config.Name} (Lv.${item.level}) - ${item.config.Slot}`}
                    >
                      <span style={{ fontSize: "1.5rem" }}>
                        {item.config.Emoji || getIconFromSlot(item.config.Slot)}
                      </span>
                      <div
                        style={{
                          position: "absolute",
                          bottom: "-4px",
                          right: "-4px",
                          background: "#4f46e5",
                          color: "white",
                          fontSize: "0.55rem",
                          padding: "1px 3px",
                          borderRadius: "4px",
                          fontWeight: "bold",
                        }}
                      >
                        L{item.level}
                      </div>
                      {isEquipped && (
                        <div
                          style={{
                            position: "absolute",
                            top: "-2px",
                            left: "-2px",
                            background: "#22c55e",
                            color: "white",
                            fontSize: "0.55rem",
                            padding: "1px 3px",
                            borderRadius: "3px",
                            fontWeight: "bold",
                            textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                          }}
                        >
                          E
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : // 飾品倉庫
          accessoryItems.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "gray",
                padding: "20px 0",
                fontSize: "0.8rem",
              }}
            >
              飾品倉庫空空如也...
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))",
                gap: "8px",
              }}
            >
              {accessoryItems.map((item) => {
                const isEquipped = Object.values(
                  player.accessories?.equipped || {}
                ).includes(item.id);
                const rarityColor = getRarityColor(item.config.Rarity);

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedAccessory(item)}
                    className={styles["ca-inventory-item"]}
                    style={{
                      width: "56px",
                      height: "56px",
                      background: "rgba(30, 41, 59, 0.6)",
                      border: `2px solid ${rarityColor}`,
                      borderRadius: "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      cursor: "pointer",
                      opacity: isEquipped ? 1 : 0.8,
                      boxShadow: isEquipped
                        ? "0 0 10px #22c55e, inset 0 0 5px #22c55e"
                        : "none",
                    }}
                    title={`${item.config.Name} (Lv.${item.level}) - ${item.config.Slot}`}
                  >
                    <span style={{ fontSize: "1.5rem" }}>
                      {item.config.Emoji || "💍"}
                    </span>
                    <div
                      style={{
                        position: "absolute",
                        bottom: "-4px",
                        right: "-4px",
                        background: "#4f46e5",
                        color: "white",
                        fontSize: "0.55rem",
                        padding: "1px 3px",
                        borderRadius: "4px",
                        fontWeight: "bold",
                      }}
                    >
                      L{item.level}
                    </div>
                    {isEquipped && (
                      <div
                        style={{
                          position: "absolute",
                          top: "-2px",
                          left: "-2px",
                          background: "#22c55e",
                          color: "white",
                          fontSize: "0.55rem",
                          padding: "1px 3px",
                          borderRadius: "3px",
                          fontWeight: "bold",
                          textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                        }}
                      >
                        E
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onEquip={onEquip!}
          onUnequip={onUnequip!}
          isEquipped={Object.values(player.equipment.equipped).includes(
            selectedItem.id
          )}
        />
      )}

      {selectedAccessory && (
        <AccessoryDetailModal
          item={selectedAccessory}
          onClose={() => setSelectedAccessory(null)}
          onEquip={onEquipAccessory}
          onUnequip={onUnequipAccessory}
          isEquipped={Object.values(
            player.accessories?.equipped || {}
          ).includes(selectedAccessory.id)}
        />
      )}
    </div>
  );
}

function getIconFromSlot(s: EquipmentSlot) {
  switch (s) {
    case EquipmentSlot.MAIN_HAND:
      return "⚔️";
    case EquipmentSlot.HEAD:
      return "🪖";
    case EquipmentSlot.BODY:
      return "👕";
    case EquipmentSlot.HANDS:
      return "🧤";
    case EquipmentSlot.LEGS:
      return "👢";
    case EquipmentSlot.RELIC:
      return "🔮";
    default:
      return "📦";
  }
}

function EquipmentSlotItem({
  slot,
  player,
  gameConfig,
  onClick,
}: {
  slot: EquipmentSlot;
  player: PlayerState;
  gameConfig: GameConfig | null;
  onClick?: (itemId: string) => void;
}) {
  const equippedId = player.equipment?.equipped?.[slot];
  const itemConfig = equippedId
    ? gameConfig?.equipments?.find((e) => String(e.ID) === String(equippedId))
    : null;
  const level = equippedId ? player.equipment?.inventory?.[equippedId] || 1 : 0;
  const rarityColor = itemConfig
    ? getRarityColor(itemConfig.Rarity)
    : "rgba(255,255,255,0.1)";

  return (
    <div
      className={styles["ca-equipment-slot"]}
      style={{
        width: "54px", // Reduced from 64px
        height: "54px",
        background: "rgba(15, 23, 42, 0.6)",
        border: itemConfig
          ? `2px solid ${rarityColor}`
          : "1px dashed rgba(255,255,255,0.1)",
        borderRadius: "10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        cursor: "pointer",
        transition: "all 0.2s",
        boxShadow: itemConfig ? `0 0 15px ${rarityColor}44` : "none",
      }}
      onClick={() => equippedId && onClick?.(equippedId)}
      title={itemConfig ? `${itemConfig.Name} (Lv.${level})` : "Empty Slot"}
    >
      <div style={{ fontSize: "1.6rem", opacity: itemConfig ? 1 : 0.3 }}>
        {itemConfig?.Emoji || getIconFromSlot(slot)}
      </div>

      {itemConfig && (
        <div
          style={{
            position: "absolute",
            bottom: "-4px",
            right: "-4px",
            background: "#4f46e5",
            color: "white",
            fontSize: "0.55rem",
            padding: "1px 3px",
            borderRadius: "6px",
            fontWeight: "bold",
            border: "1px solid rgba(255,255,255,0.2)",
          }}
        >
          Lv.{level}
        </div>
      )}
    </div>
  );
}

function AccessorySlotItem({
  slot,
  player,
  gameConfig,
  onClick,
}: {
  slot: AccessorySlot;
  player: PlayerState;
  gameConfig: GameConfig | null;
  onClick?: (itemId: string) => void;
}) {
  const equippedId = player.accessories?.equipped?.[slot];
  const itemConfig = equippedId
    ? gameConfig?.accessories?.find((a) => String(a.ID) === String(equippedId))
    : null;
  const level = equippedId
    ? player.accessories?.inventory?.[equippedId] || 1
    : 0;
  const rarityColor = itemConfig
    ? getRarityColor(itemConfig.Rarity)
    : "rgba(255,255,255,0.1)";

  // Try to find a default emoji from the config if the slot is empty
  // We look for any item definition for this slot to use its emoji as the placeholder
  const defaultEmoji = React.useMemo(() => {
    if (itemConfig?.Emoji) return itemConfig.Emoji;
    const configItem = gameConfig?.accessories?.find((a) => a.Slot === slot);
    return configItem?.Emoji || DEFAULT_ACCESSORY_ICONS[slot];
  }, [gameConfig?.accessories, slot, itemConfig]);

  return (
    <div
      className={styles["ca-accessory-slot"]}
      style={{
        width: "54px",
        height: "54px",
        background: "rgba(15, 23, 42, 0.6)",
        border: itemConfig
          ? `2px solid ${rarityColor}`
          : "1px dashed rgba(255,255,255,0.1)",
        borderRadius: "10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        cursor: "pointer",
        transition: "all 0.2s",
        boxShadow: itemConfig ? `0 0 15px ${rarityColor}44` : "none",
      }}
      onClick={() => {
        if (equippedId) onClick?.(equippedId);
      }}
      title={
        itemConfig ? `${itemConfig.Name} (Lv.${level})` : "Empty Accessory"
      }
    >
      <div style={{ fontSize: "1.6rem", opacity: itemConfig ? 1 : 0.3 }}>
        {defaultEmoji}
      </div>

      {itemConfig && (
        <div
          style={{
            position: "absolute",
            bottom: "-4px",
            right: "-4px",
            background: "#4f46e5",
            color: "white",
            fontSize: "0.55rem",
            padding: "1px 3px",
            borderRadius: "6px",
            fontWeight: "bold",
            border: "1px solid rgba(255,255,255,0.2)",
          }}
        >
          Lv.{level}
        </div>
      )}
    </div>
  );
}
