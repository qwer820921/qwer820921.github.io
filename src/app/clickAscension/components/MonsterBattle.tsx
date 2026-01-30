/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-expressions */
"use client";

import React, { useState, useRef, useEffect } from "react";
import { Monster, FloatingText, DamageType } from "../types";
import HpBar from "./HpBar";
import "../styles/clickAscension.css";

// Helper component to handle monster image with emoji fallback
const MonsterSprite = ({ monster }: { monster: Monster }) => {
  const [imgError, setImgError] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  useEffect(() => {
    // Reset error and set new source when monster changes
    setImgError(false);
    if (monster.configId) {
      setImgSrc(`/clickAscension/monsters/${monster.configId}.webp`);
    } else {
      setImgSrc(null);
    }
  }, [monster.configId]);

  if (!imgError && imgSrc) {
    return (
      <img
        src={imgSrc}
        alt={monster.name}
        className="ca-monster-image"
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback to Emoji
  return <>{monster.emoji || (monster.isBoss ? "🐲" : "👾")}</>;
};

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
  bossDamageMultiplier: number;
  mercenaryLevel?: number;
  partnerLevel?: number;
  archerLevel?: number;
  knightLevel?: number;
  warlordLevel?: number;
  oracleLevel?: number;
  voidLevel?: number;
  titanLevel?: number;
  potionCount?: number;
  activeBuffs?: any;
  onUsePotion?: () => void;
  lastAutoAttack?: {
    time: number;
    damage: number;
    breakdown?: {
      mercenary: number;
      partner: number;
      archer: number;
      knight: number;
      warlord: number;
      oracle: number;
      void: number;
      titan: number;
      player: number;
    };
  } | null;
  lastAutoClickEvent?: {
    id: string;
    damage: number;
    isCrit: boolean;
  } | null;
  bossTimeLeft?: number | null;
  bossTimeLimit?: number;
  onChallengeBoss?: () => void;
  autoUsePotion?: boolean;
  onToggleAutoPotion?: () => void;
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
  bossDamageMultiplier = 1,
  mercenaryLevel = 0,
  partnerLevel = 0,
  archerLevel = 0,
  knightLevel = 0,
  warlordLevel = 0,
  oracleLevel = 0,
  voidLevel = 0,
  titanLevel = 0,
  potionCount = 0,
  activeBuffs,
  onUsePotion,
  lastAutoAttack,
  lastAutoClickEvent,
  bossTimeLeft,
  bossTimeLimit = 60,
  onChallengeBoss,
  autoUsePotion = false,
  onToggleAutoPotion,
}: MonsterBattleProps) {
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [isShaking, setIsShaking] = useState(false);
  const [isHitFlash, setIsHitFlash] = useState(false);

  // Animation states for allies
  const [isMercAttacking, setIsMercAttacking] = useState(false);
  const [isPartnerAttacking, setIsPartnerAttacking] = useState(false);
  const [isArcherAttacking, setIsArcherAttacking] = useState(false);
  const [isKnightAttacking, setIsKnightAttacking] = useState(false);
  const [isWarlordAttacking, setIsWarlordAttacking] = useState(false);
  const [isOracleAttacking, setIsOracleAttacking] = useState(false);
  const [isVoidAttacking, setIsVoidAttacking] = useState(false);
  const [isTitanAttacking, setIsTitanAttacking] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const mercRef = useRef<HTMLDivElement>(null);
  const partnerRef = useRef<HTMLDivElement>(null);
  const archerRef = useRef<HTMLDivElement>(null);
  const knightRef = useRef<HTMLDivElement>(null);
  const warlordRef = useRef<HTMLDivElement>(null);
  const oracleRef = useRef<HTMLDivElement>(null);
  const voidRef = useRef<HTMLDivElement>(null);
  const titanRef = useRef<HTMLDivElement>(null);
  const lastAttackTimeRef = useRef<number>(0);
  const lastAutoClickIdRef = useRef<string>(""); // Track ID to prevent dupes

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
    const rect = containerRef.current?.getBoundingClientRect();
    const padding = 50; // Ensure text stays away from extreme edges
    const clampedX = rect
      ? Math.max(padding, Math.min(rect.width - padding, x))
      : x;

    const id = crypto.randomUUID();
    setFloatingTexts((prev) => [
      ...prev,
      { id, text, x: clampedX, y, type, createdAt: Date.now() },
    ]);

    setTimeout(() => {
      setFloatingTexts((prev) => prev.filter((ft) => ft.id !== id));
    }, 1000);
  };

  // Handle Auto Click Visuals (Fast Clicks)
  React.useEffect(() => {
    if (
      !lastAutoClickEvent ||
      lastAutoClickEvent.id === lastAutoClickIdRef.current
    )
      return;
    lastAutoClickIdRef.current = lastAutoClickEvent.id;

    // Visual Effect
    setIsHitFlash(true);
    setTimeout(() => setIsHitFlash(false), 50); // Fast flash

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      // Random position near center implies "Auto Click"
      const x = rect.width / 2 + (Math.random() * 60 - 30);
      const y = rect.height / 2 + (Math.random() * 60 - 30);

      const type = lastAutoClickEvent.isCrit ? "CRIT" : "CLICK";
      addFloatingText(lastAutoClickEvent.damage.toLocaleString(), x, y, type);
    }
  }, [lastAutoClickEvent]);

  // Handle Auto Attack Visuals
  React.useEffect(() => {
    if (!lastAutoAttack || lastAutoAttack.time === lastAttackTimeRef.current)
      return;
    lastAttackTimeRef.current = lastAutoAttack.time;

    // 1. Effects on Monster
    setIsHitFlash(true);
    setTimeout(() => setIsHitFlash(false), 150);

    const rect = containerRef.current?.getBoundingClientRect();

    if (lastAutoAttack.breakdown && rect) {
      const {
        mercenary,
        partner,
        archer,
        knight,
        warlord,
        oracle,
        void: voidDmg,
        titan,
        // player - not used, only partners have auto attack damage
      } = lastAutoAttack.breakdown;

      // Mercenary Damage
      if (mercenary > 0 && mercRef.current) {
        const mercRect = mercRef.current.getBoundingClientRect();
        const x = mercRect.left - rect.left + mercRect.width / 2;
        const y = mercRect.top - rect.top; // Above unit
        addFloatingText(`⚔️ ${mercenary.toLocaleString()}`, x, y - 20, "AUTO");

        setIsMercAttacking(true);
        setTimeout(() => setIsMercAttacking(false), 300);
      }

      // Partner Damage
      if (partner > 0 && partnerRef.current) {
        const partnerRect = partnerRef.current.getBoundingClientRect();
        const x = partnerRect.left - rect.left + partnerRect.width / 2;
        const y = partnerRect.top - rect.top; // Above unit
        addFloatingText(`🧚 ${partner.toLocaleString()}`, x, y - 20, "AUTO");

        setIsPartnerAttacking(true);
        setTimeout(() => setIsPartnerAttacking(false), 400);
      }

      // Archer Damage
      if (archer > 0 && archerRef.current) {
        const archerRect = archerRef.current.getBoundingClientRect();
        const x = archerRect.left - rect.left + archerRect.width / 2;
        const y = archerRect.top - rect.top; // Above unit
        addFloatingText(`🏹 ${archer.toLocaleString()}`, x, y - 20, "AUTO");

        setIsArcherAttacking(true);
        setTimeout(() => setIsArcherAttacking(false), 300);
      }

      // Knight Damage
      if (knight > 0 && knightRef.current) {
        const knightRect = knightRef.current.getBoundingClientRect();
        const x = knightRect.left - rect.left + knightRect.width / 2;
        const y = knightRect.top - rect.top; // Above unit
        addFloatingText(`🛡️ ${knight.toLocaleString()}`, x, y - 20, "AUTO");

        setIsKnightAttacking(true);
        setTimeout(() => setIsKnightAttacking(false), 300);
      }

      // Warlord Damage
      if (warlord > 0 && warlordRef.current) {
        const unitRect = warlordRef.current.getBoundingClientRect();
        const x = unitRect.left - rect.left + unitRect.width / 2;
        const y = unitRect.top - rect.top;
        addFloatingText(`🔱 ${warlord.toLocaleString()}`, x, y - 20, "AUTO");
        setIsWarlordAttacking(true);
        setTimeout(() => setIsWarlordAttacking(false), 300);
      }

      // Oracle Damage
      if (oracle > 0 && oracleRef.current) {
        const unitRect = oracleRef.current.getBoundingClientRect();
        const x = unitRect.left - rect.left + unitRect.width / 2;
        const y = unitRect.top - rect.top;
        addFloatingText(`🔮 ${oracle.toLocaleString()}`, x, y - 20, "AUTO");
        setIsOracleAttacking(true);
        setTimeout(() => setIsOracleAttacking(false), 300);
      }

      // Void Damage
      if (voidDmg > 0 && voidRef.current) {
        const unitRect = voidRef.current.getBoundingClientRect();
        const x = unitRect.left - rect.left + unitRect.width / 2;
        const y = unitRect.top - rect.top;
        addFloatingText(`🌌 ${voidDmg.toLocaleString()}`, x, y - 20, "AUTO");
        setIsVoidAttacking(true);
        setTimeout(() => setIsVoidAttacking(false), 300);
      }

      // Titan Damage
      if (titan > 0 && titanRef.current) {
        const unitRect = titanRef.current.getBoundingClientRect();
        const x = unitRect.left - rect.left + unitRect.width / 2;
        const y = unitRect.top - rect.top;
        addFloatingText(`⛰️ ${titan.toLocaleString()}`, x, y - 20, "AUTO");
        setIsTitanAttacking(true);
        setTimeout(() => setIsTitanAttacking(false), 300);
      }

      // NOTE: No "player" auto attack damage display
      // Player only has auto-click (which shows as regular click damage)
      // All auto attack damage comes from partners/allies only
    }
  }, [
    lastAutoAttack,
    mercenaryLevel,
    partnerLevel,
    archerLevel,
    knightLevel,
    warlordLevel,
    oracleLevel,
    voidLevel,
    titanLevel,
  ]);

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
    if (monster.isBoss) clickDmg *= bossDamageMultiplier;

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
      {/* Background Monster Sprite */}
      {monster && (
        <div
          className={`ca-monster-sprite ${monster.isBoss ? "boss" : ""} ${isHitFlash ? "ca-hit-flash" : ""} ca-bounce-slow`}
        >
          <MonsterSprite monster={monster} />
        </div>
      )}

      {/* Center UI Overlay */}
      <div
        className="ca-monster-container"
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        {monster ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
              position: "relative",
            }}
          >
            {isBossActive && (
              <div
                style={{
                  position: "absolute",
                  top: "-120px", // Offset upwards since parent is centered
                  left: "50%",
                  transform: "translateX(-50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  width: "100%",
                  maxWidth: "240px",
                  zIndex: 10,
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "#ef4444",
                    fontWeight: "bold",
                    background: "rgba(239, 68, 68, 0.2)",
                    padding: "2px 10px",
                    borderRadius: "10px",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    letterSpacing: "1px",
                    marginBottom: "4px",
                  }}
                >
                  👹 BOSS 戰進行中
                </div>

                {bossTimeLeft !== undefined && bossTimeLeft !== null && (
                  <div style={{ width: "100%" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "1.2rem",
                          fontWeight: "900",
                          color: bossTimeLeft <= 10 ? "#ff4d4d" : "#fbbf24",
                          textShadow: "0 0 10px rgba(0,0,0,0.8)",
                          fontFamily: "monospace",
                        }}
                      >
                        ⏱️ {bossTimeLeft}s
                      </span>
                    </div>
                    <div
                      style={{
                        width: "100%",
                        height: "8px",
                        background: "rgba(255,255,255,0.1)",
                        borderRadius: "4px",
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,0.1)",
                        marginTop: "2px",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${(bossTimeLeft / bossTimeLimit) * 100}%`,
                          background:
                            bossTimeLeft <= 10
                              ? "linear-gradient(90deg, #ef4444, #b91c1c)"
                              : "linear-gradient(90deg, #fbbf24, #d97706)",
                          transition: "width 1s linear, background 0.3s",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Note Display - Now above Stage Badge */}
            {monster.note && (
              <div
                className="ca-note-badge"
                style={{
                  position: "relative",
                  top: "0",
                  left: "0",
                  transform: "none",
                  marginBottom: "8px",
                }}
              >
                <span>📍</span>
                <span>{monster.note}</span>
              </div>
            )}

            {/* Stage Badge */}
            <div className="ca-stage-display">第 {stageId} 關</div>

            {/* Kill Progress */}
            {!isBossActive &&
              (monstersKilled >= monstersRequired ? (
                <button
                  className="ca-btn ca-btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChallengeBoss?.();
                  }}
                  style={{
                    pointerEvents: "auto",
                    marginBottom: "16px",
                    padding: "8px 20px",
                    fontSize: "1rem",
                    background: "linear-gradient(to right, #ef4444, #b91c1c)",
                    boxShadow: "0 0 15px rgba(239, 68, 68, 0.4)",
                    border: "none",
                  }}
                >
                  ⚔️ 挑戰 BOSS
                </button>
              ) : (
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--ca-text-muted)",
                    marginTop: "4px",
                    marginBottom: "16px",
                    background: "rgba(0,0,0,0.5)",
                    padding: "2px 8px",
                    borderRadius: "12px",
                  }}
                >
                  {monstersKilled} / {monstersRequired} 💀
                </div>
              ))}

            {/* Empty space for monster background visibility */}
            <div style={{ height: "100px" }}></div>

            {/* HP Bar - Always at the bottom of center UI */}
            <div className="w-56" style={{ marginTop: "auto" }}>
              <HpBar
                name={monster.name}
                currentHp={monster.currentHp}
                maxHp={monster.maxHp}
                isBoss={monster.isBoss}
              />
            </div>
          </div>
        ) : (
          <div className="text-slate-500 text-sm animate-pulse">
            搜尋目標中...
          </div>
        )}
      </div>

      {/* --- ALLIES (Mercenary / Partner) --- */}
      <div
        ref={mercRef}
        className={isMercAttacking ? "ca-attack-lunge-left" : ""}
        style={{
          position: "absolute",
          bottom: "20px",
          left: "30px", // Shifting slightly in
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
        ref={partnerRef}
        className={isPartnerAttacking ? "ca-attack-magic-right" : ""}
        style={{
          position: "absolute",
          bottom: "20px",
          right: "30px", // Shifting slightly in
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
          style={{
            position: "absolute",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            zIndex: 20,
          }}
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (!isRageActive) onUsePotion && onUsePotion();
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              cursor: isRageActive ? "default" : "pointer",
              opacity: isRageActive ? 0.5 : 1,
            }}
          >
            <div
              style={{
                fontSize: "2rem",
                filter: isRageActive
                  ? "grayscale(1)"
                  : "drop-shadow(0 0 5px #ef4444)",
                transform: isRageActive ? "scale(0.9)" : "scale(1)",
                transition: "all 0.3s",
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

          {/* Auto Potion Toggle */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggleAutoPotion && onToggleAutoPotion();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: autoUsePotion
                ? "rgba(34, 197, 94, 0.2)"
                : "rgba(255, 255, 255, 0.1)",
              padding: "4px 10px",
              borderRadius: "20px",
              border: `1px solid ${autoUsePotion ? "rgba(34, 197, 94, 0.4)" : "rgba(255, 255, 255, 0.2)"}`,
              cursor: "pointer",
              pointerEvents: "auto",
              transition: "all 0.3s",
            }}
          >
            <div
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: autoUsePotion ? "#22c55e" : "#94a3b8",
                boxShadow: autoUsePotion ? "0 0 8px #22c55e" : "none",
              }}
            />
            <span
              style={{
                fontSize: "0.6rem",
                color: autoUsePotion ? "#4ade80" : "#94a3b8",
                fontWeight: "bold",
                letterSpacing: "0.5px",
                whiteSpace: "nowrap",
              }}
            >
              {autoUsePotion ? "AUTO ON" : "AUTO OFF"}
            </span>
          </div>
        </div>
      )}

      {/* --- ARCHER (Top Left) --- */}
      <div
        ref={archerRef}
        className={isArcherAttacking ? "ca-attack-lunge-left" : ""}
        style={{
          position: "absolute",
          top: "80px",
          left: "30px", // Shifting slightly in
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          alignItems: "center",
          zIndex: 5,
        }}
      >
        {archerLevel > 0 && (
          <>
            <div style={{ fontSize: "2rem" }}>🏹</div>
            <div style={{ fontSize: "0.7rem", color: "#a5b4fc" }}>
              Lv.{archerLevel}
            </div>
          </>
        )}
      </div>

      {/* --- KNIGHT (Top Right) --- */}
      <div
        ref={knightRef}
        className={isKnightAttacking ? "ca-attack-lunge-right" : ""}
        style={{
          position: "absolute",
          top: "80px",
          right: "30px", // Shifting slightly in
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          alignItems: "center",
          zIndex: 5,
        }}
      >
        {knightLevel > 0 && (
          <>
            <div style={{ fontSize: "2rem" }}>🛡️</div>
            <div style={{ fontSize: "0.7rem", color: "#fca5a5" }}>
              Lv.{knightLevel}
            </div>
          </>
        )}
      </div>

      {/* --- WARLORD (Mid Left) --- */}
      <div
        ref={warlordRef}
        className={isWarlordAttacking ? "ca-attack-lunge-left" : ""}
        style={{
          position: "absolute",
          top: "160px",
          left: "30px", // Shifting slightly in
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          alignItems: "center",
          zIndex: 5,
        }}
      >
        {warlordLevel > 0 && (
          <>
            <div style={{ fontSize: "2rem" }}>🔱</div>
            <div style={{ fontSize: "0.7rem", color: "#fb923c" }}>
              Lv.{warlordLevel}
            </div>
          </>
        )}
      </div>

      {/* --- ORACLE (Mid Right) --- */}
      <div
        ref={oracleRef}
        className={isOracleAttacking ? "ca-attack-magic-right" : ""}
        style={{
          position: "absolute",
          top: "160px",
          right: "30px", // Shifting slightly in
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          alignItems: "center",
          zIndex: 5,
        }}
      >
        {oracleLevel > 0 && (
          <>
            <div style={{ fontSize: "2rem" }}>🔮</div>
            <div style={{ fontSize: "0.7rem", color: "#c084fc" }}>
              Lv.{oracleLevel}
            </div>
          </>
        )}
      </div>

      {/* --- VOID LORD (Lower Mid Left) --- */}
      <div
        ref={voidRef}
        className={isVoidAttacking ? "ca-attack-magic-left" : ""}
        style={{
          position: "absolute",
          top: "240px",
          left: "30px", // Shifting slightly in
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          alignItems: "center",
          zIndex: 5,
        }}
      >
        {voidLevel > 0 && (
          <>
            <div style={{ fontSize: "2rem" }}>🌌</div>
            <div style={{ fontSize: "0.7rem", color: "#818cf8" }}>
              Lv.{voidLevel}
            </div>
          </>
        )}
      </div>

      {/* --- ANCIENT TITAN (Lower Mid Right) --- */}
      <div
        ref={titanRef}
        className={isTitanAttacking ? "ca-attack-lunge-right" : ""}
        style={{
          position: "absolute",
          top: "240px",
          right: "30px", // Shifting slightly in
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          alignItems: "center",
          zIndex: 5,
        }}
      >
        {titanLevel > 0 && (
          <>
            <div style={{ fontSize: "2rem" }}>👺</div>
            <div style={{ fontSize: "0.7rem", color: "#71717a" }}>
              Lv.{titanLevel}
            </div>
          </>
        )}
      </div>

      {/* Floating Texts - Absolute positioned */}
      <div
        className="absolute inset-0 pointer-events-none overflow-visible"
        style={{ zIndex: 100 }}
      >
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
