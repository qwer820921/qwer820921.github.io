/* eslint-disable @next/next/no-img-element */
import React from "react";
import {
  PlayerState,
  GameConfig,
  EquipmentSlot,
  PlayerAttributes,
  EquipmentItemConfig,
} from "../types";
import "../styles/clickAscension.css";

interface CharacterViewProps {
  player: PlayerState;
  effectiveStats: PlayerAttributes;
  totalDps: number; // Add totalDps
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
  const val = (config.Base_Val || 0) + (level - 1) * (config.Level_Mult || 0);
  return template.replace("{val}", val.toLocaleString());
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
  totalDps,
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

  return (
    <div
      className="ca-character-view"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "16px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: "1 1 50%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          minHeight: "350px",
          position: "relative",
          paddingTop: "10px",
        }}
      >
        {/* --- Stats Summary Area (Integrated Above) --- */}
        <div
          style={{
            width: "100%",
            maxWidth: "450px",
            display: "flex",
            justifyContent: "center",
            gap: "8px",
            marginBottom: "12px",
            zIndex: 10,
          }}
        >
          {/* Click Dmg */}
          <div
            className="ca-glass"
            style={{
              flex: 1,
              padding: "10px 6px",
              borderRadius: "16px",
              background: "rgba(30, 41, 59, 0.4)",
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
            }}
          >
            <span
              style={{
                fontSize: "0.65rem",
                color: "#94a3b8",
                marginBottom: "4px",
              }}
            >
              ⚔️ 點擊傷害
            </span>
            <span
              style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#fff" }}
            >
              {Math.floor(effectiveStats.baseDamage).toLocaleString()}
            </span>
            {effectiveStats.baseDamage > player.stats.baseDamage && (
              <span
                style={{
                  fontSize: "0.6rem",
                  color: "#4ade80",
                  fontWeight: "bold",
                }}
              >
                +
                {(
                  effectiveStats.baseDamage - player.stats.baseDamage
                ).toLocaleString()}
              </span>
            )}
          </div>

          {/* DPS */}
          <div
            className="ca-glass"
            style={{
              flex: 1,
              padding: "10px 6px",
              borderRadius: "16px",
              background: "rgba(30, 41, 59, 0.4)",
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
            }}
          >
            <span
              style={{
                fontSize: "0.65rem",
                color: "#94a3b8",
                marginBottom: "4px",
              }}
            >
              🤖 秒傷 (DPS)
            </span>
            <span
              style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#fff" }}
            >
              {Math.floor(totalDps).toLocaleString()}
            </span>
            {effectiveStats.autoAttackDamage >
              player.stats.autoAttackDamage && (
              <span
                style={{
                  fontSize: "0.6rem",
                  color: "#4ade80",
                  fontWeight: "bold",
                }}
              >
                +
                {(
                  effectiveStats.autoAttackDamage -
                  player.stats.autoAttackDamage
                ).toLocaleString()}
              </span>
            )}
          </div>

          {/* Boss Dmg */}
          <div
            className="ca-glass"
            style={{
              flex: 1,
              padding: "10px 6px",
              borderRadius: "16px",
              background: "rgba(30, 41, 59, 0.4)",
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
            }}
          >
            <span
              style={{
                fontSize: "0.65rem",
                color: "#fca5a5",
                marginBottom: "4px",
              }}
            >
              👹 BOSS 傷害
            </span>
            <span
              style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#fff" }}
            >
              {(effectiveStats.bossDamageMultiplier || 1.0).toFixed(2)}x
            </span>
            {effectiveStats.bossDamageMultiplier >
              player.stats.bossDamageMultiplier && (
              <span
                style={{
                  fontSize: "0.6rem",
                  color: "#4ade80",
                  fontWeight: "bold",
                }}
              >
                +
                {(
                  (effectiveStats.bossDamageMultiplier -
                    player.stats.bossDamageMultiplier) *
                  100
                ).toFixed(0)}
                %
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            width: "100%",
            maxWidth: "500px",
            justifyContent: "space-between",
            alignItems: "center",
            zIndex: 2,
            padding: "0 10px",
          }}
        >
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
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

          <div
            className="ca-character-figure ca-bounce-slow"
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <img
              src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${userId || "Guest"}`}
              alt="Character"
              style={{
                width: "140px",
                height: "140px",
                filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.5))",
              }}
            />
            <div
              className="ca-glass"
              style={{
                marginTop: "8px",
                padding: "4px 12px",
                borderRadius: "20px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(15, 23, 42, 0.6)",
              }}
            >
              <span style={{ fontSize: "1rem" }}>Lv.{player.system.level}</span>
              <span
                style={{
                  width: "1px",
                  height: "12px",
                  background: "rgba(255,255,255,0.2)",
                }}
              />
              <span
                style={{
                  color: "var(--ca-accent-gold)",
                  fontWeight: "bold",
                  fontSize: "0.9rem",
                }}
              >
                {userId || "Guest"}
              </span>
            </div>
          </div>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
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
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "250px",
            height: "250px",
            background:
              "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      </div>

      <div
        style={{
          flex: "1 1 50%",
          width: "100%",
          background: "rgba(15, 23, 42, 0.4)",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(0,0,0,0.2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: "bold", color: "#e2e8f0" }}>
            🎒 裝備倉庫 ({inventoryItems.length})
          </span>
          <span style={{ fontSize: "0.7rem", color: "var(--ca-text-muted)" }}>
            點擊裝備以穿戴
          </span>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
          {inventoryItems.length === 0 ? (
            <div
              style={{ textAlign: "center", color: "gray", padding: "40px 0" }}
            >
              倉庫空空如也...
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))",
                gap: "12px",
              }}
            >
              {inventoryItems.map((item) => {
                const isEquipped = Object.values(
                  player.equipment?.equipped || {}
                ).includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="ca-inventory-item"
                    style={{
                      width: "64px",
                      height: "64px",
                      background: "rgba(30, 41, 59, 0.6)",
                      border: isEquipped
                        ? "2px solid var(--ca-accent-gold)"
                        : "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      cursor: "pointer",
                      opacity: isEquipped ? 0.6 : 1,
                    }}
                    title={`${item.config.Name} (Lv.${item.level}) - ${item.config.Slot}`}
                  >
                    <span style={{ fontSize: "1.8rem" }}>
                      {getIconFromSlot(item.config.Slot)}
                    </span>
                    <div
                      style={{
                        position: "absolute",
                        bottom: "-4px",
                        right: "-4px",
                        background: "#4f46e5",
                        color: "white",
                        fontSize: "0.6rem",
                        padding: "1px 4px",
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
                          background: "var(--ca-accent-gold)",
                          color: "black",
                          fontSize: "0.5rem",
                          padding: "1px 3px",
                          borderRadius: "3px",
                          fontWeight: "bold",
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

  return (
    <div
      className="ca-equipment-slot"
      style={{
        width: "64px",
        height: "64px",
        background: "rgba(15, 23, 42, 0.6)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
      onClick={() => equippedId && onClick?.(equippedId)}
      title={itemConfig ? `${itemConfig.Name} (Lv.${level})` : "Empty Slot"}
    >
      <div style={{ fontSize: "2rem", opacity: itemConfig ? 1 : 0.3 }}>
        {getIconFromSlot(slot)}
      </div>

      {itemConfig && (
        <div
          style={{
            position: "absolute",
            bottom: "-6px",
            right: "-6px",
            background: "#4f46e5",
            color: "white",
            fontSize: "0.6rem",
            padding: "2px 6px",
            borderRadius: "10px",
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
