/* eslint-disable @typescript-eslint/no-unused-expressions */
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Monster,
  FloatingText,
  DamageType,
  GameConfig,
  UpgradeEffectType,
} from "../types";
import { formatBigNumber } from "../utils/formatNumber";
import HpBar from "./HpBar";
import styles from "../styles/clickAscension.module.css";

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
        className={styles["ca-monster-image"]}
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback to Emoji
  return <>{monster.emoji || (monster.isBoss ? "🐲" : "👾")}</>;
};

// 預定義的夥伴 emoji 映射表（模組級常數）
const PARTNER_EMOJIS: Record<string, string> = {
  gold_shop_mercenary: "⚔️",
  gold_shop_partner: "🧚",
  gold_shop_archer: "🏹",
  gold_shop_knight: "🛡️",
  gold_shop_warlord: "🔱",
  gold_shop_oracle: "🔮",
  gold_shop_void: "🌌",
  gold_shop_titan: "⛰️",
  gold_shop_dragon: "🐉",
  gold_shop_creation: "✨",
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
  goldShop?: Record<string, number>; // 動態夥伴等級
  gameConfig?: GameConfig | null; // 遊戲設定（用於獲取夥伴名稱）
  potionCount?: number;
  activeBuffs?: any;
  onUsePotion?: () => void;
  lastAutoAttack?: {
    time: number;
    damage: number;
    breakdown?: Record<string, number>; // 動態夥伴傷害分解
  } | null;
  lastAutoClickEvent?: {
    id: string;
    damage: number;
    isCrit: boolean;
    burstHits?: { damage: number; isCrit: boolean }[];
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
  goldShop = {},
  gameConfig,
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
  // 動態獲取所有擁有的夥伴（只顯示 ADD_AUTO_DMG 類型的單位）
  const ownedPartners = Object.entries(goldShop)
    .filter(([id, level]) => {
      if (!id.startsWith("gold_shop_") || level <= 0) return false;
      // 檢查 Effect_Type 是否為 ADD_AUTO_DMG
      const config = gameConfig?.upgrades?.find((u: any) => u.ID === id);
      const effectType = String(config?.Effect_Type || "")
        .toUpperCase()
        .trim();
      return effectType === UpgradeEffectType.ADD_AUTO_DMG;
    })
    .map(([id, level]) => ({ id, level }));

  // 獲取夥伴顯示（優先級：DB Emoji > 前端 PARTNER_EMOJIS > 中文名稱前兩字 > ID）
  const getPartnerDisplay = useCallback(
    (partnerId: string) => {
      // 1. 優先讀取 DB 中設定的 Emoji 欄位
      const config = gameConfig?.upgrades?.find((u: any) => u.ID === partnerId);
      if (config?.Emoji) {
        return config.Emoji;
      }
      // 2. 檢查前端定義的 PARTNER_EMOJIS（作為 fallback）
      if (PARTNER_EMOJIS[partnerId]) {
        return PARTNER_EMOJIS[partnerId];
      }
      // 3. 使用中文名稱的前兩個字
      if (config?.Name) {
        return config.Name.substring(0, 2);
      }
      // 4. 使用 ID 的最後部分
      return partnerId.replace("gold_shop_", "").substring(0, 2);
    },
    [gameConfig]
  );

  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [isShaking, setIsShaking] = useState(false);
  const [isHitFlash, setIsHitFlash] = useState(false);

  // 動態攻擊動畫狀態 (key = partner id)
  const [attackingPartners, setAttackingPartners] = useState<
    Record<string, boolean>
  >({});

  const containerRef = useRef<HTMLDivElement>(null);
  // 動態 refs 用於計算傷害顯示位置
  const partnerRefsMap = useRef<Record<string, HTMLDivElement | null>>({});
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
      // Check for Burst Hits (Optimized Mode)
      // "burstHits" allows us to render multiple distinct damage numbers from a single state update
      // effectively decoupling visual frequency from logic frequency.
      if (
        lastAutoClickEvent.burstHits &&
        lastAutoClickEvent.burstHits.length > 0
      ) {
        lastAutoClickEvent.burstHits.forEach((hit) => {
          const x = rect.width / 2 + (Math.random() * 80 - 40);
          const y = rect.height / 2 + (Math.random() * 80 - 40);
          const type = hit.isCrit ? "CRIT" : "CLICK";

          // Instant burst (no stagger) - Relies on React batching functional updates correctly
          addFloatingText(formatBigNumber(hit.damage, 1, 1000), x, y, type);
        });
        return;
      }

      // Legacy fallback (Single hit event)
      const x = rect.width / 2 + (Math.random() * 60 - 30);
      const y = rect.height / 2 + (Math.random() * 60 - 30);

      const type = lastAutoClickEvent.isCrit ? "CRIT" : "CLICK";
      addFloatingText(
        formatBigNumber(lastAutoClickEvent.damage, 1, 1000),
        x,
        y,
        type
      );
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
      const breakdown = lastAutoAttack.breakdown;

      // 遍歷所有 breakdown 中的夥伴傷害
      Object.entries(breakdown).forEach(([partnerId, dmg]) => {
        if (partnerId === "player" || dmg <= 0) return; // 跳過玩家和無傷害的項目

        const display = getPartnerDisplay(partnerId);
        const partnerEl = partnerRefsMap.current[partnerId];

        if (partnerEl) {
          // 有對應的 ref：使用對應的位置顯示傷害
          const unitRect = partnerEl.getBoundingClientRect();
          const x = unitRect.left - rect.left + unitRect.width / 2;
          const y = unitRect.top - rect.top;
          addFloatingText(
            `${display} ${formatBigNumber(dmg, 1, 1000)}`,
            x,
            y - 20,
            "AUTO"
          );

          // 觸發攻擊動畫
          setAttackingPartners((prev) => ({ ...prev, [partnerId]: true }));
          setTimeout(() => {
            setAttackingPartners((prev) => ({ ...prev, [partnerId]: false }));
          }, 300);
        } else {
          // 沒有對應的 ref：在畫面中央隨機位置顯示傷害
          const x = rect.width / 2 + (Math.random() * 80 - 40);
          const y = rect.height * 0.3 + (Math.random() * 40 - 20);
          addFloatingText(
            `${display} ${formatBigNumber(dmg, 1, 1000)}`,
            x,
            y,
            "AUTO"
          );
        }
      });

      // NOTE: No "player" auto attack damage display
      // Player only has auto-click (which shows as regular click damage)
      // All auto attack damage comes from partners/allies only
    }
  }, [lastAutoAttack, goldShop, gameConfig, getPartnerDisplay]);

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
    console.log("[Debug] Click:", {
      baseDamage,
      isRageActive,
      isBoss: monster.isBoss,
      bossMult: bossDamageMultiplier,
    });

    if (monster.isBoss) clickDmg *= bossDamageMultiplier;

    const isCrit = Math.random() < criticalChance;
    const damage = Math.ceil(clickDmg * (isCrit ? criticalDamage : 1));
    console.log("[Debug] Damage Calc:", {
      clickDmg,
      isCrit,
      criticalDamage,
      finalDamage: damage,
    });

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
    addFloatingText(
      formatBigNumber(damage, 1, 1000),
      x,
      y,
      isCrit ? "CRIT" : "CLICK"
    );

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
        return styles["ca-float-damage-crit"];
      case "AUTO":
        return styles["ca-float-damage-auto"];
      default:
        return styles["ca-float-damage"];
    }
  };

  return (
    <div
      ref={containerRef}
      className={[
        styles["ca-battle-area"],
        isShaking ? styles["ca-shake"] : "",
      ].join(" ")}
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
          className={[
            styles["ca-monster-sprite"],
            monster.isBoss ? styles.boss : "",
            isHitFlash ? styles["ca-hit-flash"] : "",
            styles["ca-bounce-slow"],
          ].join(" ")}
        >
          <MonsterSprite monster={monster} />
        </div>
      )}

      {/* Center UI Overlay */}
      <div
        className={styles["ca-monster-container"]}
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
                className={styles["ca-note-badge"]}
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
            <div className={styles["ca-stage-display"]}>第 {stageId} 關</div>

            {/* Kill Progress */}
            {!isBossActive &&
              (monstersKilled >= monstersRequired ? (
                <button
                  className={[styles["ca-btn"], styles["ca-btn-primary"]].join(
                    " "
                  )}
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

      {/* --- 動態夥伴區域 (所有夥伴都動態生成) --- */}
      {ownedPartners.length > 0 &&
        (() => {
          // 分成左右兩側
          const leftPartners = ownedPartners.filter((_, i) => i % 2 === 0);
          const rightPartners = ownedPartners.filter((_, i) => i % 2 === 1);

          // 起始位置和間距
          const baseTop = 80;
          const spacing = 70;

          // 根據索引判斷動畫類型
          const getAnimClass = (
            index: number,
            isLeft: boolean,
            isAttacking: boolean
          ) => {
            if (!isAttacking) return "";
            // 奇偶交替不同動畫效果
            if (index % 2 === 0) {
              return isLeft
                ? styles["ca-attack-lunge-left"]
                : styles["ca-attack-lunge-right"];
            } else {
              return isLeft
                ? styles["ca-attack-magic-left"]
                : styles["ca-attack-magic-right"];
            }
          };

          return (
            <>
              {/* 左側夥伴 */}
              {leftPartners.map(({ id, level }, index) => (
                <div
                  key={id}
                  ref={(el) => {
                    partnerRefsMap.current[id] = el;
                  }}
                  className={getAnimClass(
                    index,
                    true,
                    attackingPartners[id] || false
                  )}
                  style={{
                    position: "absolute",
                    top: `${baseTop + index * spacing}px`,
                    left: "30px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    alignItems: "center",
                    zIndex: 5,
                  }}
                >
                  <div style={{ fontSize: "1.8rem" }}>
                    {getPartnerDisplay(id)}
                  </div>
                  <div style={{ fontSize: "0.65rem", color: "#a78bfa" }}>
                    Lv.{level}
                  </div>
                </div>
              ))}
              {/* 右側夥伴 */}
              {rightPartners.map(({ id, level }, index) => (
                <div
                  key={id}
                  ref={(el) => {
                    partnerRefsMap.current[id] = el;
                  }}
                  className={getAnimClass(
                    index,
                    false,
                    attackingPartners[id] || false
                  )}
                  style={{
                    position: "absolute",
                    top: `${baseTop + index * spacing}px`,
                    right: "30px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    alignItems: "center",
                    zIndex: 5,
                  }}
                >
                  <div style={{ fontSize: "1.8rem" }}>
                    {getPartnerDisplay(id)}
                  </div>
                  <div style={{ fontSize: "0.65rem", color: "#a78bfa" }}>
                    Lv.{level}
                  </div>
                </div>
              ))}
            </>
          );
        })()}

      {/* --- POTION UI --- */}
      {potionCount > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "16px",
            zIndex: 20,
          }}
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              // Check active buff
              const isRageActive =
                activeBuffs?.ragePotionExpiresAt &&
                activeBuffs.ragePotionExpiresAt > Date.now();
              if (!isRageActive) onUsePotion && onUsePotion();
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              cursor: "pointer",
              gap: "2px",
            }}
          >
            <div
              style={{
                fontSize: "2rem",
                filter:
                  activeBuffs?.ragePotionExpiresAt &&
                  activeBuffs.ragePotionExpiresAt > Date.now()
                    ? "grayscale(1)"
                    : "drop-shadow(0 0 5px #ef4444)",
                transform:
                  activeBuffs?.ragePotionExpiresAt &&
                  activeBuffs.ragePotionExpiresAt > Date.now()
                    ? "scale(0.9)"
                    : "scale(1)",
                transition: "all 0.3s",
              }}
            >
              🧪
            </div>
            <div
              style={{
                fontSize: "0.65rem",
                color: "#fff",
                fontWeight: "bold",
                background: "#ef4444",
                borderRadius: "8px",
                padding: "1px 5px",
                marginTop: "-8px",
              }}
            >
              x{potionCount}
            </div>

            {/* Auto Potion Toggle - 在藥水正下方 */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                onToggleAutoPotion && onToggleAutoPotion();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "3px",
                background: autoUsePotion
                  ? "rgba(34, 197, 94, 0.3)"
                  : "rgba(255, 255, 255, 0.1)",
                padding: "2px 6px",
                borderRadius: "10px",
                border: `1px solid ${autoUsePotion ? "rgba(34, 197, 94, 0.5)" : "rgba(255, 255, 255, 0.2)"}`,
                cursor: "pointer",
                pointerEvents: "auto",
                transition: "all 0.3s",
                marginTop: "2px",
              }}
            >
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: autoUsePotion ? "#22c55e" : "#94a3b8",
                  boxShadow: autoUsePotion ? "0 0 4px #22c55e" : "none",
                }}
              />
              <span
                style={{
                  fontSize: "0.5rem",
                  color: autoUsePotion ? "#4ade80" : "#94a3b8",
                  fontWeight: "bold",
                  letterSpacing: "0.3px",
                }}
              >
                AUTO
              </span>
            </div>
          </div>
        </div>
      )}

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
