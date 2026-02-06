/* eslint-disable @next/next/no-img-element */
import React from "react";
import {
  PlayerState,
  GameConfig,
  EquipmentSlot,
  PlayerAttributes,
  EquipmentItemConfig,
  UpgradeEffectType,
} from "../types";
import { formatBigNumber } from "../utils/formatNumber";
import "../styles/clickAscension.css";

interface CharacterViewProps {
  player: PlayerState;
  effectiveStats: PlayerAttributes;
  userId: string | null;
  gameConfig: GameConfig | null;
  onEquip?: (itemId: string, slot: EquipmentSlot) => void;
  onUnequip?: (slot: EquipmentSlot) => void;
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
  return template.replace("{val}", formatBigNumber(val, 2, 1000));
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
            {getIconFromSlot(config.Slot)}
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
              className="ca-btn"
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
              className="ca-btn"
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

export default function CharacterView({
  player,
  effectiveStats,
  userId,
  gameConfig,
  onEquip,
  onUnequip,
}: CharacterViewProps) {
  const [selectedItem, setSelectedItem] = React.useState<{
    id: string;
    level: number;
    config: EquipmentItemConfig;
  } | null>(null);

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
    );

  // 計算「只有裝備」帶來的加成
  const equipmentBonuses = React.useMemo(() => {
    const bonuses = {
      baseDamage: 0,
      criticalChance: 0,
      criticalDamage: 0,
      goldMultiplier: 0,
      xpMultiplier: 0,
      autoAttackDamage: 0,
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

      const effectType = String(config.Effect_Type || "")
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
      }
    });

    return bonuses;
  }, [player.equipment, gameConfig]);

  return (
    <div
      className="ca-character-view"
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
          {/* 1. Click Damage */}
          <div className="ca-stat-pill">
            <span className="ca-stat-icon">⚔️</span>
            <span className="ca-stat-value">
              {formatBigNumber(Math.floor(effectiveStats.baseDamage), 2, 1000)}
            </span>
            {equipmentBonuses.baseDamage > 0 && (
              <span className="ca-stat-bonus">
                (+
                {formatBigNumber(equipmentBonuses.baseDamage, 2, 1000)})
              </span>
            )}
          </div>

          {/* 2. Critical Chance */}
          <div className="ca-stat-pill">
            <span className="ca-stat-icon">🎯</span>
            <span className="ca-stat-value">
              {(effectiveStats.criticalChance * 100).toFixed(1)}%
            </span>
            {equipmentBonuses.criticalChance > 0 && (
              <span className="ca-stat-bonus">
                (+
                {(equipmentBonuses.criticalChance * 100).toFixed(1)}
                %)
              </span>
            )}
          </div>

          {/* 3. Auto Click (CPS) */}
          <div className="ca-stat-pill">
            <span className="ca-stat-icon">🤖</span>
            <span className="ca-stat-value">
              {Number(effectiveStats.autoClickPerSec || 0).toFixed(1)}/s
            </span>
            {effectiveStats.autoClickPerSec > player.stats.autoClickPerSec && (
              <span className="ca-stat-bonus">
                (+
                {(
                  effectiveStats.autoClickPerSec - player.stats.autoClickPerSec
                ).toFixed(1)}
                )
              </span>
            )}
          </div>

          {/* 4. Critical Damage */}
          <div className="ca-stat-pill">
            <span className="ca-stat-icon">💥</span>
            <span className="ca-stat-value">
              {(effectiveStats.criticalDamage * 100).toFixed(0)}%
            </span>
            {equipmentBonuses.criticalDamage > 0 && (
              <span className="ca-stat-bonus">
                (+
                {(equipmentBonuses.criticalDamage * 100).toFixed(0)}
                %)
              </span>
            )}
          </div>

          {/* 5. Gold Gain */}
          <div className="ca-stat-pill">
            <span className="ca-stat-icon">💰</span>
            <span className="ca-stat-value">
              {(effectiveStats.goldMultiplier * 100).toFixed(0)}%
            </span>
            {equipmentBonuses.goldMultiplier > 0 && (
              <span className="ca-stat-bonus">
                (+
                {(equipmentBonuses.goldMultiplier * 100).toFixed(0)}
                %)
              </span>
            )}
          </div>

          {/* 6. Boss Damage */}
          <div className="ca-stat-pill">
            <span className="ca-stat-icon">👹</span>
            <span className="ca-stat-value">
              {(effectiveStats.bossDamageMultiplier * 100).toFixed(0)}%
            </span>
            {effectiveStats.bossDamageMultiplier >
              player.stats.bossDamageMultiplier && (
              <span className="ca-stat-bonus">
                (+
                {(
                  (effectiveStats.bossDamageMultiplier -
                    player.stats.bossDamageMultiplier) *
                  100
                ).toFixed(0)}
                %)
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 60px",
            width: "100%",
            maxWidth: "500px",
            alignItems: "center",
            zIndex: 2,
            padding: "0 4px",
            minHeight: "200px",
            margin: "0 auto",
          }}
        >
          {/* Left Equipment Column */}
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

          {/* Center Character */}
          <div
            className="ca-character-figure"
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
                width: "110px",
                height: "110px",
                filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.5))",
              }}
            />
            <div
              className="ca-glass"
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

          {/* Right Equipment Column */}
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
          <span
            style={{ fontWeight: "bold", color: "#e2e8f0", fontSize: "0.9rem" }}
          >
            🎒 裝備倉庫 ({inventoryItems.length})
          </span>
          <span style={{ fontSize: "0.65rem", color: "var(--ca-text-muted)" }}>
            點擊裝備以穿戴
          </span>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {inventoryItems.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "gray",
                padding: "20px 0",
                fontSize: "0.8rem",
              }}
            >
              倉庫空空如也...
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))", // Reduced min-width
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
                    className="ca-inventory-item"
                    style={{
                      width: "56px", // Reduced size
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
                        : "none", // Green glow if equipped
                    }}
                    title={`${item.config.Name} (Lv.${item.level}) - ${item.config.Slot}`}
                  >
                    <span style={{ fontSize: "1.5rem" }}>
                      {getIconFromSlot(item.config.Slot)}
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
                      L.{item.level}
                    </div>
                    {isEquipped && (
                      <div
                        style={{
                          position: "absolute",
                          top: "-2px",
                          left: "-2px",
                          background: "#22c55e", // Green for 'E'
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
      className="ca-equipment-slot"
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
        {getIconFromSlot(slot)}
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
