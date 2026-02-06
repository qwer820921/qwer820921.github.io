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
  UpgradeEffectType,
  UpgradeShopType,
  CurrencyType,
  HitMode,
} from "../types";
import {
  formatBigNumber,
  initNumberFormatFromConfig,
} from "../utils/formatNumber";
import { applyEffect } from "../utils/effectMapper";
import {
  hasSufficientFunds,
  deductCurrency,
  addCurrency,
  resetWallet,
} from "../utils/walletManager";
import { calculateUpgradeCost } from "../utils/costCalculator";
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
    apMultiplier: 1.0,
    bossDamageMultiplier: 1.0,
    autoClickPerSec: 1, // Start with 1 auto click
    monsterKillReduction: 0,
    rareMonsterChance: 0,
    equipDamageMultiplier: 0,
    atkPercentBonus: 0,
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
      apMultiplier: player.stats.apMultiplier || 1.0,
      bossDamageMultiplier: player.stats.bossDamageMultiplier || 1.0,
      autoClickPerSec: player.stats.autoClickPerSec || 1,
      monsterKillReduction: player.stats.monsterKillReduction || 0,
      rareMonsterChance: player.stats.rareMonsterChance || 0,
      equipDamageMultiplier: player.stats.equipDamageMultiplier || 0,
      atkPercentBonus: player.stats.atkPercentBonus || 0,
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

        // Map effect types to stat fields (使用 enum 對應)
        switch (effectType) {
          case UpgradeEffectType.ADD_BASE_DMG:
            stats.baseDamage += val;
            break;
          case UpgradeEffectType.ADD_AUTO_DMG:
            stats.autoAttackDamage += val;
            break;
          case UpgradeEffectType.ADD_CRIT_CHANCE:
            stats.criticalChance += val / 100; // 5 -> +5%
            break;
          case UpgradeEffectType.ADD_CRIT_DMG:
            stats.criticalDamage += val / 100; // 10 -> +10%
            break;
          case UpgradeEffectType.ADD_GOLD:
          case UpgradeEffectType.ADD_GOLD_MULT:
            stats.goldMultiplier += val / 100; // 10 -> +10%
            break;
          case UpgradeEffectType.ADD_XP_MULT:
            stats.xpMultiplier += val / 100; // 5 -> +5%
            break;
          case UpgradeEffectType.ADD_BOSS_DMG:
            stats.bossDamageMultiplier += val / 100; // 10 -> +10%
            break;
          case UpgradeEffectType.REDUCE_GOAL_V:
            stats.monsterKillReduction += val;
            break;
          case UpgradeEffectType.RARE_CHANCE_P:
            stats.rareMonsterChance += val / 100; // 10 -> +10%
            break;
          case UpgradeEffectType.AUTO_CLICK_V:
            stats.autoClickPerSec += val;
            break;
          case UpgradeEffectType.EQUIP_DMG_MULT:
            stats.equipDamageMultiplier += val; // val 本身就是百分比數值 (如 100 代表 100%)
            break;
        }
      }
    });

    // Add damage bonuses with milestone multiplier - 動態從 gameConfig 讀取
    // 只篩選有里程碑傷害設定的 ADD_BASE_DMG 和 ADD_AUTO_DMG 類型（不限商店）
    const damageUpgradeConfigs =
      gameConfig?.upgrades?.filter(
        (u: any) =>
          u.Effect_Type === UpgradeEffectType.ADD_BASE_DMG ||
          u.Effect_Type === UpgradeEffectType.ADD_AUTO_DMG
      ) || [];

    damageUpgradeConfigs.forEach((config: any) => {
      const id = config.ID;
      const shopType = String(config.Shop_Type || "").toUpperCase();
      // 根據 Shop_Type 動態讀取對應商店的等級
      const shopMap: Record<string, Record<string, number>> = {
        GOLD: player.goldShop,
        LEVEL: player.levelShop,
        CLICK: player.clickShop,
        ASCENSION: player.ascensionShop,
      };
      const level = shopMap[shopType]?.[id] || 0;
      if (level <= 0) return;

      // Use config values - DB is the only source of truth
      const effectType = config.Effect_Type;
      // 里程碑傷害加成（從 DB 讀取 Milestone_Level 和 Milestone_Mult）
      const milestoneLevel = Number(config.Milestone_Level || 0);
      const milestoneMult = Number(config.Milestone_Mult || 1);
      const levelMultiplier = milestoneLevel > 0
        ? Math.pow(milestoneMult, Math.floor(level / milestoneLevel))
        : 1;
      const baseVal = Number(config.Effect_Val || 0) * level;
      const val = baseVal * levelMultiplier;

      // 根據 Effect_Type 加成對應屬性
      if (effectType === UpgradeEffectType.ADD_BASE_DMG) stats.baseDamage += val;
      if (effectType === UpgradeEffectType.ADD_AUTO_DMG) stats.autoAttackDamage += val;
    });

    // Add Level Shop bonuses - 動態從 gameConfig 讀取
    const levelShopConfigs =
      gameConfig?.upgrades?.filter((u: any) => u.Shop_Type === UpgradeShopType.LEVEL) || [];

    levelShopConfigs.forEach((config: any) => {
      const id = config.ID;
      const level = player.levelShop[id] || 0;
      if (level <= 0) return;

      const effectType = config.Effect_Type;
      const val = Number(config.Effect_Val || 0) * level;

      if (effectType === UpgradeEffectType.ADD_XP_MULT)
        stats.xpMultiplier += val / 100;
      if (effectType === UpgradeEffectType.ADD_GOLD_MULT || effectType === UpgradeEffectType.ADD_GOLD)
        stats.goldMultiplier += val / 100;
      if (effectType === UpgradeEffectType.ADD_BASE_DMG)
        stats.baseDamage += val;
      if (effectType === UpgradeEffectType.ADD_CRIT_CHANCE)
        stats.criticalChance += val / 100;
      if (effectType === UpgradeEffectType.ADD_CRIT_DMG)
        stats.criticalDamage += val / 100;
      if (effectType === UpgradeEffectType.ADD_BOSS_DMG)
        stats.bossDamageMultiplier += val / 100;
      if (effectType === UpgradeEffectType.AUTO_CLICK_V)
        stats.autoClickPerSec += val;
    });

    // Add Click Shop bonuses - 動態從 gameConfig 讀取
    const clickShopConfigs =
      gameConfig?.upgrades?.filter((u: any) => u.Shop_Type === UpgradeShopType.CLICK) || [];

    clickShopConfigs.forEach((config: any) => {
      const id = config.ID;
      const level = player.clickShop[id] || 0;
      if (level <= 0) return;

      const effectType = config.Effect_Type;
      const val = Number(config.Effect_Val || 0) * level;

      if (effectType === UpgradeEffectType.ADD_BASE_DMG)
        stats.baseDamage += val;
      if (effectType === UpgradeEffectType.ADD_CRIT_DMG)
        stats.criticalDamage += val / 100;
      if (effectType === UpgradeEffectType.ADD_GOLD_MULT || effectType === UpgradeEffectType.ADD_GOLD)
        stats.goldMultiplier += val / 100;
      if (effectType === UpgradeEffectType.ADD_XP_MULT)
        stats.xpMultiplier += val / 100;
    });

    // Add Ascension Shop bonuses - 動態從 gameConfig 讀取
    const ascensionShopConfigs =
      gameConfig?.upgrades?.filter((u: any) => u.Shop_Type === UpgradeShopType.ASCENSION) ||
      [];



    // 最後應用裝備百分比傷害加成 (獨立乘區)
    if (stats.equipDamageMultiplier > 0) {
      stats.baseDamage = Math.floor(
        stats.baseDamage * (1 + stats.equipDamageMultiplier / 100)
      );
    }

    // Apply Active Buffs (Potions)
    if (player.activeBuffs && player.activeBuffs.ragePotionExpiresAt > Date.now()) {
      // 狂暴藥水: 雙倍傷害
      stats.baseDamage *= 2;
    }

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
    player.activeBuffs.ragePotionExpiresAt,
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
      stage.monstersRequiredForBoss - Math.floor(effectiveStats.monsterKillReduction || 0)
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
    // 從 DB settings 讀取掉落率（可動態調整）
    const settings = gameConfig?.settings as Record<string, any> || {};
    const goldDropRate = Number(settings.GOLD_DROP_RATE ?? 0.15);
    const xpDropRate = Number(settings.XP_DROP_RATE ?? 0.08);
    
    const baseGold = finalHp * goldDropRate * template.goldMultiplier;
    const baseXp = finalHp * xpDropRate * template.xpMultiplier;

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

  // Buff Expiration Logic
  useEffect(() => {
    if (player.activeBuffs.ragePotionExpiresAt > 0) {
      const interval = setInterval(() => {
        if (Date.now() > player.activeBuffs.ragePotionExpiresAt) {
          setPlayer((prev) => ({
            ...prev,
            activeBuffs: {
              ...prev.activeBuffs,
              ragePotionExpiresAt: 0,
            },
          }));
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [player.activeBuffs.ragePotionExpiresAt]);

  // Auto-Gacha Loop
  useEffect(() => {
    if (!autoGachaBox) return;

    const interval = setInterval(() => {
      // Parse autoGachaBox: e.g. "basic_ap", "adv_diamond", "prem_ap"
      const parts = autoGachaBox.split("_");
      if (parts.length < 2) return;

      const boxShort = parts[0]; // basic, adv, prem
      const currencyShort = parts[1]; // ap, diamond

      const isDiamond =
        currencyShort === "diamond" || currencyShort === "dia";
      const currencyType = isDiamond ? CurrencyType.DIAMOND : CurrencyType.AP;

      // Calculate Cost (100 draws)
      const s = (gameConfig?.settings as any) || {};
      const boxKey = boxShort.toUpperCase(); // BASIC, ADV, PREM
      const currencyKey = isDiamond ? "DIAMOND" : "AP";

      // Default Base Costs
      const baseMap: any = {
        BASIC: isDiamond ? 2 : 20,
        ADV: isDiamond ? 20 : 200,
        PREM: isDiamond ? 100 : 1000,
      };

      const configKey = `GACHA_COST_${boxKey}_${currencyKey}`;
      const unitCost = Number(s[configKey]) || baseMap[boxKey] || 999999;
      const totalCost = unitCost * 100;

      // Check Funds
      const currentFunds = isDiamond
        ? player.wallet.diamonds
        : player.wallet.ascensionPoints;

      if (currentFunds < totalCost) {
        setAutoGachaBox(null);
        showPopup(
          `${isDiamond ? "💎 鑽石" : "🕊️ 飛昇點數"} 不足，已停止自動連續抽卡。`
        );
        return;
      }

      // Execute Purchase (100 draws)
      handleShopPurchase(`gacha_${boxShort}_${currencyShort}_100`);
    }, 1000); // 1 second interval

    return () => clearInterval(interval);
  }, [
    autoGachaBox,
    player.wallet.diamonds,
    player.wallet.ascensionPoints,
    gameConfig,
  ]);

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
          (u: any) =>
            u.Shop_Type === UpgradeShopType.GOLD &&
            u.Effect_Type === UpgradeEffectType.ADD_AUTO_DMG
        ) || [];

      autoPartners.forEach((config: any) => {
        const id = config.ID;
        const level = player.goldShop[id] || 0;
        if (level <= 0) return;

        // 里程碑傷害加成（從 DB 讀取 Milestone_Level 和 Milestone_Mult）
        const milestoneLevel = Number(config.Milestone_Level || 0);
        const milestoneMult = Number(config.Milestone_Mult || 1);
        const levelMultiplier = milestoneLevel > 0
          ? Math.pow(milestoneMult, Math.floor(level / milestoneLevel))
          : 1;
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

  // NEW: Auto-Click Loop (Optimized or Legacy)
  useEffect(() => {
    // Determine Frequency (Clicks per second)
    const clicksPerSec = effectiveStats.autoClickPerSec || 0;

    if (clicksPerSec <= 0 || !monster || monster.currentHp <= 0) return;

    // Check Hit Mode: 'OPTIMIZED' (1s) vs 'LEGACY' (Real-time)
    const settings = (gameConfig?.settings as any) || {};
    const hitMode = (settings.HIT_MODE as HitMode) || HitMode.OPTIMIZED;

    // Interval Calculation
    // Optimized: Always 1000ms (1s)
    // Legacy: 1000 / clicksPerSec (min 50ms)
    // Note: If clicksPerSec < 1 (e.g. 0.5), Optimized 1s means 0.5 clicks?
    // We should ensure clicksToSimulate >= 1.
    // If < 1, legacy works better (2s interval). Optimized assumes high frequency.
    // Let's fallback to legacy if rate < 1.
    const effectiveIsOptimized = hitMode === HitMode.OPTIMIZED && clicksPerSec >= 1;

    const intervalMs = effectiveIsOptimized
      ? 1000
      : Math.max(50, 1000 / clicksPerSec);

    const interval = setInterval(() => {
      // Determine how many clicks to simulate in this tick
      // If optimized, we simulate 1s worth of clicks (clicksPerSec).
      // If legacy, we simulate 1 click.
      const clicksToSimulate = effectiveIsOptimized ? Math.floor(clicksPerSec) : 1;

      let totalDmg = 0;
      let totalCpGain = 0;
      const burstHits: { damage: number; isCrit: boolean }[] = [];

      // Simulation Loop
      for (let i = 0; i < clicksToSimulate; i++) {
        const isCrit = Math.random() < effectiveStats.criticalChance;
        const dmg = isCrit
          ? Math.floor(
              effectiveStats.baseDamage * effectiveStats.criticalDamage
            )
          : effectiveStats.baseDamage;

        let finalDmg = dmg;
        if (monster.isBoss) {
          finalDmg = Math.ceil(
            dmg * (effectiveStats.bossDamageMultiplier || 1)
          );
        }

        totalDmg += finalDmg;
        totalCpGain += 1 * effectiveStats.cpMultiplier;

        // Store individual hits for visuals
        burstHits.push({ damage: finalDmg, isCrit });
      }

      if (totalDmg <= 0) return;

      // 2. Apply Damage (Updates Monster & Player)
      setMonster((prev) => {
        if (!prev || prev.currentHp <= 0) return prev;
        const newHp = prev.currentHp - totalDmg;

        if (newHp <= 0) {
          setTimeout(() => handleMonsterDeath(prev as Monster), 0);
          return { ...prev, currentHp: 0 };
        }
        return { ...prev, currentHp: Math.max(0, newHp) };
      });

      // 3. Update Player (Click Points / Records)
      setPlayer((prev) => {
        return {
          ...prev,
          wallet: {
            ...prev.wallet,
            clickPoints: prev.wallet.clickPoints + totalCpGain,
          },
          records: {
            ...prev.records,
            totalClicks: prev.records.totalClicks + clicksToSimulate,
            totalDamageDealt: prev.records.totalDamageDealt + totalDmg,
          },
        };
      });

      // 4. Trigger Visual Event
      if (effectiveIsOptimized) {
        // Optimized: Send burst info
        setLastAutoClickEvent({
          id: crypto.randomUUID(),
          damage: totalDmg,
          isCrit: false,
          // @ts-expect-error: Passing extra data for optimized renderer
          burstHits: burstHits,
        });
      } else {
        // Legacy: Single hit
        const hit =
          burstHits.length > 0
            ? burstHits[0]
            : { damage: 0, isCrit: false };
        setLastAutoClickEvent({
          id: crypto.randomUUID(),
          damage: hit.damage,
          isCrit: hit.isCrit,
        });
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [
    effectiveStats.autoClickPerSec,
    effectiveStats.baseDamage,
    effectiveStats.criticalChance,
    effectiveStats.criticalDamage,
    effectiveStats.bossDamageMultiplier,
    effectiveStats.cpMultiplier,
    monster?.id,
    gameConfig, // Dependency for settings
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
      let levelPointsGained = 0;
      currentXp += xpGain;

      // Level Up Logic
      while (currentXp >= requiredXp) {
        currentXp -= requiredXp;
        level += 1;
        levelPointsGained += 5;
        requiredXp = Math.floor(requiredXp * 1.2);
      }

      // 使用 addCurrency 處理金幣和等級積分
      let newWallet = addCurrency(prev.wallet, CurrencyType.GOLD, goldGain);
      if (levelPointsGained > 0) {
        newWallet = addCurrency(newWallet, CurrencyType.LP, levelPointsGained);
      }

      return {
        ...prev,
        wallet: newWallet,
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
      const settings = (gameConfig?.settings as any) || {};
      const gemReward = Number(settings.DAILY_REWARD_GEM) || 1000;
      const goldReward = Number(settings.DAILY_REWARD_GOLD) || 50000;
      const apReward = Number(settings.DAILY_REWARD_AP) || 0;

      setPlayer((prev) => ({
        ...prev,
        wallet: {
          ...prev.wallet,
          diamonds: prev.wallet.diamonds + gemReward,
          gold: prev.wallet.gold + goldReward,
          ascensionPoints: (prev.wallet.ascensionPoints || 0) + apReward,
        },
        lastDailyRewardClaimTime: Date.now(),
      }));
      showPopup(`簽到成功！獲得 ${gemReward} 💎 + ${formatBigNumber(goldReward, 0)} 💰 + ${apReward} 🕊️`);
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

      // 使用 costCalculator 計算成本
      const cost = calculateUpgradeCost(
        Number(config.Cost_Base || 0),
        Number(config.Cost_Mult || 0),
        currentLevel,
        config.Effect_Type
      );

      const currency = config.Currency || CurrencyType.CP;

      // 使用 walletManager 檢查餘額
      if (hasSufficientFunds(player.wallet, currency, cost)) {
        setPlayer((prev) => {
          // 使用 walletManager 扣除貨幣
          const newWallet = deductCurrency(prev.wallet, currency, cost);
          
          // 更新商店等級
          const newClickShop = { ...prev.clickShop, [itemId]: currentLevel + 1 };
          
          // 建立新的 player 狀態
          const nextPlayer = {
            ...prev,
            wallet: newWallet,
            clickShop: newClickShop,
          };
          
          // 使用 recalculateStats 重新計算所有數值
          nextPlayer.stats = recalculateStats(nextPlayer);
          
          return nextPlayer;
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

      // 使用 costCalculator 計算成本
      const cost = calculateUpgradeCost(
        Number(config.Cost_Base || 0),
        Number(config.Cost_Mult || 0),
        currentLevel,
        config.Effect_Type
      );

      const currency = config.Currency || CurrencyType.LP;

      // 使用 walletManager 檢查餘額
      if (hasSufficientFunds(player.wallet, currency, cost)) {
        setPlayer((prev) => {
          // 使用 walletManager 扣除貨幣
          const newWallet = deductCurrency(prev.wallet, currency, cost);
          
          // 更新商店等級
          const newLevelShop = { ...prev.levelShop, [itemId]: currentLevel + 1 };
          
          // 建立新的 player 狀態
          const nextPlayer = {
            ...prev,
            wallet: newWallet,
            levelShop: newLevelShop,
          };
          
          // 使用 recalculateStats 重新計算所有數值
          nextPlayer.stats = recalculateStats(nextPlayer);
          
          return nextPlayer;
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
        currency: CurrencyType.DIAMOND,
      },
      {
        id: "gold_pack_2",
        cost: 80,
        reward: 10000,
        type: "GOLD",
        currency: CurrencyType.DIAMOND,
      },
    ].find((i) => i.id === itemId);

    if (shopItem) {
      // 使用 walletManager 檢查餘額和處理交易
      if (hasSufficientFunds(player.wallet, shopItem.currency, shopItem.cost)) {
        setPlayer((prev) => {
          let newWallet = deductCurrency(prev.wallet, shopItem.currency, shopItem.cost);
          newWallet = { ...newWallet, gold: newWallet.gold + shopItem.reward };
          return { ...prev, wallet: newWallet };
        });
      } else {
        showPopup("鑽石不足！");
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

        // 使用 costCalculator 計算成本
        const cost = calculateUpgradeCost(
          Number(config.Cost_Base || 0),
          Number(config.Cost_Mult || 1),
          currentLevel,
          config.Effect_Type
        );

        // 使用 walletManager 檢查餘額
        if (hasSufficientFunds(player.wallet, CurrencyType.GOLD, cost)) {
          setPlayer((prev) => {
            // 使用 walletManager 扣除貨幣
            const newWallet = deductCurrency(prev.wallet, CurrencyType.GOLD, cost);
            
            // 更新商店等級
            const newGoldShop = { ...prev.goldShop };
            newGoldShop[itemId] = (prev.goldShop[itemId] || 0) + 1;

            // 處理消耗品
            const newInventory = { ...prev.inventory };
            if (config.Effect_Type === UpgradeEffectType.ADD_INVENTORY) {
              if (itemId === "gold_potion_rage") {
                newInventory.ragePotionCount = (newInventory.ragePotionCount || 0) + 1;
              }
            }

            // 建立新的 player 狀態
            const nextPlayer = {
              ...prev,
              wallet: newWallet,
              goldShop: newGoldShop,
              inventory: newInventory,
            };
            
            // 使用 recalculateStats 重新計算所有數值
            nextPlayer.stats = recalculateStats(nextPlayer);
            
            return nextPlayer;
          });
        } else {
          showPopup("金幣不足！");
        }
        return;
      }

      // If we reach here, the item was not found in gameConfig
      console.warn(`[handleShopPurchase] Gold shop item not found in config: ${itemId}`);
    }

    // --- EQUIPMENT GACHA (Basic / Advanced / Premium) ---
    // --- EQUIPMENT GACHA (Old & New Support) ---
    if (itemId.startsWith("gacha_")) {
       // Legacy check
       if (itemId.includes("equipment")) return;

       const parts = itemId.split("_");
       // gacha_basic_ap_10
       if (parts.length < 4) return;

       const boxShort = parts[1];
       const currencyShort = parts[2];
       const drawCount = Number(parts[3]) || 1;

       let boxType = "basic";
       if (boxShort === "adv") boxType = "advanced";
       if (boxShort === "prem") boxType = "premium";

       let currencyType = CurrencyType.AP;
       if (currencyShort === "diamond" || currencyShort === "dia") currencyType = CurrencyType.DIAMOND;

       // Calculate Cost
       const s = (gameConfig?.settings as any) || {};
       const key = `GACHA_COST_${boxShort.toUpperCase()}_${currencyType === CurrencyType.DIAMOND ? "DIAMOND" : "AP"}`;
       
       const base = boxShort === "basic" ? (currencyType === CurrencyType.DIAMOND ? 2 : 20) :
                    boxShort === "adv" ? (currencyType === CurrencyType.DIAMOND ? 20 : 200) :
                    (currencyType === CurrencyType.DIAMOND ? 100 : 1000);
       
       const unitCost = Number(s[key]) || base;
       const totalCost = unitCost * drawCount;

      // 使用 walletManager 檢查餘額
      if (hasSufficientFunds(player.wallet, currencyType, totalCost)) {
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

          setPlayer((prev) => {
            // 使用 walletManager 扣除貨幣
            let newWallet = deductCurrency(prev.wallet, currencyType, totalCost);
            // 增加碎片
            newWallet = {
              ...newWallet,
              equipmentShards: (newWallet.equipmentShards || 0) + gainedShards,
            };
            
            return {
              ...prev,
              wallet: newWallet,
              equipment: {
                ...prev.equipment,
                inventory: newInventory,
              },
            };
          });

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
        showPopup(`${currencyType === CurrencyType.DIAMOND ? "鑽石" : "飛昇點數 (AP)"}不足！`);
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

      // 使用 costCalculator 計算成本
      const cost = calculateUpgradeCost(
        Number(config.Cost_Base || 0),
        Number(config.Cost_Mult || 0),
        currentLevel,
        config.Effect_Type
      );

      const currency = config.Currency || CurrencyType.AP;

      // 使用 walletManager 檢查餘額
      if (hasSufficientFunds(player.wallet, currency, cost)) {
        setPlayer((prev) => {
          // 使用 walletManager 扣除貨幣
          const newWallet = deductCurrency(prev.wallet, currency, cost);
          
          // 更新商店等級
          const newAscensionShop = {
            ...prev.ascensionShop,
            [itemId]: currentLevel + 1,
          };
          
          // 建立新的 player 狀態
          const nextPlayer = {
            ...prev,
            wallet: newWallet,
            ascensionShop: newAscensionShop,
          };
          
          // 使用 recalculateStats 重新計算所有數值
          nextPlayer.stats = recalculateStats(nextPlayer);
          
          return nextPlayer;
        });
      } else {
        showPopup(`${currency} 不足！`);
      }
    }
  };

  // 批量購買函數 (用於+25級等批量購買)
  const handleBulkShopPurchase = (itemId: string, quantity: number) => {
    if (!gameConfig?.upgrades) return;

    // 目前只支援 Gold Shop 的批量購買
    if (!itemId.startsWith("gold_shop_") && !itemId.startsWith("gold_potion_")) return;

    const config = gameConfig.upgrades.find((u: any) => u.ID === itemId);
    if (!config) return;

    const isInventoryItem = config.Effect_Type === UpgradeEffectType.ADD_INVENTORY;
    const currentLevel = isInventoryItem ? 0 : (player.goldShop[itemId] || 0);
    const maxLevel = Number(config.Max_Level || 0);

    // 計算實際可升級的次數 (庫存道具無上限)
    const actualQuantity = isInventoryItem
      ? quantity
      : maxLevel > 0
        ? Math.min(quantity, maxLevel - currentLevel)
        : quantity;

    if (actualQuantity <= 0) {
      showPopup("已達最大等級！");
      return;
    }

    // 計算總費用
    let totalCost = 0;
    for (let i = 0; i < actualQuantity; i++) {
      totalCost += calculateUpgradeCost(
        Number(config.Cost_Base || 0),
        Number(config.Cost_Mult || 1),
        isInventoryItem ? 0 : currentLevel + i, // 庫存道具每次相同價格
        config.Effect_Type
      );
    }

    // 檢查餘額
    if (!hasSufficientFunds(player.wallet, CurrencyType.GOLD, totalCost)) {
      showPopup("金幣不足！");
      return;
    }

    // 一次性更新狀態
    setPlayer((prev) => {
      const newWallet = deductCurrency(prev.wallet, CurrencyType.GOLD, totalCost);

      if (isInventoryItem) {
        // 處理庫存道具
        const newInventory = { ...prev.inventory };
        if (itemId === "gold_potion_rage") {
          newInventory.ragePotionCount = (newInventory.ragePotionCount || 0) + actualQuantity;
        }
        return {
          ...prev,
          wallet: newWallet,
          inventory: newInventory,
        };
      }

      // 處理一般升級
      const newGoldShop = { ...prev.goldShop };
      newGoldShop[itemId] = (prev.goldShop[itemId] || 0) + actualQuantity;

      const nextPlayer = {
        ...prev,
        wallet: newWallet,
        goldShop: newGoldShop,
      };

      nextPlayer.stats = recalculateStats(nextPlayer);
      return nextPlayer;
    });
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
    // 從初始值開始計算
    let stats = { ...INITIAL_PLAYER.stats };

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
        const effectType = config.Effect_Type;
        const totalVal = Number(config.Effect_Val || 0) * level;
        // 使用 applyEffect 統一處理
        stats = applyEffect(stats, effectType, totalVal);
      }
    });

    // 2. Add Permanent Shop bonuses (Click, Level, Ascension)
    const shops = ["clickShop", "levelShop", "ascensionShop"] as const;
    shops.forEach((shopKey) => {
      Object.entries(p[shopKey]).forEach(([id, level]) => {
        const config = gameConfig?.upgrades?.find((u: any) => u.ID === id);
        if (config && level > 0) {
          const effectType = config.Effect_Type;
          const totalVal = Number(config.Effect_Val || 0) * level;
          // 使用 applyEffect 統一處理
          stats = applyEffect(stats, effectType, totalVal);
        }
      });
    });

    // 3. TODO: Add Equipment bonuses (未來擴充)
    // Object.entries(p.equipment).forEach(([slot, itemId]) => {
    //   if (!itemId) return;
    //   const config = gameConfig?.equipments?.find((e: any) => e.ID === itemId);
    //   if (config) {
    //     const level = p.equipmentLevels?.[itemId] || 1;
    //     const val = calculateEffectValue(config.Base_Val, config.Level_Mult, level);
    //     stats = applyEffect(stats, config.Effect_Type, val);
    //   }
    // });

    // Post-Process: Apply Global Multiplier (ATK %)
    if (stats.atkPercentBonus > 0) {
      stats.baseDamage = Math.floor(stats.baseDamage * (1 + stats.atkPercentBonus / 100));
    }

    return stats;
  };

  const handleAscension = () => {
    const points = potentialPoints;
    if (points <= 0) return;

    setPlayer((prev) => {
      // 使用 resetWallet 重置錢包 (保留 AP, CP, DIAMOND, EQUIPMENT_SHARD)
      let newWallet = resetWallet(prev.wallet, [
        CurrencyType.AP,
        CurrencyType.CP,
        CurrencyType.DIAMOND,
        CurrencyType.EQUIPMENT_SHARD,
      ]);
      // 增加飛昇點數
      newWallet = addCurrency(newWallet, CurrencyType.AP, points);

      const nextPlayer: PlayerState = {
        ...prev,
        system: {
          level: 1,
          currentXp: 0,
          requiredXp: 100,
        },
        wallet: newWallet,
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
      
      // 計算要返還的點數
      Object.entries(prev.levelShop).forEach(([id, level]) => {
        const config = gameConfig?.upgrades?.find((u: any) => u.ID === id);
        if (config) {
          // 使用 calculateUpgradeCost 計算每級花費
          for (let i = 0; i < level; i++) {
            const cost = calculateUpgradeCost(
              Number(config.Cost_Base || 0),
              Number(config.Cost_Mult || 1),
              i,
              config.Effect_Type
            );
            refundedPoints += cost;
          }
        }
      });

      // 使用 addCurrency 增加返還的點數
      const newWallet = addCurrency(prev.wallet, CurrencyType.LP, refundedPoints);

      const nextPlayer: PlayerState = {
        ...prev,
        wallet: newWallet,
        levelShop: {},
      };

      nextPlayer.stats = recalculateStats(nextPlayer);
      return nextPlayer;
    });

    showPopup("✅ 等級積分已重製！");
  };

  const potentialPoints = React.useMemo(() => {
    // 從 DB settings 讀取飛昇公式參數
    const settings = gameConfig?.settings as Record<string, any> || {};
    const formulaType = String(settings.ASCENSION_FORMULA ?? "SOFT_EXP");
    const baseAmount = Number(settings.ASCENSION_BASE ?? 10);
    const multiplier = Number(settings.ASCENSION_MULT ?? 1.5);
    const minStage = Number(settings.ASCENSION_MIN_STAGE ?? 1);
    
    // Player Bonus
    const apMult = player.stats.apMultiplier || 1.0;

    const stageVal = Math.max(1, stage.maxStageReached);
    
    // 檢查是否達到最低飛昇關卡要求
    if (stageVal < minStage) return 0;
    
    let points = 0;

    switch (formulaType) {
      case "LINEAR":
        // 線性: base + stage × mult
        points = baseAmount + stageVal * multiplier;
        break;
      case "SQRT":
        // 平方根: base × √stage
        points = baseAmount * Math.sqrt(stageVal);
        break;
      case "LOG":
        // 對數: base × log₁₀(stage + 1) × mult
        points = baseAmount * Math.log10(stageVal + 1) * multiplier;
        break;
      case "SOFT_EXP":
      default:
        // 緩指數: base × mult^√stage (預設)
        points = baseAmount * Math.pow(multiplier, Math.sqrt(stageVal));
        break;
    }

    // Apply AP Multiplier
    return Math.floor(points * apMult);
  }, [stage.maxStageReached, gameConfig?.settings, player.stats.apMultiplier]);

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
              Math.floor(effectiveStats.monsterKillReduction || 0)
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
          onBulkPurchase={handleBulkShopPurchase}
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
