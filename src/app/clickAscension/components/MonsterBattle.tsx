/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-expressions */
"use client";

import React, { useState, useRef } from "react";
import { Monster, FloatingText, DamageType } from "../types";
import HpBar from "./HpBar";
import "../styles/clickAscension.css";

interface MonsterBattleProps {
  monster: Monster | null;
  stageId: number;
  onMonsterClick: (damage: number, isCrit: boolean) => void;
  baseDamage: number;
  criticalChance: number;
  criticalDamage: number;
  monstersKilled: number;
  monstersRequired: number;
  isBossActive: boolean;
  mercenaryLevel?: number;
  partnerLevel?: number;
  potionCount?: number;
  activeBuffs?: any;
  onUsePotion?: () => void;
}

export default function MonsterBattle({
  monster,
  stageId,
  onMonsterClick,
  baseDamage,
  criticalChance,
  criticalDamage,
  monstersKilled,
  monstersRequired,
  isBossActive,
  mercenaryLevel = 0,
  partnerLevel = 0,
  potionCount = 0,
  activeBuffs,
  onUsePotion,
}: MonsterBattleProps) {
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [isShaking, setIsShaking] = useState(false);
  const [isHitFlash, setIsHitFlash] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check if Rage Potion is active
  const isRageActive =
    activeBuffs?.ragePotionExpiresAt &&
    activeBuffs.ragePotionExpiresAt > Date.now();

  const addFloatingText = (
    text: string,
    x: number,
    y: number,
    type: DamageType
  ) => {
    const id = crypto.randomUUID();
    setFloatingTexts((prev) => [
      ...prev,
      { id, text, x, y, type, createdAt: Date.now() },
    ]);

    setTimeout(() => {
      setFloatingTexts((prev) => prev.filter((ft) => ft.id !== id));
    }, 1000);
  };

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (!monster || monster.currentHp <= 0) return;

    // Calculate damage
    // Note: Boss Multiplier is handled in parent (page.tsx).
    // Here we just calc base/crit.
    // BUT we need to apply Potion Multiplier here visually or in parent?
    // Parent logic uses `handleMonsterClick(damage)`.
    // So if we want potion to double click damage, we should multiply it here OR pass `isRageActive` to parent.
    // Parent doesn't know about `activeBuffs` expiration tick unless we force re-render or check timestamp.
    // Parent `handleMonsterClick` does not check buffs currently.
    // Let's multiply here for now, assuming parent trusts the damage value.

    let clickDmg = baseDamage;
    if (isRageActive) clickDmg *= 2;

    const isCrit = Math.random() < criticalChance;
    const damage = Math.ceil(clickDmg * (isCrit ? criticalDamage : 1));

    // Get click/touch position relative to container
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    let clientX: number, clientY: number;
    if ("touches" in e) {
      clientX = e.touches[0]?.clientX ?? rect.left + rect.width / 2;
      clientY = e.touches[0]?.clientY ?? rect.top + rect.height / 2;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left + (Math.random() * 60 - 30);
    const y = clientY - rect.top + (Math.random() * 60 - 30);

    // Add floating text
    addFloatingText(damage.toLocaleString(), x, y, isCrit ? "CRIT" : "CLICK");

    // Trigger effects
    setIsShaking(true);
    setIsHitFlash(true);
    setTimeout(() => setIsShaking(false), 300);
    setTimeout(() => setIsHitFlash(false), 150);

    // Callback to parent
    onMonsterClick(damage, isCrit);
  };

  const getDamageClass = (type: DamageType) => {
    switch (type) {
      case "CRIT":
        return "ca-float-damage-crit";
      case "AUTO":
        return "ca-float-damage-auto";
      default:
        return "ca-float-damage";
    }
  };

  return (
    <div
      ref={containerRef}
      className={`ca-battle-area ${isShaking ? "ca-shake" : ""}`}
      style={{
        background: isRageActive
          ? "radial-gradient(circle, rgba(220, 38, 38, 0.2) 0%, rgba(15, 23, 42, 1) 80%)"
          : "",
      }}
      onClick={handleClick}
      onTouchStart={handleClick}
    >
      {/* Monster Container - Centered */}
      <div className="ca-monster-container">
        {monster ? (
          <>
            {/* Stage Badge - Above Monster */}
            <div className="ca-stage-display">第 {stageId} 關</div>

            {/* Kill Progress */}
            {!isBossActive && (
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "var(--ca-text-muted)",
                  marginTop: "4px",
                  marginBottom: "16px",
                  background: "rgba(0,0,0,0.3)",
                  padding: "2px 8px",
                  borderRadius: "12px",
                }}
              >
                {monstersKilled} / {monstersRequired} 💀
              </div>
            )}

            {isBossActive && (
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "#ef4444",
                  marginTop: "4px",
                  marginBottom: "16px",
                  fontWeight: "bold",
                  background: "rgba(239, 68, 68, 0.1)",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                }}
              >
                ⚠️ BOSS 挑戰中 ⚠️
              </div>
            )}

            <div
              className={`ca-monster-sprite ${monster.isBoss ? "boss" : ""} ${isHitFlash ? "ca-hit-flash" : ""} ca-bounce-slow`}
            >
              {monster.emoji || (monster.isBoss ? "🐲" : "👾")}
            </div>

            {/* HP Bar - Below Monster */}
            <div className="mt-6 w-56">
              <HpBar
                name={monster.name}
                currentHp={monster.currentHp}
                maxHp={monster.maxHp}
                isBoss={monster.isBoss}
              />
            </div>
          </>
        ) : (
          <div className="text-slate-500 text-sm animate-pulse">
            搜尋目標中...
          </div>
        )}
      </div>

      {/* --- ALLIES (Mercenary / Partner) --- */}
      <div
        style={{
          position: "absolute",
          bottom: "20px",
          left: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          alignItems: "center",
        }}
      >
        {mercenaryLevel > 0 && (
          <>
            <div style={{ fontSize: "2rem" }}>⚔️</div>
            <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
              Lv.{mercenaryLevel}
            </div>
          </>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "20px",
          right: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          alignItems: "center",
        }}
      >
        {partnerLevel > 0 && (
          <>
            <div style={{ fontSize: "2rem" }}>🧚</div>
            <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
              Lv.{partnerLevel}
            </div>
          </>
        )}
      </div>

      {/* --- POTION UI --- */}
      {potionCount > 0 && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (!isRageActive) onUsePotion && onUsePotion();
          }}
          style={{
            position: "absolute",
            top: "60px",
            right: "20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            cursor: isRageActive ? "default" : "pointer",
            opacity: isRageActive ? 0.5 : 1,
            zIndex: 20,
          }}
        >
          <div
            style={{
              fontSize: "2rem",
              filter: isRageActive
                ? "grayscale(1)"
                : "drop-shadow(0 0 5px #ef4444)",
              transform: isRageActive ? "scale(0.9)" : "scale(1)",
            }}
          >
            🧪
          </div>
          <div
            style={{
              fontSize: "0.7rem",
              color: "#fff",
              fontWeight: "bold",
              background: "#ef4444",
              borderRadius: "10px",
              padding: "2px 6px",
              marginTop: "-10px",
            }}
          >
            x{potionCount}
          </div>
        </div>
      )}

      {/* Floating Texts - Absolute positioned */}
      <div className="absolute inset-0 pointer-events-none overflow-visible">
        {floatingTexts.map((ft) => (
          <div
            key={ft.id}
            className={getDamageClass(ft.type)}
            style={{ left: ft.x, top: ft.y }}
          >
            {ft.text}
          </div>
        ))}
      </div>
    </div>
  );
}
