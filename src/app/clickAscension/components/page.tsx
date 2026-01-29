/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  PlayerState,
  StageState,
  Monster,
  EquipmentSlot,
  GameConfig,
  MonsterTemplate,
  MonsterRarity,
} from "../types";
import Header from "./Header";
import MonsterBattle from "./MonsterBattle";
import FooterNav, { ModalType, ViewType } from "./FooterNav";
import Modal from "./Modal";
import ShopPage from "./ShopPage";
import ProfilePage from "./ProfilePage";
import CharacterView from "./CharacterView";
import { clickAscensionApi } from "../api/clickAscensionApi";
import "../styles/clickAscension.css";

// ============================================================================
// Initial State Constants
// ============================================================================

const INITIAL_PLAYER: PlayerState = {
  system: { level: 1, currentXp: 0, requiredXp: 100 },
  wallet: {
    gold: 0,
    clickPoints: 0,
    diamonds: 10,
    levelPoints: 0,
    ascensionPoints: 0,
    equipmentShards: 0,
  },
  stats: {
    baseDamage: 1,
    autoAttackDamage: 0,
    criticalChance: 0.05,
    criticalDamage: 1.5,
    goldMultiplier: 1.0,
    cpMultiplier: 1.0,
    xpMultiplier: 1.0,
    bossDamageMultiplier: 1.0,
    autoClickPerSec: 1, // Start with 1 auto click
    monsterKillReduction: 0,
    rareMonsterChance: 0,
  },
  records: {
    totalClicks: 0,
    totalDamageDealt: 0,
    maxStageReached: 1,
    totalGoldEarned: 0,
    playtimeSeconds: 0,
    monstersKilled: 0,
    bossesKilled: 0,
  },
  clickShop: {},
  levelShop: {},
  goldShop: {
    weaponLevel: 0,
    mercenaryLevel: 0,
    partnerLevel: 0,
    archerLevel: 0,
    knightLevel: 0,
    amuletLevel: 0,
  },
  ascensionShop: {},
  inventory: {
    ragePotionCount: 0,
  },
  activeBuffs: {
    ragePotionExpiresAt: 0,
  },
  equipment: {
    inventory: {},
    equipped: {},
  },
  lastDailyRewardClaimTime: 0,
};

const MONSTERS_PER_STAGE = 10;

const INITIAL_STAGE: StageState = {
  currentStageId: 1,
  isBossActive: false,
  autoChallengeBoss: true,
  maxStageReached: 1,
  monstersKilledInStage: 0,
  monstersRequiredForBoss: 10,
  bossTimeLeft: null,
  bossTimeLimit: 60,
};

// ============================================================================
// Component
// ============================================================================

export default function ClickAscensionGame() {
  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [activeView, setActiveView] = useState<ViewType>("BATTLE");
  const [player, setPlayer] = useState<PlayerState>(INITIAL_PLAYER);
  const [stage, setStage] = useState<StageState>(INITIAL_STAGE);
  const [monster, setMonster] = useState<Monster | null>(null);
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null); // Use GameConfig type
  const [lastAutoAttack, setLastAutoAttack] = useState<{
    time: number;
    damage: number;
    breakdown?: {
      mercenary: number;
      partner: number;
      archer: number;
      knight: number;
      player: number;
    };
  } | null>(null);

  // Auto-Click Visual Event (distinct from Auto-Attack DPS)
  const [lastAutoClickEvent, setLastAutoClickEvent] = useState<{
    id: string; // UUID to trigger effect
    damage: number;
    isCrit: boolean;
  } | null>(null);

  const [popup, setPopup] = useState<{ title: string; message: string } | null>(
    null
  );

  const showPopup = (message: string, title: string = "系統提示") =>
    setPopup({ title, message });

  // Initial Spawn Wait Flag? No, useEffect handles it below.

  // Derived Stats (Base + Equipment + Shop etc.)
  const effectiveStats = React.useMemo(() => {
    // Start with base stats from state, ensuring defaults
    const stats = {
      baseDamage: player.stats.baseDamage || 1,
      autoAttackDamage: player.stats.autoAttackDamage || 0,
      criticalChance: player.stats.criticalChance || 0.05,
      criticalDamage: player.stats.criticalDamage || 1.5,
      goldMultiplier: player.stats.goldMultiplier || 1.0,
      cpMultiplier: player.stats.cpMultiplier || 1.0,
      xpMultiplier: player.stats.xpMultiplier || 1.0,
      bossDamageMultiplier: player.stats.bossDamageMultiplier || 1.0,
      autoClickPerSec: player.stats.autoClickPerSec || 1,
      monsterKillReduction: player.stats.monsterKillReduction || 0,
      rareMonsterChance: player.stats.rareMonsterChance || 0,
    };

    if (!gameConfig?.equipments) return stats;

    // Add Equipment Bonuses
    Object.values(player.equipment.equipped).forEach((equippedId) => {
      if (!equippedId) return;
      // Ensure comparison is string-safe
      const config = gameConfig.equipments.find(
        (e: any) => String(e.ID) === String(equippedId)
      );
      if (config) {
        const level = Number(player.equipment.inventory[equippedId] || 1);
        const baseVal = Number(config.Base_Val || 0);
        const multVal = Number(config.Level_Mult || 0);
        const val = baseVal + (level - 1) * multVal;

        const effectType = String(config.Effect_Type || "")
          .toUpperCase()
          .trim();

        // Map effect types to stat fields (Handles multiple variations + User's specific sheet names)
        switch (effectType) {
          case "ADD_BASE_DMG":
          case "CLICK_DMG":
          case "CLICK_DAMAGE":
          case "ADD_DAMAGE":
          case "ADD_CLICK_DMG":
            stats.baseDamage += val;
            break;
          case "ADD_AUTO_DMG":
          case "AUTO_DMG":
          case "AUTO_DAMAGE":
          case "ADD_AUTO":
            stats.autoAttackDamage += val;
            break;
          case "ADD_CRIT_CHANCE":
          case "CRIT_RATE":
          case "ADD_CRIT_RATE":
          case "LUCK":
            stats.criticalChance += val / 100; // 5 -> +5%
            break;
          case "ADD_CRIT_DMG":
          case "CRIT_DMG":
          case "CRIT_DAMAGE":
          case "ADD_CRIT_DMG":
            stats.criticalDamage += val / 100; // 10 -> +10%
            break;
          case "ADD_GOLD_MULT":
          case "GOLD_MULT":
          case "ADD_GOLD":
          case "GOLD_BONUS":
            stats.goldMultiplier += val / 100; // 10 -> +10%
            break;
          case "ADD_XP_MULT":
          case "XP_MULT":
          case "ADD_XP":
          case "XP_BONUS":
            stats.xpMultiplier += val / 100; // 5 -> +5%
            break;
          case "ADD_BOSS_DMG":
          case "BOSS_DMG":
          case "BOSS_DAMAGE":
            stats.bossDamageMultiplier += val / 100; // 10 -> +10% (1.16 + 0.10 = 1.26)
            break;
          case "CP_MULT":
          case "CP_BONUS":
          case "ADD_CP_MULT":
            stats.cpMultiplier += val / 100; // 10 -> +10%
            break;

          // New Ascension / Special Stats
          case "REDUCE_GOAL_V":
          case "REDUCE_STAGE_GOAL":
            stats.monsterKillReduction += val;
            break;
          case "RARE_CHANCE_P":
          case "RARE_SPAWN_CHANCE":
          case "RARE_CHANCE":
            stats.rareMonsterChance += val / 100; // 10 -> +10%
            break;
          case "AUTO_CLICK_V":
          case "AUTO_CLICK_CPS":
            stats.autoClickPerSec += val;
            break;
          case "ADD_XP_MULT": // Explicit handling if not caught above (though XP_MULT was there, ADD_XP_MULT is new enum specific)
            stats.xpMultiplier += val / 100;
            break;
          case "ADD_GOLD_MULT":
            stats.goldMultiplier += val / 100;
            break;
        }
      }
    });

    return stats;
  }, [
    player.stats,
    player.equipment.equipped,
    player.equipment.inventory,
    gameConfig,
  ]);

  // Helper for deep merging player state (handles nested objects like stats, wallet, system)
  const deepMergePlayer = useCallback(
    (base: PlayerState, saved: any): PlayerState => {
      return {
        ...base,
        ...saved,
        system: { ...base.system, ...(saved.system || {}) },
        wallet: { ...base.wallet, ...(saved.wallet || {}) },
        stats: { ...base.stats, ...(saved.stats || {}) },
        records: { ...base.records, ...(saved.records || {}) },
        clickShop: { ...base.clickShop, ...(saved.clickShop || {}) },
        levelShop: { ...base.levelShop, ...(saved.levelShop || {}) },
        goldShop: { ...base.goldShop, ...(saved.goldShop || {}) },
        ascensionShop: {
          ...base.ascensionShop,
          ...(saved.ascensionShop || {}),
        },
        inventory: { ...base.inventory, ...(saved.inventory || {}) },
        activeBuffs: { ...base.activeBuffs, ...(saved.activeBuffs || {}) },
        equipment: {
          ...base.equipment,
          ...(saved.equipment || {}),
          inventory: {
            ...(base.equipment?.inventory || {}),
            ...(saved.equipment?.inventory || {}),
          },
          equipped: {
            ...(base.equipment?.equipped || {}),
            ...(saved.equipment?.equipped || {}),
          },
        },
      };
    },
    []
  );

  const totalDps = effectiveStats.autoAttackDamage;

  const combatPower = Math.floor(
    effectiveStats.baseDamage * 10 +
      totalDps * 20 +
      effectiveStats.criticalChance * 1000 +
      effectiveStats.criticalDamage * 500
  );

  // --------------------------------------------------------------------------
  // Effects
  // --------------------------------------------------------------------------

  // Update Monster when Stage changes (if needed) or respawn logic
  // Recalculate stats when GameConfig loads (ensures migrations/fixes apply)
  useEffect(() => {
    if (gameConfig) {
      console.log("[Recalc] GameConfig loaded, refreshing stats...");
      setPlayer((prev) => ({
        ...prev,
        stats: recalculateStats(prev),
      }));
    }
  }, [gameConfig]);

  // Auto-Login on Mount & Load Configs
  useEffect(() => {
    // 1. Load Configs
    const loadConfig = async () => {
      console.log("[Config] Loading...");
      const config = await clickAscensionApi.getGameConfigs();
      if (config) {
        console.log("[Config] Loaded:", config);
        setGameConfig(config);
      }
    };
    loadConfig();

    // 2. Auto-Login
    const lastId = localStorage.getItem("ca_last_user_id");
    if (lastId) {
      handleLogin(lastId);
    }
  }, []);

  // Helper to spawn monster
  // Wrap in useCallback to avoid dependency cycles if needed
  const spawnMonster = useCallback(() => {
    // 1. Determine if Boss
    let isBoss = stage.isBossActive;

    // Apply Reduction Stat
    // Ensure at least 1 minion must be killed (or 0 implies instant boss? User said "10-1=9", so >0). Let's set min 1.
    // Actually if they have Reduction 10 on 10 stage, maybe instant boss? User asked for "Denominator 10-1", so implies >0.
    const requiredKills = Math.max(
      1,
      stage.monstersRequiredForBoss - (effectiveStats.monsterKillReduction || 0)
    );

    // Auto-Challenge Boss Logic
    if (
      !isBoss &&
      stage.autoChallengeBoss &&
      stage.monstersKilledInStage >= requiredKills
    ) {
      isBoss = true;
      // Sync stage state to boss mode
      setStage((prev) => ({
        ...prev,
        isBossActive: true,
        bossTimeLeft: prev.bossTimeLimit,
      }));
    } else if (isBoss) {
      // If we ARE in boss mode but timer isn't set, set it
      if (stage.bossTimeLeft === null) {
        setStage((prev) => ({ ...prev, bossTimeLeft: prev.bossTimeLimit }));
      }
    }

    // 2. Get Template
    const template = getRandomMonsterFromConfig(
      stage.currentStageId,
      isBoss,
      gameConfig
    );

    // 3. Calculate Stats
    // Scaling: Base * (1.18 ^ (Level-1)) + (Level * 10)
    const growthFactor = 1.18;
    const baseHpCalc =
      20 * Math.pow(growthFactor, stage.currentStageId - 1) +
      stage.currentStageId * 10;

    // Apply Template Multipliers
    const finalHpRaw = baseHpCalc * template.hpMultiplier;
    const finalHp = Math.ceil(finalHpRaw);

    // 4. Rewards Base (modified by player stats on kill)
    // Storing base reward potential in monster object
    const baseGold = finalHp * 0.15 * template.goldMultiplier;
    const baseXp = finalHp * 0.08 * template.xpMultiplier;

    const newMonster: Monster = {
      id: crypto.randomUUID(),
      name: `${template.name} Lv.${stage.currentStageId}`,
      level: stage.currentStageId,
      maxHp: finalHp,
      currentHp: finalHp,
      isBoss: template.rarity === "BOSS",
      rewardGold: Math.max(1, Math.floor(baseGold)),
      rewardXp: Math.max(1, Math.floor(baseXp)),
      emoji: template.emoji,
      note: template.note, // Pass the note to the monster instance
    };

    setMonster(newMonster);
  }, [stage, effectiveStats.monsterKillReduction]);

  const [userId, setUserId] = useState<string | null>(null);

  // Initial Spawn
  useEffect(() => {
    if (!monster) {
      spawnMonster();
    }
  }, [monster, spawnMonster]);

  // Auto-Login on Mount
  useEffect(() => {
    const lastId = localStorage.getItem("ca_last_user_id");
    if (lastId) {
      handleLogin(lastId);
    }
  }, []);

  // Refs to hold latest state for Auto-Save without resetting the interval
  const playerRef = React.useRef(player);
  const stageRef = React.useRef(stage);
  const processedMonsterIds = React.useRef<Set<string>>(new Set());

  // Sync refs with state
  useEffect(() => {
    playerRef.current = player;
    stageRef.current = stage;
  }, [player, stage]);

  // Boss Battle Timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (stage.isBossActive && monster && monster.isBoss) {
      if (stage.bossTimeLeft === null) {
        // Should have been set in spawnMonster or handleChallengeBoss,
        // but as a safety measure:
        setStage((prev) => ({ ...prev, bossTimeLeft: prev.bossTimeLimit }));
      } else if (
        stage.bossTimeLeft !== undefined &&
        stage.bossTimeLeft !== null &&
        stage.bossTimeLeft > 0
      ) {
        timer = setInterval(() => {
          setStage((prev) => ({
            ...prev,
            bossTimeLeft:
              prev.bossTimeLeft !== undefined &&
              prev.bossTimeLeft !== null &&
              prev.bossTimeLeft > 0
                ? prev.bossTimeLeft - 1
                : 0,
          }));
        }, 1000);
      } else if (stage.bossTimeLeft === 0) {
        // Boss Time Out - Failure!
        setStage((prev) => ({
          ...prev,
          isBossActive: false,
          autoChallengeBoss: false,
          bossTimeLeft: null,
        }));
        setMonster(null); // Force respawn as minion
        showPopup(
          "挑戰失敗！Boss 挑戰時間超時，已回到關卡掛機模式並關閉自動挑戰。",
          "挑戰失敗"
        );
      }
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [stage.isBossActive, stage.bossTimeLeft, monster]);

  // Auto-Save Loop (30s)
  useEffect(() => {
    if (!userId) return;

    const interval = setInterval(async () => {
      console.log(`[AutoSave] Saving for ${userId} to Cloud...`);
      const saveData = {
        player: playerRef.current,
        stage: stageRef.current,
        timestamp: Date.now(),
      };

      // Cloud Save (Background, no alert)
      try {
        await clickAscensionApi.savePlayerProgress(userId, saveData as any);
        // Also backup to local just in case
        localStorage.setItem(`ca_save_${userId}`, JSON.stringify(saveData));
      } catch (_e) {
        console.warn("[AutoSave] Cloud save failed, using local backup", _e);
        localStorage.setItem(`ca_save_${userId}`, JSON.stringify(saveData));
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [userId]); // Only reset if userId changes

  const handleLogin = async (id: string) => {
    if (!id) return;
    setUserId(id);
    localStorage.setItem("ca_last_user_id", id);

    // 1. Try Cloud Load
    try {
      console.log(`[Login] Fetching cloud save for ${id}...`);
      const cloudData = await clickAscensionApi.loadPlayerSave(id);

      if (cloudData) {
        console.log(`[Login] Cloud save found!`);
        if (cloudData.player)
          setPlayer((prev) => deepMergePlayer(prev, cloudData.player));
        if (cloudData.stage)
          setStage((prev) => ({ ...prev, ...(cloudData.stage as any) }));
        return; // Success
      } else {
        console.log(`[Login] Cloud save not found or new user.`);
      }
    } catch (_e) {
      console.error("[Login] Cloud load error:", _e);
    }

    // 2. Fallback to Local Save
    const localStr = localStorage.getItem(`ca_save_${id}`);
    if (localStr) {
      console.log(`[Login] Found local backup.`);
      try {
        const localData = JSON.parse(localStr);
        setPlayer((prev) => ({ ...prev, ...localData.player }));
        setStage((prev) => ({ ...prev, ...localData.stage }));
      } catch (e) {}
    }
  };

  const handleLogout = () => {
    setUserId(null);
    localStorage.removeItem("ca_last_user_id");
    setPlayer(INITIAL_PLAYER);
    setStage(INITIAL_STAGE);
  };

  // Playtime Tracker (1s interval)
  useEffect(() => {
    const timer = setInterval(() => {
      setPlayer((prev) => ({
        ...prev,
        records: {
          ...prev.records,
          playtimeSeconds: (prev.records.playtimeSeconds || 0) + 1,
        },
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleManualSave = async () => {
    if (!userId) return;

    const saveData = {
      player,
      stage,
      timestamp: Date.now(),
    };

    try {
      // alert("☁️ 上傳中..."); // Removed to avoid blocking
      await clickAscensionApi.savePlayerProgress(userId, saveData);
      showPopup("✅ 上傳成功 (Cloud Save)");
      // Backup local
      localStorage.setItem(`ca_save_${userId}`, JSON.stringify(saveData));
    } catch (e) {
      console.error("Save failed", e);
      showPopup("❌ 上傳失敗，已存至本機備份。");
      localStorage.setItem(`ca_save_${userId}`, JSON.stringify(saveData));
    }
  }; // We can't directly call handleMonsterClick because it might expect event or be tied to click stats
  // Let's modify handleMonsterClick or create a separate damage handler.
  // For simplicity, let's just apply damage directly here or call a shared function.
  // But handleMonsterClick calculates damage inside. Let's refactor?
  // Minimally invasive: just apply damage.

  // Auto-Attack Loop
  useEffect(() => {
    // Determine if we have any auto-attack capability
    if (
      !monster ||
      monster.currentHp <= 0 ||
      effectiveStats.autoAttackDamage <= 0
    )
      return;

    const interval = setInterval(() => {
      // 1. Calculate Base Total Damage
      // Note: effectiveStats.autoAttackDamage already includes Ally Damage (Mercenaries, etc.)
      const baseTotalDmg = effectiveStats.autoAttackDamage;

      // 2. Apply Multipliers (Boss, etc.)
      const bossMult = monster.isBoss
        ? effectiveStats.bossDamageMultiplier || 1.0
        : 1.0;
      const finalTotalDmg = Math.ceil(baseTotalDmg * bossMult);

      // 3. Apply Damage to Monster
      setMonster((prev) => {
        if (!prev || prev.currentHp <= 0) return prev;
        const newHp = prev.currentHp - finalTotalDmg;

        if (newHp <= 0) {
          setTimeout(() => handleMonsterDeath(prev as Monster), 0);
          return { ...prev, currentHp: 0 };
        }
        return { ...prev, currentHp: Math.max(0, newHp) };
      });

      // 4. Update Records & Click Points
      setPlayer((prev) => {
        const cpGain = 1 * effectiveStats.cpMultiplier;
        return {
          ...prev,
          wallet: {
            ...prev.wallet,
            clickPoints: prev.wallet.clickPoints + cpGain,
          },
          records: {
            ...prev.records,
            totalDamageDealt: prev.records.totalDamageDealt + finalTotalDmg,
          },
        };
      });

      // 5. Trigger Visuals
      // Recalculate component parts for display only
      const mercDmg = (player.goldShop.mercenaryLevel || 0) * 2;
      const partnerDmg = (player.goldShop.partnerLevel || 0) * 5;
      const archerDmg = (player.goldShop.archerLevel || 0) * 20;
      const knightDmg = (player.goldShop.knightLevel || 0) * 100;
      const alliesTotal = mercDmg + partnerDmg + archerDmg + knightDmg;
      const playerDmg = Math.max(
        0,
        effectiveStats.autoAttackDamage - alliesTotal
      );

      setLastAutoAttack({
        time: Date.now(),
        damage: finalTotalDmg,
        breakdown: {
          mercenary: Math.ceil(mercDmg * bossMult),
          partner: Math.ceil(partnerDmg * bossMult),
          archer: Math.ceil(archerDmg * bossMult),
          knight: Math.ceil(knightDmg * bossMult),
          player: Math.ceil(playerDmg * bossMult),
        },
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [
    monster?.id,
    effectiveStats.autoAttackDamage,
    effectiveStats.bossDamageMultiplier,
    effectiveStats.cpMultiplier,
    player.goldShop.mercenaryLevel,
    player.goldShop.partnerLevel,
    player.goldShop.archerLevel,
    player.goldShop.knightLevel,
  ]);

  // NEW: Auto-Click Loop (Simulates Clicks)
  useEffect(() => {
    // Determine Frequency (Clicks per second)
    const clicksPerSec = effectiveStats.autoClickPerSec || 0;

    if (clicksPerSec <= 0 || !monster || monster.currentHp <= 0) return;

    // Calculate interval (ms)
    // Limit max to 20/sec (50ms) to avoid lag, or just run at rate.
    // If rate > 20, maybe we should bunch them? For now, standard interval.
    // Minimum 50ms interval to be safe.
    const intervalMs = Math.max(50, 1000 / clicksPerSec);

    const interval = setInterval(() => {
      // 1. Calculate Damage (Replicating User Click Logic)
      const isCrit = Math.random() < effectiveStats.criticalChance;
      // Check Rage Potion via Ref to avoid resetting interval on every player update
      const isRageActive =
        (playerRef.current?.activeBuffs?.ragePotionExpiresAt || 0) > Date.now();

      let dmg = isCrit
        ? Math.floor(effectiveStats.baseDamage * effectiveStats.criticalDamage)
        : effectiveStats.baseDamage;

      if (isRageActive) dmg *= 2;

      // 2. Apply Damage (Updates Monster & Player)
      // We call handleMonsterClick but we need to supply the damage directly?
      // No, wait. handleMonsterClick in this file TAKES 'damage' as arg1.
      // But handleMonsterClick also applies Boss Multiplier internally?
      // Let's check handleMonsterClick definition:
      // "const handleMonsterClick = (damage: number, _isCrit: boolean) => { ... if (isBoss) final = damage * bossMult; ... }"
      // So we should NOT pre-multiply by bossMult here.

      // HOWEVER, handleMonsterClick expects "Damage dealt".
      // User click logic in MonsterBattle likely sends Base * Crit.
      // So sending 'dmg' here is correct.

      // We can't call handleMonsterClick directly if it's not stable or updated with closure?
      // handleMonsterClick IS defined in component scope, so it should be fine inside this useEffect
      // BUT useEffect dependencies must include it?
      // handleMonsterClick updates 'setMonster' functional state so it's safer.
      // But for cleaner code, we'll replicate the logic:

      // Pre-calculate final damage using closure 'monster' (safe for static props like isBoss)
      let finalDmg = dmg;
      if (monster.isBoss) {
        finalDmg = Math.ceil(dmg * (effectiveStats.bossDamageMultiplier || 1));
      }

      setMonster((prev) => {
        if (!prev || prev.currentHp <= 0) return prev;
        const newHp = prev.currentHp - finalDmg;

        if (newHp <= 0) {
          setTimeout(() => handleMonsterDeath(prev as Monster), 0);
          return { ...prev, currentHp: 0 };
        }
        return { ...prev, currentHp: Math.max(0, newHp) };
      });

      // 3. Update Player (Click Points / Records)
      setPlayer((prev) => {
        const cpGain = 1 * effectiveStats.cpMultiplier;
        return {
          ...prev,
          wallet: {
            ...prev.wallet,
            clickPoints: prev.wallet.clickPoints + cpGain,
          },
          records: {
            ...prev.records,
            totalClicks: prev.records.totalClicks + 1, // Count as click
            totalDamageDealt: prev.records.totalDamageDealt + finalDmg,
          },
        };
      });

      // 4. Trigger Visual Event for MonsterBattle
      setLastAutoClickEvent({
        id: crypto.randomUUID(),
        damage: finalDmg, // Visuals should show final damage (including Boss Mult)
        isCrit: isCrit,
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [
    effectiveStats.autoClickPerSec,
    effectiveStats.baseDamage,
    effectiveStats.criticalChance,
    effectiveStats.criticalDamage,
    effectiveStats.bossDamageMultiplier,
    effectiveStats.cpMultiplier,
    monster?.id, // Reset if monster changes
    // handleMonsterDeath is stable? We use closure..
  ]);

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  // Helper to select a monster based on config
  const getRandomMonsterFromConfig = useCallback(
    (
      stageLevel: number,
      isBoss: boolean,
      config: GameConfig | null
    ): MonsterTemplate => {
      // Default fallback
      const fallback: MonsterTemplate = {
        name: "未知怪物",
        emoji: "❓",
        rarity: MonsterRarity.COMMON,
        hpMultiplier: 1,
        goldMultiplier: 1,
        xpMultiplier: 1,
      };

      if (!config || !config.monsters || config.monsters.length === 0) {
        // Fallback to legacy logic if no config? Or just return fallback.
        // Let's import the legacy logic as fallback if you wish, BUT user said "Should NOT use COMMON_MONSTERS".
        // So we rely on config. If no config, we might have issues (initially null).
        // Better to keep a minimal hardcoded fallback or wait for config load.
        // Actually, let's look at `MonsterData.ts` to see if we can use it as fallback.
        // User explicitly said "DO NOT USE COMMON_MONSTERS".
        return fallback;
      }

      // Filter suitable monsters
      const validMonsters = config.monsters.filter((m) => {
        // Check Stage Range
        const min = Number(m.Stage_Min) || 1;
        const max = Number(m.Stage_Max) || 9999;
        if (stageLevel < min || stageLevel > max) return false;

        // Check Rarity/Type
        // If isBoss is true, we look for BOSS type.
        // If isBoss is false, we look for COMMON or RARE?
        const r = (m.Rarity || "COMMON").toUpperCase();
        if (isBoss) {
          return r === "BOSS";
        } else {
          return r !== "BOSS"; // Common or Rare
        }
      });

      if (validMonsters.length === 0) return fallback;

      // Weighted Random Selection
      const totalWeight = validMonsters.reduce(
        (sum, m) => sum + (Number(m.Weight) || 0),
        0
      );

      let random = Math.random() * totalWeight;
      for (const m of validMonsters) {
        const w = Number(m.Weight) || 0;
        if (random < w) {
          // Debug log to check property names, especially Note
          console.log("Selected Monster Config:", m);
          return {
            name: m.Name,
            emoji: m.Emoji,
            rarity: (m.Rarity as MonsterRarity) || MonsterRarity.COMMON,
            hpMultiplier: Number(m.HP_Mult) || 1,
            goldMultiplier: Number(m.Gold_Mult) || 1,
            xpMultiplier: Number(m.XP_Mult) || 1,
            dropDiamonds: Number(m.Drop_Diamonds) || 0,
            note: m.Notes,
          };
        }
        random -= w;
      }

      return fallback;
    },
    []
  );

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  const handleMonsterClick = (damage: number, _isCrit: boolean) => {
    if (!monster || monster.currentHp <= 0) return;

    // Boss Multiplier is now applied in MonsterBattle component before calling this
    const finalDamage = damage;

    setMonster((prev) => {
      if (!prev || prev.currentHp <= 0) return prev;
      const newHp = Math.max(0, prev.currentHp - finalDamage);
      if (newHp <= 0) {
        setTimeout(() => handleMonsterDeath(prev), 0);
      }
      return { ...prev, currentHp: newHp };
    });

    // Update Stats
    setPlayer((prev) => ({
      ...prev,
      records: {
        ...prev.records,
        totalClicks: prev.records.totalClicks + 1,
        totalDamageDealt: prev.records.totalDamageDealt + finalDamage,
      },
      wallet: {
        ...prev.wallet,
        clickPoints: prev.wallet.clickPoints + 1 * effectiveStats.cpMultiplier,
      },
    }));
  };

  const handleMonsterDeath = (dyingMonster: Monster) => {
    // Accept monster as arg
    if (!dyingMonster) return;

    // Prevent double processing (Race condition between Auto/Manual)
    if (processedMonsterIds.current.has(dyingMonster.id)) return;
    processedMonsterIds.current.add(dyingMonster.id);
    // Cleanup old IDs periodically
    if (processedMonsterIds.current.size > 50)
      processedMonsterIds.current.clear();

    const goldGain = Math.ceil(
      dyingMonster.rewardGold * effectiveStats.goldMultiplier
    );
    const xpGain = Math.ceil(
      dyingMonster.rewardXp * effectiveStats.xpMultiplier
    );

    // Handle Rewards & Level Up
    setPlayer((prev) => {
      let { level, currentXp, requiredXp } = prev.system;
      let { levelPoints } = prev.wallet;
      currentXp += xpGain;

      // Level Up Logic
      while (currentXp >= requiredXp) {
        currentXp -= requiredXp;
        level += 1;
        levelPoints += 5;
        requiredXp = Math.floor(requiredXp * 1.2);
      }

      return {
        ...prev,
        wallet: {
          ...prev.wallet,
          gold: prev.wallet.gold + goldGain,
          levelPoints,
        },
        system: { ...prev.system, level, currentXp, requiredXp },
        records: {
          ...prev.records,
          monstersKilled: prev.records.monstersKilled + 1,
          totalGoldEarned: prev.records.totalGoldEarned + goldGain,
          bossesKilled: dyingMonster.isBoss
            ? prev.records.bossesKilled + 1
            : prev.records.bossesKilled,
          maxStageReached: dyingMonster.isBoss
            ? Math.max(prev.records.maxStageReached, dyingMonster.level + 1)
            : prev.records.maxStageReached,
        },
      };
    });

    // Handle Stage Progression
    setStage((prev) => {
      // If we just killed a Boss, advance stage!
      if (dyingMonster.isBoss) {
        return {
          ...prev,
          currentStageId: dyingMonster.level + 1,
          maxStageReached: Math.max(
            prev.maxStageReached,
            dyingMonster.level + 1
          ),
          isBossActive: false, // Reset boss status (back to farming next stage)
          monstersKilledInStage: 0, // Reset kill count
          bossTimeLeft: null,
        };
      }

      // If killed minion, just increment count
      const newKillCount = prev.monstersKilledInStage + 1;
      return {
        ...prev,
        monstersKilledInStage: newKillCount,
      };
    });

    setMonster(null); // Trigger respawn
  };

  const handleShopPurchase = (itemId: string) => {
    // Daily Check-in Logic
    if (itemId === "daily_checkin") {
      setPlayer((prev) => ({
        ...prev,
        wallet: {
          ...prev.wallet,
          diamonds: prev.wallet.diamonds + 10,
          gold: prev.wallet.gold + 500,
        },
        lastDailyRewardClaimTime: Date.now(),
      }));
      return;
    }

    // --- Level Shop (Talent) Upgrades ---
    // --- CLICK SHOP (Dynamic from Sheet) ---
    if (itemId.startsWith("click_shop_")) {
      const config = gameConfig?.upgrades?.find((u: any) => u.ID === itemId);
      if (!config) return;

      const currentLevel = player.clickShop[itemId] || 0;
      const maxLevel = Number(config.Max_Level || 0);

      // Max Level Check
      if (maxLevel > 0 && currentLevel >= maxLevel) {
        showPopup("已達最大等級！");
        return;
      }

      // Cost Calculation (Sync with ShopPage.tsx)
      const base = Number(config.Cost_Base || 0);
      const mult = Number(config.Cost_Mult || 0);
      let cost = 0;

      if (mult === 1 || mult === 1.0) {
        cost = Math.floor(base + currentLevel);
      } else {
        cost = Math.floor(base * Math.pow(mult, currentLevel));
      }

      const currency = config.Currency || "CP";
      const getWalletVal = (w: any, c: string) => {
        if (c === "GOLD") return w.gold;
        if (c === "LP") return w.levelPoints;
        if (c === "DIAMOND") return w.diamonds;
        if (c === "AP") return w.ascensionPoints;
        return w.clickPoints;
      };

      if (getWalletVal(player.wallet, currency) >= cost) {
        setPlayer((prev) => {
          const newStats = { ...prev.stats };
          const effectType = config.Effect_Type;
          const val = Number(config.Effect_Val || 0);

          if (effectType === "ADD_DAMAGE" || effectType === "CLICK_DMG")
            newStats.baseDamage += val;
          if (effectType === "ADD_CRIT_DMG" || effectType === "CRIT_DMG")
            newStats.criticalDamage += val / 100;
          if (effectType === "ADD_GOLD" || effectType === "GOLD_MULT")
            newStats.goldMultiplier += val / 100;
          if (effectType === "AUTO_CLICK_V") newStats.autoClickPerSec += val;
          if (effectType === "REDUCE_GOAL_V")
            newStats.monsterKillReduction += val;
          if (effectType === "RARE_CHANCE_P")
            newStats.rareMonsterChance += val / 100;

          const newWallet = { ...prev.wallet };
          if (currency === "GOLD") newWallet.gold -= cost;
          else if (currency === "LP") newWallet.levelPoints -= cost;
          else if (currency === "DIAMOND") newWallet.diamonds -= cost;
          else if (currency === "AP") newWallet.ascensionPoints -= cost;
          else newWallet.clickPoints -= cost; // Default CP

          return {
            ...prev,
            wallet: newWallet,
            clickShop: { ...prev.clickShop, [itemId]: currentLevel + 1 },
            stats: newStats,
          };
        });
      } else {
        showPopup(`${currency} 不足！`);
      }
      return;
    }

    // --- LEVEL SHOP (Dynamic from Sheet) ---
    if (itemId.startsWith("level_shop_")) {
      const config = gameConfig?.upgrades?.find((u: any) => u.ID === itemId);
      if (!config) return;

      const currentLevel = player.levelShop[itemId] || 0;
      const maxLevel = Number(config.Max_Level || 0);

      // Max Level Check
      if (maxLevel > 0 && currentLevel >= maxLevel) {
        showPopup("已達最大等級！");
        return;
      }

      // Cost Calculation (Sync with ShopPage.tsx)
      const base = Number(config.Cost_Base || 0);
      const mult = Number(config.Cost_Mult || 0);
      let cost = 0;

      if (mult === 1 || mult === 1.0) {
        cost = Math.floor(base + currentLevel);
      } else {
        cost = Math.floor(base * Math.pow(mult, currentLevel));
      }

      const currency = config.Currency || "LP";
      const getWalletVal = (w: any, c: string) => {
        if (c === "GOLD") return w.gold;
        if (c === "CP") return w.clickPoints;
        if (c === "DIAMOND") return w.diamonds;
        if (c === "AP") return w.ascensionPoints;
        return w.levelPoints;
      };

      if (getWalletVal(player.wallet, currency) >= cost) {
        setPlayer((prev) => {
          const newStats = { ...prev.stats };
          const effectType = config.Effect_Type;
          const val = Number(config.Effect_Val || 0);

          if (effectType === "ADD_XP" || effectType === "XP_MULT")
            newStats.xpMultiplier += val / 100;
          if (effectType === "ADD_GOLD" || effectType === "GOLD_MULT")
            newStats.goldMultiplier += val / 100;
          if (effectType === "ADD_AUTO" || effectType === "AUTO_DMG")
            newStats.autoAttackDamage += val;
          if (effectType === "ADD_BOSS_DMG" || effectType === "BOSS_DMG")
            newStats.bossDamageMultiplier += val / 100;
          if (effectType === "ADD_CRIT" || effectType === "CRIT_RATE")
            newStats.criticalChance += val / 100;
          if (effectType === "AUTO_CLICK_V") newStats.autoClickPerSec += val;
          if (effectType === "REDUCE_GOAL_V")
            newStats.monsterKillReduction += val;
          if (effectType === "RARE_CHANCE_P")
            newStats.rareMonsterChance += val / 100;

          const newWallet = { ...prev.wallet };
          if (currency === "GOLD") newWallet.gold -= cost;
          else if (currency === "CP") newWallet.clickPoints -= cost;
          else if (currency === "DIAMOND") newWallet.diamonds -= cost;
          else if (currency === "AP") newWallet.ascensionPoints -= cost;
          else newWallet.levelPoints -= cost; // Default LP

          return {
            ...prev,
            wallet: newWallet,
            levelShop: { ...prev.levelShop, [itemId]: currentLevel + 1 },
            stats: newStats,
          };
        });
      } else {
        showPopup(`${currency} 不足！`);
      }
      return;
    }

    // --- Gold (Diamond) Shop Items ---
    const shopItem = [
      {
        id: "gold_pack_1",
        cost: 10,
        reward: 1000,
        type: "GOLD",
        currency: "DIAMOND",
      },
      {
        id: "gold_pack_2",
        cost: 80,
        reward: 10000,
        type: "GOLD",
        currency: "DIAMOND",
      },
    ].find((i) => i.id === itemId);

    if (shopItem) {
      if (
        shopItem.currency === "DIAMOND" &&
        player.wallet.diamonds >= shopItem.cost
      ) {
        setPlayer((prev) => ({
          ...prev,
          wallet: {
            ...prev.wallet,
            diamonds: prev.wallet.diamonds - shopItem.cost,
            gold: prev.wallet.gold + shopItem.reward,
          },
        }));
      }
    }

    // --- GOLD SPENDING SHOP (New) ---
    if (itemId.startsWith("gold_shop_") || itemId.startsWith("gold_potion_")) {
      const { goldShop } = player;
      let cost = 0;

      switch (itemId) {
        // 1. Weapon Upgrade (+1 Base Dmg)
        case "gold_shop_weapon":
          cost = Math.floor(10 * Math.pow(1.2, goldShop.weaponLevel));
          if (player.wallet.gold >= cost) {
            setPlayer((prev) => ({
              ...prev,
              wallet: { ...prev.wallet, gold: prev.wallet.gold - cost },
              goldShop: {
                ...prev.goldShop,
                weaponLevel: prev.goldShop.weaponLevel + 1,
              },
              stats: { ...prev.stats, baseDamage: prev.stats.baseDamage + 1 },
            }));
          }
          break;

        // 2. Mercenary (+2 Auto)
        case "gold_shop_mercenary":
          cost = Math.floor(100 * Math.pow(1.3, goldShop.mercenaryLevel));
          if (player.wallet.gold >= cost) {
            setPlayer((prev) => ({
              ...prev,
              wallet: { ...prev.wallet, gold: prev.wallet.gold - cost },
              goldShop: {
                ...prev.goldShop,
                mercenaryLevel: prev.goldShop.mercenaryLevel + 1,
              },
              stats: {
                ...prev.stats,
                autoAttackDamage: prev.stats.autoAttackDamage + 2,
              },
            }));
          }
          break;

        // 3. Partner (+5 Auto)
        case "gold_shop_partner":
          cost = Math.floor(500 * Math.pow(1.3, goldShop.partnerLevel));
          if (player.wallet.gold >= cost) {
            setPlayer((prev) => ({
              ...prev,
              wallet: { ...prev.wallet, gold: prev.wallet.gold - cost },
              goldShop: {
                ...prev.goldShop,
                partnerLevel: prev.goldShop.partnerLevel + 1,
              },
              stats: {
                ...prev.stats,
                autoAttackDamage: prev.stats.autoAttackDamage + 5,
              },
            }));
          }
          break;

        // 4. Archer (+20 Auto) - Cost: 2000 * 1.4^L
        case "gold_shop_archer":
          cost = Math.floor(2000 * Math.pow(1.4, goldShop.archerLevel || 0));
          if (player.wallet.gold >= cost) {
            setPlayer((prev) => ({
              ...prev,
              wallet: { ...prev.wallet, gold: prev.wallet.gold - cost },
              goldShop: {
                ...prev.goldShop,
                archerLevel: (prev.goldShop.archerLevel || 0) + 1,
              },
              stats: {
                ...prev.stats,
                autoAttackDamage: prev.stats.autoAttackDamage + 20,
              },
            }));
          }
          break;

        // 5. Knight (+100 Auto) - Cost: 10000 * 1.5^L
        case "gold_shop_knight":
          cost = Math.floor(10000 * Math.pow(1.5, goldShop.knightLevel || 0));
          if (player.wallet.gold >= cost) {
            setPlayer((prev) => ({
              ...prev,
              wallet: { ...prev.wallet, gold: prev.wallet.gold - cost },
              goldShop: {
                ...prev.goldShop,
                knightLevel: (prev.goldShop.knightLevel || 0) + 1,
              },
              stats: {
                ...prev.stats,
                autoAttackDamage: prev.stats.autoAttackDamage + 100,
              },
            }));
          }
          break;

        // 6. Amulet (+5% Gold) - Cost: 5000 * 1.5^L
        case "gold_shop_amulet":
          cost = Math.floor(5000 * Math.pow(1.5, goldShop.amuletLevel || 0));
          if (player.wallet.gold >= cost) {
            setPlayer((prev) => ({
              ...prev,
              wallet: { ...prev.wallet, gold: prev.wallet.gold - cost },
              goldShop: {
                ...prev.goldShop,
                amuletLevel: (prev.goldShop.amuletLevel || 0) + 1,
              },
              stats: {
                ...prev.stats,
                goldMultiplier: prev.stats.goldMultiplier + 0.05,
              },
            }));
          }
          break;

        // 7. Rage Potion
        case "gold_potion_rage":
          cost = 500;
          if (player.wallet.gold >= cost) {
            setPlayer((prev) => ({
              ...prev,
              wallet: { ...prev.wallet, gold: prev.wallet.gold - cost },
              inventory: {
                ...prev.inventory,
                ragePotionCount: prev.inventory.ragePotionCount + 1,
              },
            }));
          }
          break;
      }
    }

    // --- EQUIPMENT GACHA (Basic / Advanced / Premium) ---
    if (itemId.startsWith("gacha_equipment_")) {
      let drawCount = 1;
      if (itemId.endsWith("_10")) drawCount = 10;
      if (itemId.endsWith("_100")) drawCount = 100;

      let boxType = "basic";
      if (itemId.includes("advanced")) boxType = "advanced";
      if (itemId.includes("premium")) boxType = "premium";

      let costPerDraw = 1000;
      if (boxType === "advanced") costPerDraw = 10000;
      if (boxType === "premium") costPerDraw = 100000;

      const totalCost = costPerDraw * drawCount;

      if (player.wallet.gold >= totalCost) {
        const allEquipments = gameConfig?.equipments || [];
        if (allEquipments.length > 0) {
          const validEquipments = allEquipments.filter((e) => {
            const r = (e.Rarity || "COMMON").toUpperCase();
            if (boxType === "basic") {
              // Basic: Up to Epic (Exclude L, M)
              return r !== "LEGENDARY" && r !== "MYTHIC";
            }
            if (boxType === "advanced") {
              // Advanced: Up to Legendary (Exclude M)
              return r !== "MYTHIC";
            }
            if (boxType === "premium") {
              // Premium: Up to Mythic (Includes all)
              return true;
            }
            return true;
          });

          if (validEquipments.length === 0) {
            showPopup("此箱子目前沒有可抽取的裝備設定。");
            return;
          }

          // Calculate total weight (assuming static for all draws)
          const totalWeight = validEquipments.reduce(
            (sum, item) => sum + (Number(item.Gacha_Weight) || 0),
            0
          );

          const newInventory = { ...player.equipment.inventory };
          const wonItems: any[] = [];
          const convertedItems: any[] = []; // Track items converted to shards
          let gainedShards = 0;

          for (let i = 0; i < drawCount; i++) {
            let random = Math.random() * totalWeight;
            let selectedItem = validEquipments[0];

            for (const item of validEquipments) {
              const w = Number(item.Gacha_Weight) || 0;
              if (random < w) {
                selectedItem = item;
                break;
              }
              random -= w;
            }

            wonItems.push(selectedItem);

            // Logic: Check Max Level
            const currentLevel = newInventory[selectedItem.ID] || 0;
            const maxLevel = Number(selectedItem.Max_Level) || 10; // Default max level 10 if not set

            if (currentLevel >= maxLevel) {
              // Convert to Shard based on Rarity
              const rarity = (selectedItem.Rarity || "COMMON").toUpperCase();
              let shardAmount = 1;
              switch (rarity) {
                case "COMMON":
                  shardAmount = 1;
                  break;
                case "UNCOMMON":
                  shardAmount = 3;
                  break;
                case "RARE":
                  shardAmount = 10;
                  break;
                case "EPIC":
                  shardAmount = 50;
                  break;
                case "LEGENDARY":
                  shardAmount = 200;
                  break;
                case "MYTHIC":
                  shardAmount = 1000;
                  break;
                default:
                  shardAmount = 1;
              }

              gainedShards += shardAmount;
              convertedItems.push({ item: selectedItem, shards: shardAmount });
            } else {
              // Upgrade
              newInventory[selectedItem.ID] = currentLevel + 1;
            }
          }

          setPlayer((prev) => ({
            ...prev,
            wallet: {
              ...prev.wallet,
              gold: prev.wallet.gold - totalCost,
              equipmentShards:
                (prev.wallet.equipmentShards || 0) + gainedShards,
            },
            equipment: {
              ...prev.equipment,
              inventory: newInventory,
            },
          }));

          if (drawCount === 1) {
            if (convertedItems.length > 0) {
              const info = convertedItems[0];
              showPopup(
                `獲得裝備：${info.item.Name} (已滿級)\n自動轉換為：🧩 裝備碎片 x${info.shards}`,
                "獲得裝備"
              );
            } else {
              showPopup(
                `獲得裝備：${wonItems[0].Name} (Rarity: ${wonItems[0].Rarity})`,
                "獲得裝備"
              );
            }
          } else {
            // Summary for multi-draw
            const summary: Record<string, number> = {};
            wonItems.forEach((item) => {
              summary[item.Name] = (summary[item.Name] || 0) + 1;
            });

            let summaryStr = Object.entries(summary)
              .map(([name, count]) => `${name} x${count}`)
              .join("\n");

            if (gainedShards > 0) {
              summaryStr += `\n\n🧩 獲得碎片: ${gainedShards} (滿級轉化)`;
            }

            showPopup(
              `獲得 ${drawCount} 件裝備${boxType === "premium" ? "(頂級)" : boxType === "advanced" ? "(高級)" : ""}：\n${summaryStr}`,
              "獲得裝備"
            );
          }
        } else {
          showPopup("暫無裝備可抽取");
        }
      } else {
        showPopup("金幣不足！");
      }
    }

    // --- ASCENSION SHOP (Dynamic from Sheet) ---
    // Update: Check for both legacy "ascension_shop_" and new short "asc_" prefixes
    if (itemId.startsWith("ascension_shop_") || itemId.startsWith("asc_")) {
      const config = gameConfig?.upgrades?.find((u: any) => u.ID === itemId);
      if (!config) return;

      const currentLevel = player.ascensionShop[itemId] || 0;
      const maxLevel = Number(config.Max_Level || 0);

      // Max Level Check
      if (maxLevel > 0 && currentLevel >= maxLevel) {
        showPopup("已達最大等級！");
        return;
      }

      // Cost Calculation
      const base = Number(config.Cost_Base || 0);
      const mult = Number(config.Cost_Mult || 0);
      let cost = 0;

      if (mult === 1 || mult === 1.0) {
        cost = Math.floor(base + currentLevel);
      } else {
        cost = Math.floor(base * Math.pow(mult, currentLevel));
      }

      const currency = config.Currency || "AP";
      const getWalletVal = (w: any, c: string) => {
        if (c === "GOLD") return w.gold;
        if (c === "CP") return w.clickPoints;
        if (c === "LP") return w.levelPoints;
        if (c === "DIAMOND") return w.diamonds;
        return w.ascensionPoints;
      };

      if (getWalletVal(player.wallet, currency) >= cost) {
        setPlayer((prev) => {
          const newStats = { ...prev.stats };
          const effectType = config.Effect_Type;
          const val = Number(config.Effect_Val || 0);

          if (effectType === "ADD_CRIT" || effectType === "CRIT_RATE")
            newStats.criticalChance += val / 100;
          if (effectType === "ADD_DAMAGE" || effectType === "CLICK_DMG")
            newStats.baseDamage += val;
          if (effectType === "ADD_GOLD" || effectType === "GOLD_MULT")
            newStats.goldMultiplier += val / 100;
          if (effectType === "ADD_XP" || effectType === "XP_MULT")
            newStats.xpMultiplier += val / 100;

          // New Stats
          if (effectType === "REDUCE_GOAL_V")
            newStats.monsterKillReduction += val;
          if (effectType === "RARE_CHANCE_P")
            newStats.rareMonsterChance += val / 100;
          if (effectType === "AUTO_CLICK_V") newStats.autoClickPerSec += val;

          const newWallet = { ...prev.wallet };
          if (currency === "GOLD") newWallet.gold -= cost;
          else if (currency === "CP") newWallet.clickPoints -= cost;
          else if (currency === "LP") newWallet.levelPoints -= cost;
          else if (currency === "DIAMOND") newWallet.diamonds -= cost;
          else newWallet.ascensionPoints -= cost; // Default AP

          return {
            ...prev,
            wallet: newWallet,
            ascensionShop: {
              ...prev.ascensionShop,
              [itemId]: currentLevel + 1,
            },
            stats: newStats,
          };
        });
      } else {
        showPopup(`${currency} 不足！`);
      }
    }
  };

  const handleEquip = (itemId: string, slot: EquipmentSlot) => {
    setPlayer((prev) => ({
      ...prev,
      equipment: {
        ...prev.equipment,
        equipped: {
          ...prev.equipment.equipped,
          [slot]: itemId,
        },
      },
    }));
  };

  const handleUnequip = (slot: EquipmentSlot) => {
    setPlayer((prev) => {
      const newEquipped = { ...prev.equipment.equipped };
      delete newEquipped[slot];
      return {
        ...prev,
        equipment: {
          ...prev.equipment,
          equipped: newEquipped,
        },
      };
    });
  };

  const handleUsePotion = (type: "RAGE") => {
    if (type === "RAGE" && player.inventory.ragePotionCount > 0) {
      setPlayer((prev) => ({
        ...prev,
        inventory: {
          ...prev.inventory,
          ragePotionCount: prev.inventory.ragePotionCount - 1,
        },
        activeBuffs: {
          ...prev.activeBuffs,
          ragePotionExpiresAt: Date.now() + 30000,
        },
      }));
    }
  };

  const recalculateStats = (p: PlayerState) => {
    const stats = { ...INITIAL_PLAYER.stats };

    // 1. Add Gold Shop bonuses (temporary)
    stats.baseDamage += (p.goldShop.weaponLevel || 0) * 1;
    stats.autoAttackDamage +=
      (p.goldShop.mercenaryLevel || 0) * 2 +
      (p.goldShop.partnerLevel || 0) * 5 +
      (p.goldShop.archerLevel || 0) * 20 +
      (p.goldShop.knightLevel || 0) * 100;
    stats.goldMultiplier += (p.goldShop.amuletLevel || 0) * 0.05;

    // 2. Add Permanent Shop bonuses (Click, Level, Ascension)
    const shops = ["clickShop", "levelShop", "ascensionShop"] as const;
    shops.forEach((shopKey) => {
      Object.entries(p[shopKey]).forEach(([id, level]) => {
        const config = gameConfig?.upgrades?.find((u: any) => u.ID === id);
        if (config && level > 0) {
          const effectType = config.Effect_Type;
          const totalVal = Number(config.Effect_Val || 0) * level;

          if (effectType === "ADD_DAMAGE" || effectType === "CLICK_DMG")
            stats.baseDamage += totalVal;
          if (effectType === "ADD_CRIT" || effectType === "CRIT_RATE")
            stats.criticalChance += totalVal / 100;
          if (effectType === "ADD_CRIT_DMG" || effectType === "CRIT_DMG")
            stats.criticalDamage += totalVal / 100;
          if (effectType === "ADD_GOLD" || effectType === "GOLD_MULT")
            stats.goldMultiplier += totalVal / 100;
          if (effectType === "ADD_XP" || effectType === "XP_MULT")
            stats.xpMultiplier += totalVal / 100;
          if (effectType === "ADD_AUTO" || effectType === "AUTO_DMG")
            stats.autoAttackDamage += totalVal;
          if (effectType === "ADD_BOSS_DMG" || effectType === "BOSS_DMG")
            stats.bossDamageMultiplier += totalVal / 100;

          // New Ascension Stats
          if (effectType === "REDUCE_GOAL_V")
            stats.monsterKillReduction += totalVal;
          if (effectType === "RARE_CHANCE_P")
            stats.rareMonsterChance += totalVal / 100;
          if (effectType === "AUTO_CLICK_V") stats.autoClickPerSec += totalVal;
        }
      });
    });

    return stats;
  };

  const handleAscension = () => {
    const points = potentialPoints;
    if (points <= 0) return;

    setPlayer((prev) => {
      const nextPlayer: PlayerState = {
        ...prev,
        system: {
          level: 1,
          currentXp: 0,
          requiredXp: 100,
        },
        wallet: {
          ...prev.wallet,
          gold: 0,
          levelPoints: 0, // Reset Level Points (等級點數重製)
          ascensionPoints: (prev.wallet.ascensionPoints || 0) + points,
          equipmentShards: prev.wallet.equipmentShards || 0, // Keep shards
        },
        // Reset Gold Shop (Temporary upgrades)
        goldShop: {
          weaponLevel: 0,
          mercenaryLevel: 0,
          partnerLevel: 0,
          archerLevel: 0,
          knightLevel: 0,
          amuletLevel: 0,
        },
        levelShop: {}, // Reset level shop upgrades (等級商店重製)
        activeBuffs: {
          ragePotionExpiresAt: 0,
        },
        // inventory, equipment, and clickShop are preserved
      };

      // Recalculate stats based on new state
      nextPlayer.stats = recalculateStats(nextPlayer);
      return nextPlayer;
    });

    setStage((prev) => ({
      ...prev,
      currentStageId: 1,
      monstersKilledInStage: 0,
      isBossActive: false,
      maxStageReached: 1,
    }));

    setMonster(null);
    showPopup(
      `⚡ 渡劫成功！獲得 ${points.toLocaleString()} 點飛昇點數！\n等級與等級點數已重製，裝備與點擊加成已保留。`,
      "渡劫成功"
    );
    setActiveView("BATTLE");
  };

  const handleResetLevelPoints = () => {
    if (
      !window.confirm(
        "確定要重製等級積分嗎？\n所有已分配的點數將會返還，您可以重新分配天賦。"
      )
    )
      return;

    setPlayer((prev) => {
      let refundedPoints = 0;
      Object.entries(prev.levelShop).forEach(([id, level]) => {
        const config = gameConfig?.upgrades?.find((u: any) => u.ID === id);
        if (config) {
          for (let i = 0; i < level; i++) {
            const cost = Math.floor(
              config.Cost_Base * Math.pow(config.Cost_Mult, i)
            );
            refundedPoints += cost;
          }
        }
      });

      const nextPlayer: PlayerState = {
        ...prev,
        wallet: {
          ...prev.wallet,
          levelPoints: prev.wallet.levelPoints + refundedPoints,
        },
        levelShop: {},
      };

      nextPlayer.stats = recalculateStats(nextPlayer);
      return nextPlayer;
    });

    showPopup("✅ 等級積分已重製！");
  };

  const potentialPoints = React.useMemo(() => {
    const baseAmount = 10;
    const multiplier = 1.2;
    const deduct = 0;
    const exponent = Math.max(0, stage.maxStageReached - deduct);
    return Math.floor(baseAmount * Math.pow(multiplier, exponent));
  }, [stage.maxStageReached]);

  const handleAscensionClick = () => {
    if (potentialPoints <= 0) {
      showPopup("尚未達到飛升條件！");
      return;
    }
    if (
      window.confirm(
        `確定要渡劫飛升嗎？\n\n將重置關卡與金幣，並獲得 ${potentialPoints.toLocaleString()} 點飛升點數！`
      )
    ) {
      handleAscension();
    }
  };

  const handleChallengeBoss = () => {
    setStage((prev) => ({
      ...prev,
      isBossActive: true,
      bossTimeLeft: prev.bossTimeLimit || 60,
    }));
    setMonster(null); // Force spawn boss
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="ca-game-container">
      {/* Header */}
      <Header
        player={player}
        combatPower={combatPower}
        stageId={stage.currentStageId}
        onAvatarClick={() => setActiveModal("PROFILE")}
        onAscension={handleAscensionClick}
        potentialPoints={potentialPoints}
      />

      {/* Main Content Area */}
      {activeView === "BATTLE" ? (
        <MonsterBattle
          monster={monster}
          stageId={stage.currentStageId}
          onMonsterClick={handleMonsterClick}
          baseDamage={effectiveStats.baseDamage}
          criticalChance={effectiveStats.criticalChance}
          criticalDamage={effectiveStats.criticalDamage}
          bossDamageMultiplier={effectiveStats.bossDamageMultiplier || 1}
          monstersKilled={stage.monstersKilledInStage}
          monstersRequired={Math.max(
            1,
            stage.monstersRequiredForBoss -
              (effectiveStats.monsterKillReduction || 0)
          )}
          isBossActive={stage.isBossActive}
          mercenaryLevel={player.goldShop.mercenaryLevel}
          partnerLevel={player.goldShop.partnerLevel}
          archerLevel={player.goldShop.archerLevel}
          knightLevel={player.goldShop.knightLevel}
          potionCount={player.inventory.ragePotionCount}
          activeBuffs={player.activeBuffs}
          onUsePotion={() => handleUsePotion("RAGE")}
          lastAutoAttack={lastAutoAttack}
          lastAutoClickEvent={lastAutoClickEvent}
          bossTimeLeft={stage.bossTimeLeft}
          bossTimeLimit={stage.bossTimeLimit}
          onChallengeBoss={handleChallengeBoss}
        />
      ) : (
        <CharacterView
          player={player}
          effectiveStats={effectiveStats}
          userId={userId}
          gameConfig={gameConfig}
          onEquip={handleEquip}
          onUnequip={handleUnequip}
        />
      )}

      {/* Footer Navigation */}
      <FooterNav
        activeView={activeView}
        onSwitchView={setActiveView}
        onOpenModal={setActiveModal}
      />

      {/* Profile Modal */}
      <Modal
        isOpen={activeModal === "PROFILE"}
        onClose={() => setActiveModal(null)}
        title="玩家資料"
      >
        <ProfilePage
          player={player}
          effectiveStats={effectiveStats}
          combatPower={combatPower}
          userId={userId}
          onLogin={handleLogin}
          onLogout={handleLogout}
          onManualSave={handleManualSave}
          gameConfig={gameConfig}
        />
      </Modal>

      {/* Shop Modal */}
      <Modal
        isOpen={activeModal === "SHOP"}
        onClose={() => setActiveModal(null)}
        title="商店"
        headerContent={
          <div
            className="ca-shop-currency-bar"
            style={{
              display: "flex",
              flexWrap: "wrap",
              border: "none",
              background: "transparent",
              padding: "0 8px",
              gap: "12px",
            }}
          >
            <div
              className="ca-currency ca-currency-gold"
              style={{ fontSize: "0.8rem" }}
              title="金幣"
            >
              <span>💰</span>
              <span>{Math.floor(player.wallet.gold).toLocaleString()}</span>
            </div>
            <div
              className="ca-currency ca-currency-diamond"
              style={{ fontSize: "0.8rem" }}
              title="鑽石"
            >
              <span>💎</span>
              <span>{player.wallet.diamonds.toLocaleString()}</span>
            </div>
            <div
              className="ca-currency"
              style={{
                fontSize: "0.8rem",
                color: "var(--ca-accent-cyan, #22d3ee)",
              }}
              title="點擊點數"
            >
              <span>⚡</span>
              <span>
                {Math.floor(player.wallet.clickPoints).toLocaleString()}
              </span>
            </div>
            <div
              className="ca-currency"
              style={{ fontSize: "0.8rem", color: "#4ade80" }}
              title="等級積分"
            >
              <span>🆙</span>
              <span>{player.wallet.levelPoints.toLocaleString()}</span>
            </div>
            <div
              className="ca-currency"
              style={{ fontSize: "0.8rem", color: "#d8b4fe" }}
              title="飛昇點數"
            >
              <span>🕊️</span>
              <span>{player.wallet.ascensionPoints.toLocaleString()}</span>
            </div>
            <div
              className="ca-currency"
              style={{ fontSize: "0.8rem", color: "#fca5a5" }}
              title="裝備碎片"
            >
              <span>🧩</span>
              <span>
                {(player.wallet.equipmentShards || 0).toLocaleString()}
              </span>
            </div>
          </div>
        }
      >
        <ShopPage
          player={player}
          onPurchase={handleShopPurchase}
          onResetLevelPoints={handleResetLevelPoints}
          gameConfig={gameConfig}
        />
      </Modal>

      {/* Popup Alert Replacement */}
      <Modal
        isOpen={!!popup}
        onClose={() => setPopup(null)}
        title={popup?.title || "系統提示"}
      >
        <div
          style={{
            textAlign: "center",
            padding: "20px",
            fontSize: "1.1rem",
            color: "#e2e8f0",
            whiteSpace: "pre-wrap",
          }}
        >
          {popup?.message}
          <div style={{ marginTop: "24px" }}>
            <button
              className="ca-btn ca-btn-primary"
              style={{ padding: "8px 32px" }}
              onClick={() => setPopup(null)}
            >
              確定
            </button>
          </div>
        </div>
      </Modal>

      {/* Inventory removed from modal, now inline in CharacterView */}
    </div>
  );
}
