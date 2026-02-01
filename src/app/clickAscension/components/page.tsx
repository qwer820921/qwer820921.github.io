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
import {
  formatBigNumber,
  initNumberFormatFromConfig,
} from "../utils/formatNumber";
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
  goldShop: {}, // 動態夥伴等級，會自動根據 API 返回的項目儲存
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
  autoUsePotion: false,
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
    breakdown?: Record<string, number>; // 動態夥伴傷害分解，key 為夥伴 ID 或 "player"
  } | null>(null);

  // Auto-Click Visual Event (distinct from Auto-Attack DPS)
  const [lastAutoClickEvent, setLastAutoClickEvent] = useState<{
    id: string; // UUID to trigger effect
    damage: number;
    isCrit: boolean;
  } | null>(null);

  const [popup, setPopup] = useState<{
    title: string;
    message: string;
    isAutoGacha?: boolean;
    gachaResults?: {
      summary: Record<string, number>;
      gainedShards: number;
      boxType: string;
      drawCount: number;
    } | null;
  } | null>(null);

  const [autoGachaBox, setAutoGachaBox] = useState<string | null>(null);

  const showPopup = (
    message: string,
    title: string = "系統提示",
    isAutoGacha: boolean = false,
    gachaResults: any = null
  ) => setPopup({ title, message, isAutoGacha, gachaResults });

  // Initial Spawn Wait Flag? No, useEffect handles it below.

  // Derived Stats (Base + Equipment + Shop etc.)
  const effectiveStats = React.useMemo(() => {
    // Start with base stats from state, ensuring defaults
    // NOTE: autoAttackDamage starts at 0 because only partners/allies provide it
    const stats = {
      baseDamage: player.stats.baseDamage || 1,
      autoAttackDamage: 0, // Always 0 - only partners provide auto attack damage
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

    // Add Gold Shop bonuses (partners/units) - 動態從 gameConfig 讀取
    // 遍歷所有 GOLD 類型的升級項目
    const goldShopConfigs =
      gameConfig?.upgrades?.filter((u: any) => u.Shop_Type === "GOLD") || [];

    goldShopConfigs.forEach((config: any) => {
      const id = config.ID;
      const level = player.goldShop[id] || 0;
      if (level <= 0) return;

      // Use config values - DB is the only source of truth
      const effectType = String(config.Effect_Type || "")
        .toUpperCase()
        .trim();
      // 每25級傷害翻倍（等級25=x2, 50=x4, 75=x8...）
      const levelMultiplier = Math.pow(2, Math.floor(level / 25));
      const baseVal = Number(config.Effect_Val || 0) * level;
      const val = baseVal * levelMultiplier;

      if (
        effectType === "ADD_DAMAGE" ||
        effectType === "CLICK_DMG" ||
        effectType === "ADD_BASE_DMG"
      )
        stats.baseDamage += val;
      if (
        effectType === "ADD_AUTO_DMG" ||
        effectType === "AUTO_DMG" ||
        effectType === "ADD_AUTO"
      )
        stats.autoAttackDamage += val;
      if (
        effectType === "ADD_GOLD_MULT" ||
        effectType === "GOLD_MULT" ||
        effectType === "ADD_GOLD"
      )
        stats.goldMultiplier += val / 100;
      if (
        effectType === "ADD_CRIT_DMG" ||
        effectType === "CRIT_DMG" ||
        effectType === "ADD_CRIT_DAMAGE"
      )
        stats.criticalDamage += val / 100;
    });

    // Add Level Shop bonuses - 動態從 gameConfig 讀取
    const levelShopConfigs =
      gameConfig?.upgrades?.filter((u: any) => u.Shop_Type === "LEVEL") || [];

    levelShopConfigs.forEach((config: any) => {
      const id = config.ID;
      const level = player.levelShop[id] || 0;
      if (level <= 0) return;

      const effectType = String(config.Effect_Type || "")
        .toUpperCase()
        .trim();
      const val = Number(config.Effect_Val || 0) * level;

      if (effectType === "ADD_XP_MULT" || effectType === "XP_MULT")
        stats.xpMultiplier += val / 100;
      if (
        effectType === "ADD_GOLD_MULT" ||
        effectType === "GOLD_MULT" ||
        effectType === "ADD_GOLD"
      )
        stats.goldMultiplier += val / 100;
      if (effectType === "ADD_BASE_DMG" || effectType === "ADD_DAMAGE")
        stats.baseDamage += val;
      if (effectType === "ADD_CRIT_CHANCE" || effectType === "CRIT_RATE")
        stats.criticalChance += val / 100;
      if (effectType === "ADD_CRIT_DMG" || effectType === "CRIT_DMG")
        stats.criticalDamage += val / 100;
    });

    // Add Click Shop bonuses - 動態從 gameConfig 讀取
    const clickShopConfigs =
      gameConfig?.upgrades?.filter((u: any) => u.Shop_Type === "CLICK") || [];

    clickShopConfigs.forEach((config: any) => {
      const id = config.ID;
      const level = player.clickShop[id] || 0;
      if (level <= 0) return;

      const effectType = String(config.Effect_Type || "")
        .toUpperCase()
        .trim();
      const val = Number(config.Effect_Val || 0) * level;

      if (
        effectType === "ADD_BASE_DMG" ||
        effectType === "ADD_DAMAGE" ||
        effectType === "CLICK_DMG"
      )
        stats.baseDamage += val;
      if (
        effectType === "ADD_CRIT_DMG" ||
        effectType === "CRIT_DMG" ||
        effectType === "ADD_CRIT_DAMAGE"
      )
        stats.criticalDamage += val / 100;
      if (effectType === "ADD_GOLD_MULT" || effectType === "GOLD_MULT")
        stats.goldMultiplier += val / 100;
      if (effectType === "ADD_XP_MULT" || effectType === "XP_MULT")
        stats.xpMultiplier += val / 100;
    });

    // Add Ascension Shop bonuses - 動態從 gameConfig 讀取
    const ascensionShopConfigs =
      gameConfig?.upgrades?.filter((u: any) => u.Shop_Type === "ASCENSION") ||
      [];

    ascensionShopConfigs.forEach((config: any) => {
      const id = config.ID;
      const level = player.ascensionShop[id] || 0;
      if (level <= 0) return;

      const effectType = String(config.Effect_Type || "")
        .toUpperCase()
        .trim();
      const val = Number(config.Effect_Val || 0) * level;

      if (effectType === "ADD_XP_MULT" || effectType === "XP_MULT")
        stats.xpMultiplier += val / 100;
      if (
        effectType === "ADD_GOLD_MULT" ||
        effectType === "GOLD_MULT" ||
        effectType === "ADD_GOLD"
      )
        stats.goldMultiplier += val / 100;
      if (
        effectType === "ADD_ATK_P" ||
        effectType === "ATK_MULT" ||
        effectType === "ADD_DAMAGE_MULT"
      ) {
        // 攻擊力百分比加成（例如 10% -> 基礎傷害 * 1.1）
        stats.baseDamage += stats.baseDamage * (val / 100);
      }
      if (effectType === "RARE_CHANCE_P" || effectType === "RARE_SPAWN_CHANCE")
        stats.rareMonsterChance += val / 100;
      if (effectType === "REDUCE_GOAL_V" || effectType === "REDUCE_STAGE_GOAL")
        stats.monsterKillReduction += val;
      if (effectType === "AUTO_CLICK_V" || effectType === "AUTO_CLICK_CPS")
        stats.autoClickPerSec += val;
    });

    return stats;
  }, [
    player.stats,
    player.equipment.equipped,
    player.equipment.inventory,
    player.goldShop,
    player.levelShop,
    player.clickShop,
    player.ascensionShop,
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

        // 初始化數值單位格式
        initNumberFormatFromConfig(config.settings);
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
    // Logic: Auto-challenge if enabled OR if we've already beaten this stage level before (farming low levels)
    // "自動打boss 除非沒有打過 才會出現 挑戰boss的按鈕" = If cleared, auto. If new, depends on auto setting.
    const isStageCleared = stage.currentStageId < stage.maxStageReached;
    const shouldAutoChallenge = stage.autoChallengeBoss || isStageCleared;

    if (
      !isBoss &&
      shouldAutoChallenge &&
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
      configId: template.configId,
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
      if (stage.bossTimeLeft === null || stage.bossTimeLeft === undefined) {
        setStage((prev) => ({
          ...prev,
          bossTimeLeft: prev.bossTimeLimit || 60,
        }));
      } else if (stage.bossTimeLeft > 0) {
        timer = setInterval(() => {
          setStage((prev) => ({
            ...prev,
            bossTimeLeft:
              (prev.bossTimeLeft ?? 0) > 0 ? (prev.bossTimeLeft ?? 0) - 1 : 0,
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
  }, [stage.isBossActive, stage.bossTimeLeft, monster?.id, monster?.isBoss]);

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

  // Auto-Use Potion Logic
  useEffect(() => {
    if (!stage.autoUsePotion || player.inventory.ragePotionCount <= 0) return;

    const checkInterval = setInterval(() => {
      const now = Date.now();
      const expiresAt = player.activeBuffs.ragePotionExpiresAt || 0;

      // If expired (or about to expire in less than 500ms) and we have potions
      if (now >= expiresAt && player.inventory.ragePotionCount > 0) {
        handleUsePotion("RAGE");
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [
    stage.autoUsePotion,
    player.inventory.ragePotionCount,
    player.activeBuffs.ragePotionExpiresAt,
  ]);

  // Auto-Gacha Loop
  useEffect(() => {
    if (!autoGachaBox) return;

    const interval = setInterval(() => {
      const boxCosts: Record<string, number> = {
        basic: 1000 * 1000,
        advanced: 10000 * 1000,
        premium: 100000 * 1000,
      };

      if (player.wallet.gold < boxCosts[autoGachaBox]) {
        setAutoGachaBox(null);
        showPopup("金幣不足，已停止自動連續抽卡。");
        return;
      }

      handleShopPurchase(`gacha_equipment_${autoGachaBox}_1000`);
    }, 1000);

    return () => clearInterval(interval);
  }, [autoGachaBox, player.wallet.gold]);

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
      // 動態計算各夥伴傷害 - 從 gameConfig 讀取
      const breakdown: Record<string, number> = {};
      let alliesTotal = 0;

      const autoPartners =
        gameConfig?.upgrades?.filter(
          (u: any) => u.Shop_Type === "GOLD" && u.Effect_Type === "ADD_AUTO_DMG"
        ) || [];

      autoPartners.forEach((config: any) => {
        const id = config.ID;
        const level = player.goldShop[id] || 0;
        if (level <= 0) return;

        // 每25級傷害翻倍（等級25=x2, 50=x4, 75=x8...）
        const levelMultiplier = Math.pow(2, Math.floor(level / 25));
        const dmg = Number(config.Effect_Val || 0) * level * levelMultiplier;
        breakdown[id] = Math.ceil(dmg * bossMult);
        alliesTotal += dmg;
      });

      const playerDmg = Math.max(
        0,
        effectiveStats.autoAttackDamage - alliesTotal
      );
      breakdown["player"] = Math.ceil(playerDmg * bossMult);

      setLastAutoAttack({
        time: Date.now(),
        damage: finalTotalDmg,
        breakdown,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [
    monster?.id,
    effectiveStats.autoAttackDamage,
    effectiveStats.bossDamageMultiplier,
    effectiveStats.cpMultiplier,
    player.goldShop,
    gameConfig,
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
        configId: "fallback",
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
            configId: m.ID,
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

    // --- GOLD SPENDING SHOP (Dynamic from Config) ---
    if (itemId.startsWith("gold_shop_") || itemId.startsWith("gold_potion_")) {
      const { goldShop } = player;

      // Try to find config from gameConfig first
      const config = gameConfig?.upgrades?.find((u: any) => u.ID === itemId);

      if (config) {
        // 直接使用 itemId 作為 goldShop 的 key（動態格式）
        const currentLevel = goldShop[itemId] || 0;
        const maxLevel = Number(config.Max_Level || 0);

        if (maxLevel > 0 && currentLevel >= maxLevel) {
          showPopup("已達最大等級！");
          return;
        }

        const base = Number(config.Cost_Base || 0);
        const mult = Number(config.Cost_Mult || 1);
        let cost = 0;

        if (config.Effect_Type === "ADD_INVENTORY") {
          cost = base; // Fixed cost for consumables
        } else if (mult === 1 || mult === 1.0) {
          cost = Math.floor(base + currentLevel);
        } else {
          cost = Math.floor(base * Math.pow(mult, currentLevel));
        }

        if (player.wallet.gold >= cost) {
          setPlayer((prev) => {
            const newStats = { ...prev.stats };
            const effectType = config.Effect_Type;
            const val = Number(config.Effect_Val || 0);

            // Apply effects
            if (effectType === "ADD_DAMAGE") newStats.baseDamage += val;
            if (effectType === "ADD_AUTO_DMG") newStats.autoAttackDamage += val;
            if (effectType === "ADD_GOLD_MULT")
              newStats.goldMultiplier += val / 100;
            if (effectType === "ADD_INVENTORY") {
              // Handled below for inventory items
            }

            // 直接使用 itemId 作為 key
            const newGoldShop = { ...prev.goldShop };
            newGoldShop[itemId] = (prev.goldShop[itemId] || 0) + 1;

            const newInventory = { ...prev.inventory };
            if (effectType === "ADD_INVENTORY") {
              if (itemId === "gold_potion_rage") {
                newInventory.ragePotionCount =
                  (newInventory.ragePotionCount || 0) + 1;
              }
            }

            return {
              ...prev,
              wallet: { ...prev.wallet, gold: prev.wallet.gold - cost },
              goldShop: newGoldShop,
              stats: newStats,
              inventory: newInventory,
            };
          });
        } else {
          showPopup("金幣不足！");
        }
        return;
      }

      // If we reach here, the item was not found in gameConfig
      // This should not happen if the shop UI only shows items from gameConfig
      console.warn(
        `[handleShopPurchase] Gold shop item not found in config: ${itemId}`
      );
    }

    // --- EQUIPMENT GACHA (Basic / Advanced / Premium) ---
    if (itemId.startsWith("gacha_equipment_")) {
      let drawCount = 1;
      if (itemId.endsWith("_10")) drawCount = 10;
      if (itemId.endsWith("_100")) drawCount = 100;
      if (itemId.endsWith("_1000")) drawCount = 1000;

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
              "獲得裝備",
              !!autoGachaBox,
              {
                summary,
                gainedShards,
                boxType,
                drawCount,
              }
            );
          }
        } else {
          showPopup("暫無裝備可抽取");
        }
      } else {
        showPopup("金幣不足！");
        if (autoGachaBox) setAutoGachaBox(null);
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

    // 1. Add Gold Shop bonuses (temporary) - Use gameConfig if available
    const goldShopItems = [
      { id: "gold_shop_weapon", levelKey: "weaponLevel" },
      { id: "gold_shop_mercenary", levelKey: "mercenaryLevel" },
      { id: "gold_shop_partner", levelKey: "partnerLevel" },
      { id: "gold_shop_archer", levelKey: "archerLevel" },
      { id: "gold_shop_knight", levelKey: "knightLevel" },
      { id: "gold_shop_warlord", levelKey: "warlordLevel" },
      { id: "gold_shop_oracle", levelKey: "oracleLevel" },
      { id: "gold_shop_void", levelKey: "voidLevel" },
      { id: "gold_shop_titan", levelKey: "titanLevel" },
      { id: "gold_shop_amulet", levelKey: "amuletLevel" },
    ];

    goldShopItems.forEach(({ id, levelKey }) => {
      const level = (p.goldShop as any)[levelKey] || 0;
      if (level <= 0) return;

      const config = gameConfig?.upgrades?.find((u: any) => u.ID === id);
      if (config) {
        // Use config values - DB is the only source of truth
        const effectType = config.Effect_Type;
        const val = Number(config.Effect_Val || 0) * level;

        if (effectType === "ADD_DAMAGE" || effectType === "CLICK_DMG")
          stats.baseDamage += val;
        if (
          effectType === "ADD_AUTO_DMG" ||
          effectType === "AUTO_DMG" ||
          effectType === "ADD_AUTO"
        )
          stats.autoAttackDamage += val;
        if (effectType === "ADD_GOLD_MULT" || effectType === "GOLD_MULT")
          stats.goldMultiplier += val / 100;
        if (effectType === "ADD_CRIT_DMG" || effectType === "CRIT_DMG")
          stats.criticalDamage += val / 100;
      }
      // No fallback - if config not found, the item has no effect
    });

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
          warlordLevel: 0,
          oracleLevel: 0,
          voidLevel: 0,
          titanLevel: 0,
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
      bossTimeLeft: null,
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
      autoChallengeBoss: true, // Resume auto-challenge on manual trigger
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
        userId={userId}
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
          goldShop={player.goldShop}
          gameConfig={gameConfig}
          potionCount={player.inventory.ragePotionCount}
          activeBuffs={player.activeBuffs}
          onUsePotion={() => handleUsePotion("RAGE")}
          lastAutoAttack={lastAutoAttack}
          lastAutoClickEvent={lastAutoClickEvent}
          bossTimeLeft={stage.bossTimeLeft}
          bossTimeLimit={stage.bossTimeLimit}
          onChallengeBoss={handleChallengeBoss}
          autoUsePotion={stage.autoUsePotion}
          onToggleAutoPotion={() =>
            setStage((prev) => ({
              ...prev,
              autoUsePotion: !prev.autoUsePotion,
            }))
          }
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
              <span>
                {formatBigNumber(Math.floor(player.wallet.gold), 2, 1000)}
              </span>
            </div>
            <div
              className="ca-currency ca-currency-diamond"
              style={{ fontSize: "0.8rem" }}
              title="鑽石"
            >
              <span>💎</span>
              <span>{formatBigNumber(player.wallet.diamonds, 2, 1000)}</span>
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
                {formatBigNumber(
                  Math.floor(player.wallet.clickPoints),
                  2,
                  1000
                )}
              </span>
            </div>
            <div
              className="ca-currency"
              style={{ fontSize: "0.8rem", color: "#4ade80" }}
              title="等級積分"
            >
              <span>🆙</span>
              <span>{formatBigNumber(player.wallet.levelPoints, 2, 1000)}</span>
            </div>
            <div
              className="ca-currency"
              style={{ fontSize: "0.8rem", color: "#d8b4fe" }}
              title="飛昇點數"
            >
              <span>🕊️</span>
              <span>
                {formatBigNumber(player.wallet.ascensionPoints, 2, 1000)}
              </span>
            </div>
            <div
              className="ca-currency"
              style={{ fontSize: "0.8rem", color: "#fca5a5" }}
              title="裝備碎片"
            >
              <span>🧩</span>
              <span>
                {formatBigNumber(player.wallet.equipmentShards || 0, 2, 1000)}
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
          autoGachaBox={autoGachaBox}
          onToggleAutoGacha={(box) => setAutoGachaBox(box)}
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
            textAlign: popup?.gachaResults ? "left" : "center",
            padding: "20px",
            fontSize: "1rem",
            color: "#e2e8f0",
            maxHeight: "60vh",
            overflowY: "auto",
          }}
        >
          {!popup?.gachaResults ? (
            <div style={{ whiteSpace: "pre-wrap" }}>{popup?.message}</div>
          ) : (
            <div>
              <div
                style={{
                  fontSize: "1.2rem",
                  fontWeight: "bold",
                  color: "#fbbf24",
                  marginBottom: "16px",
                  textAlign: "center",
                }}
              >
                🎊 連抽結果摘要 ({popup.gachaResults.drawCount} 抽)
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                  gap: "10px",
                  marginBottom: "20px",
                }}
              >
                {Object.entries(popup.gachaResults.summary).map(
                  ([name, count]) => (
                    <div
                      key={name}
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.1)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: "0.9rem" }}>{name}</span>
                      <span
                        style={{
                          color: "#10b981",
                          fontWeight: "bold",
                          fontSize: "0.8rem",
                        }}
                      >
                        x{count}
                      </span>
                    </div>
                  )
                )}
              </div>

              {popup.gachaResults.gainedShards > 0 && (
                <div
                  style={{
                    background: "rgba(16, 185, 129, 0.1)",
                    padding: "12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    fontWeight: "bold",
                  }}
                >
                  <span style={{ fontSize: "1.2rem" }}>🧩</span>
                  <span style={{ color: "#34d399" }}>
                    轉化獲得碎片: {popup.gachaResults.gainedShards}
                  </span>
                </div>
              )}
            </div>
          )}

          <div
            style={{
              marginTop: "24px",
              display: "flex",
              justifyContent: "center",
              gap: "12px",
              position: "sticky",
              bottom: 0,
              background: "var(--ca-bg-modal, #1e293b)",
              paddingTop: "12px",
            }}
          >
            {popup?.isAutoGacha && (
              <button
                className="ca-btn"
                style={{
                  padding: "10px 24px",
                  background: "linear-gradient(to bottom, #ef4444, #b91c1c)",
                  color: "white",
                  border: "none",
                  fontWeight: "bold",
                  boxShadow: "0 0 15px rgba(239, 68, 68, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
                onClick={() => {
                  setAutoGachaBox(null);
                  setPopup(null);
                }}
              >
                <span>⏹️</span> 停止自動抽取
              </button>
            )}
            <button
              className="ca-btn ca-btn-primary"
              style={{
                padding: "10px 32px",
                minWidth: "120px",
                fontWeight: "bold",
              }}
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
