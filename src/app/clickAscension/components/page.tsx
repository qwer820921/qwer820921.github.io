/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { PlayerState, StageState, Monster } from "../types";
import Header from "./Header";
import MonsterBattle from "./MonsterBattle";
import FooterNav, { ModalType } from "./FooterNav";
import Modal from "./Modal";
import UpgradePage from "./UpgradePage";
import ShopPage from "./ShopPage";
import ProfilePage from "./ProfilePage";
import { getRandomMonster } from "../utils/MonsterData";
import { clickAscensionApi } from "../api/clickAscensionApi";
import "../styles/clickAscension.css";

// ============================================================================
// Initial State Constants
// ============================================================================

const INITIAL_PLAYER: PlayerState = {
  system: { level: 1, currentXp: 0, requiredXp: 100 },
  wallet: { gold: 0, clickPoints: 0, diamonds: 10, levelPoints: 0 },
  stats: {
    baseDamage: 1,
    autoAttackDamage: 0,
    criticalChance: 0.05,
    criticalDamage: 1.5,
    goldMultiplier: 1.0,
    cpMultiplier: 1.0,
    xpMultiplier: 1.0,
    bossDamageMultiplier: 1.0,
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
  clickShop: {
    clickPowerLevel: 0,
    critDamageLevel: 0,
    goldBonusLevel: 0,
  },
  levelShop: {
    wisdomLevel: 0,
    greedLevel: 0,
    autoClickLevel: 0,
    bossSlayerLevel: 0,
    luckLevel: 0,
  },
  goldShop: {
    weaponLevel: 0,
    mercenaryLevel: 0,
    partnerLevel: 0,
  },
  inventory: {
    ragePotionCount: 0,
  },
  activeBuffs: {
    ragePotionExpiresAt: 0,
  },
};

const INITIAL_STAGE: StageState = {
  currentStageId: 1,
  isBossActive: false,
  autoChallengeBoss: true,
  maxStageReached: 1,
  monstersKilledInStage: 0,
  monstersRequiredForBoss: 10,
};

// ============================================================================
// Component
// ============================================================================

export default function ClickAscensionGame() {
  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [player, setPlayer] = useState<PlayerState>(INITIAL_PLAYER);
  const [stage, setStage] = useState<StageState>(INITIAL_STAGE);
  const [monster, setMonster] = useState<Monster | null>(null);
  const [upgradeLevels, setUpgradeLevels] = useState<Record<string, number>>(
    {}
  );
  const [gameConfig, setGameConfig] = useState<any | null>(null); // Use any for now or modify ShopPage to accept proper type

  // Initial Spawn Wait Flag? No, useEffect handles it below.

  // Derived Stats
  const combatPower = Math.floor(
    player.stats.baseDamage * 10 +
      player.stats.autoAttackDamage * 20 +
      player.stats.criticalChance * 1000 +
      player.stats.criticalDamage * 500
  );

  // --------------------------------------------------------------------------
  // Effects
  // --------------------------------------------------------------------------

  // Update Monster when Stage changes (if needed) or respawn logic
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

    // Auto-Challenge Boss Logic
    // If not explicitly fighting boss, but auto-challenge is on and we met criteria
    if (
      !isBoss &&
      stage.autoChallengeBoss &&
      stage.monstersKilledInStage >= stage.monstersRequiredForBoss
    ) {
      isBoss = true;
      // Note: We don't setStage here to avoid infinite loop or render issues during render phase?
      // Better to just spawn a boss monster. The state 'isBossActive' tracks if we are in "Boss Mode" (failed = retreat).
      // But if we just passively spawn a boss, does it count?
      // The previous logic likely setStage to true.
      // For now, let's keep it simple: If criteria met, next monster IS boss.
    }

    // 2. Get Template
    const template = getRandomMonster(stage.currentStageId, isBoss);

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
    };

    setMonster(newMonster);
  }, [stage]); // Depend on stage to catch updates (like killed count or boss active) // Depend on whole stage object to catch progress updates

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

  // Auto-Save Loop (30s)
  useEffect(() => {
    if (!userId) return;

    const interval = setInterval(async () => {
      console.log(`[AutoSave] Saving for ${userId} to Cloud...`);
      const saveData = {
        player,
        stage,
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
  }, [userId, player, stage]);

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
          setPlayer((prev) => ({ ...prev, ...(cloudData.player as any) }));
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

  const handleManualSave = async () => {
    if (!userId) return;

    const saveData = {
      player,
      stage,
      timestamp: Date.now(),
    };

    try {
      alert("☁️ 上傳中...");
      await clickAscensionApi.savePlayerProgress(userId, saveData);
      alert("✅ 上傳成功 (Cloud Save)");
      // Backup local
      localStorage.setItem(`ca_save_${userId}`, JSON.stringify(saveData));
    } catch (e) {
      console.error("Save failed", e);
      alert("❌ 上傳失敗，已存至本機備份。");
      localStorage.setItem(`ca_save_${userId}`, JSON.stringify(saveData));
    }
  }; // We can't directly call handleMonsterClick because it might expect event or be tied to click stats
  // Let's modify handleMonsterClick or create a separate damage handler.
  // For simplicity, let's just apply damage directly here or call a shared function.
  // But handleMonsterClick calculates damage inside. Let's refactor?
  // Minimally invasive: just apply damage.

  // Auto-Attack Loop
  useEffect(() => {
    if (
      !monster ||
      monster.currentHp <= 0 ||
      player.stats.autoAttackDamage <= 0
    )
      return;

    const interval = setInterval(() => {
      // Apply Boss Multiplier to Auto Damage too? Usually yes.
      let damage = player.stats.autoAttackDamage;
      if (monster.isBoss) {
        damage = Math.ceil(damage * player.stats.bossDamageMultiplier);
      }

      // Re-use click logic but mark as AUTO
      // We can't directly call handleMonsterClick because it might expect event or be tied to click stats
      // Let's modify handleMonsterClick or create a separate damage handler.
      // For simplicity, let's just apply damage directly here or call a shared function.
      // But handleMonsterClick calculates damage inside. Let's refactor?
      // Minimally invasive: just apply damage.

      setMonster((prev) => {
        if (!prev || prev.currentHp <= 0) return prev;
        const newHp = prev.currentHp - damage;

        // Visual fetch: floating text is in MonsterBattle.tsx, we can't trigger it from here easily without ref like 'useImperativeHandle' or context.
        // For now, auto-attack might be silent text-wise or we just update HP.
        // Actually user probably wants to see numbers.
        // Since FloatingTexts are inside MonsterBattle, we can't add them from page.tsx easily.
        // WE WILL IGNORE FLOATING TEXT FOR AUTO ATTACK FOR NOW (or move FloatingText state up, but that's a big refactor)

        if (newHp <= 0) {
          // We need to trigger death outside setMonster usually, but here we can't.
          // We'll rely on a separate Effect to check for death? Or just call handleMonsterDeath?
          // handleMonsterDeath uses 'monster' state, so inside setMonster callback 'monster' is stale 'prev'?
          // No, handleMonsterDeath needs the monster object.
          // We can set a flag or call it after.
          setTimeout(() => handleMonsterDeath(prev as Monster), 0);
          return { ...prev, currentHp: 0 };
        }

        return { ...prev, currentHp: Math.max(0, newHp) };
      });

      // Update Records (Auto damage counts for Total Damage but not Clicks)
      setPlayer((prev) => ({
        ...prev,
        records: {
          ...prev.records,
          totalDamageDealt: prev.records.totalDamageDealt + damage,
        },
      }));
    }, 1000); // 1 second interval

    return () => clearInterval(interval);
  }, [
    monster,
    player.stats.autoAttackDamage,
    player.stats.bossDamageMultiplier,
  ]);

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  const handleMonsterClick = (damage: number, _isCrit: boolean) => {
    if (!monster || monster.currentHp <= 0) return;

    // Apply Boss Multiplier
    let finalDamage = damage;
    if (monster.isBoss) {
      finalDamage = Math.ceil(damage * player.stats.bossDamageMultiplier);
    }

    const newHp = monster.currentHp - finalDamage;
    setMonster((prev) =>
      prev ? { ...prev, currentHp: Math.max(0, newHp) } : null
    );

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
        clickPoints: prev.wallet.clickPoints + 1 * prev.stats.cpMultiplier,
      },
    }));

    // Check Death
    if (newHp <= 0) {
      handleMonsterDeath(monster); // Pass monster to avoid stale state closure if needed
    }
  };

  const handleMonsterDeath = (dyingMonster: Monster) => {
    // Accept monster as arg
    if (!dyingMonster) return;

    const goldGain = Math.ceil(
      dyingMonster.rewardGold * player.stats.goldMultiplier
    );
    const xpGain = Math.ceil(dyingMonster.rewardXp * player.stats.xpMultiplier);

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
        },
      };
    });

    // Handle Stage Progression
    setStage((prev) => {
      // If we just killed a Boss, advance stage!
      if (dyingMonster.isBoss) {
        return {
          ...prev,
          currentStageId: prev.currentStageId + 1,
          maxStageReached: Math.max(
            prev.maxStageReached,
            prev.currentStageId + 1
          ),
          isBossActive: false, // Reset boss status (back to farming next stage)
          monstersKilledInStage: 0, // Reset kill count
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

  const handlePurchaseUpgrade = (upgradeId: string, cost: number) => {
    if (player.wallet.gold < cost) return;

    setPlayer((prev) => ({
      ...prev,
      wallet: { ...prev.wallet, gold: prev.wallet.gold - cost },
    }));

    setUpgradeLevels((prev) => ({
      ...prev,
      [upgradeId]: (prev[upgradeId] || 0) + 1,
    }));

    // Apply upgrade effect
    switch (upgradeId) {
      case "click_power":
        setPlayer((prev) => ({
          ...prev,
          stats: { ...prev.stats, baseDamage: prev.stats.baseDamage + 1 },
        }));
        break;
      case "crit_chance":
        setPlayer((prev) => ({
          ...prev,
          stats: {
            ...prev.stats,
            criticalChance: Math.min(0.5, prev.stats.criticalChance + 0.01),
          },
        }));
        break;
      case "gold_bonus":
        setPlayer((prev) => ({
          ...prev,
          stats: {
            ...prev.stats,
            goldMultiplier: prev.stats.goldMultiplier + 0.1,
          },
        }));
        break;
      case "auto_attack":
        setPlayer((prev) => ({
          ...prev,
          stats: {
            ...prev.stats,
            autoAttackDamage: prev.stats.autoAttackDamage + 1,
          },
        }));
        break;
    }
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
    if (itemId.startsWith("level_shop_")) {
      const { levelShop } = player;
      let cost = 0;

      switch (itemId) {
        // 1. Wisdom (XP) - Base 3, +1 per level
        case "level_shop_wisdom":
          cost = 3 + levelShop.wisdomLevel;
          if (player.wallet.levelPoints >= cost) {
            setPlayer((prev) => ({
              ...prev,
              wallet: {
                ...prev.wallet,
                levelPoints: prev.wallet.levelPoints - cost,
              },
              levelShop: {
                ...prev.levelShop,
                wisdomLevel: prev.levelShop.wisdomLevel + 1,
              },
              stats: {
                ...prev.stats,
                xpMultiplier: prev.stats.xpMultiplier + 0.05,
              }, // +5% XP
            }));
          }
          break;

        // 2. Greed (Gold) - Base 2, +1 per level
        case "level_shop_greed":
          cost = 2 + levelShop.greedLevel;
          if (player.wallet.levelPoints >= cost) {
            setPlayer((prev) => ({
              ...prev,
              wallet: {
                ...prev.wallet,
                levelPoints: prev.wallet.levelPoints - cost,
              },
              levelShop: {
                ...prev.levelShop,
                greedLevel: prev.levelShop.greedLevel + 1,
              },
              stats: {
                ...prev.stats,
                goldMultiplier: prev.stats.goldMultiplier + 0.05,
              }, // +5% Gold
            }));
          }
          break;

        // 3. Auto Click (Auto Dmg)
        case "level_shop_auto":
          // Unlock cost 10, then upgrade cost 2 + level
          cost =
            levelShop.autoClickLevel === 0 ? 10 : 2 + levelShop.autoClickLevel;
          if (player.wallet.levelPoints >= cost) {
            setPlayer((prev) => ({
              ...prev,
              wallet: {
                ...prev.wallet,
                levelPoints: prev.wallet.levelPoints - cost,
              },
              levelShop: {
                ...prev.levelShop,
                autoClickLevel: prev.levelShop.autoClickLevel + 1,
              },
              // Add base 5 auto damage per level
              stats: {
                ...prev.stats,
                autoAttackDamage: prev.stats.autoAttackDamage + 5,
              },
            }));
          }
          break;

        // 4. Slayer (Boss Dmg) - Base 3, +1 per level
        case "level_shop_slayer":
          cost = 3 + levelShop.bossSlayerLevel;
          if (player.wallet.levelPoints >= cost) {
            setPlayer((prev) => ({
              ...prev,
              wallet: {
                ...prev.wallet,
                levelPoints: prev.wallet.levelPoints - cost,
              },
              levelShop: {
                ...prev.levelShop,
                bossSlayerLevel: prev.levelShop.bossSlayerLevel + 1,
              },
              stats: {
                ...prev.stats,
                bossDamageMultiplier: prev.stats.bossDamageMultiplier + 0.1,
              }, // +10% Boss Dmg
            }));
          }
          break;

        // 5. Luck (Crit Rate) - Base 4, +2 per level
        case "level_shop_luck":
          cost = 4 + levelShop.luckLevel * 2;
          if (player.wallet.levelPoints >= cost) {
            setPlayer((prev) => ({
              ...prev,
              wallet: {
                ...prev.wallet,
                levelPoints: prev.wallet.levelPoints - cost,
              },
              levelShop: {
                ...prev.levelShop,
                luckLevel: prev.levelShop.luckLevel + 1,
              },
              stats: {
                ...prev.stats,
                criticalChance: prev.stats.criticalChance + 0.01,
              }, // +1% Crit Chance
            }));
          }
          break;
      }
      return;
    }

    // --- Click Shop Upgrades (Consume Click Points) ---
    if (itemId.startsWith("click_shop_")) {
      const { clickShop } = player;
      let cost = 0;

      switch (itemId) {
        case "click_shop_damage":
          cost = Math.floor(10 * Math.pow(1.5, clickShop.clickPowerLevel));
          if (player.wallet.clickPoints >= cost) {
            setPlayer((prev) => ({
              ...prev,
              wallet: {
                ...prev.wallet,
                clickPoints: prev.wallet.clickPoints - cost,
              },
              clickShop: {
                ...prev.clickShop,
                clickPowerLevel: prev.clickShop.clickPowerLevel + 1,
              },
              stats: { ...prev.stats, baseDamage: prev.stats.baseDamage + 5 },
            }));
          }
          break;
        case "click_shop_crit":
          cost = Math.floor(50 * Math.pow(1.5, clickShop.critDamageLevel));
          if (player.wallet.clickPoints >= cost) {
            setPlayer((prev) => ({
              ...prev,
              wallet: {
                ...prev.wallet,
                clickPoints: prev.wallet.clickPoints - cost,
              },
              clickShop: {
                ...prev.clickShop,
                critDamageLevel: prev.clickShop.critDamageLevel + 1,
              },
              stats: {
                ...prev.stats,
                criticalDamage: prev.stats.criticalDamage + 0.1,
              }, // +10%
            }));
          }
          break;
        case "click_shop_gold":
          cost = Math.floor(100 * Math.pow(1.5, clickShop.goldBonusLevel));
          if (player.wallet.clickPoints >= cost) {
            setPlayer((prev) => ({
              ...prev,
              wallet: {
                ...prev.wallet,
                clickPoints: prev.wallet.clickPoints - cost,
              },
              clickShop: {
                ...prev.clickShop,
                goldBonusLevel: prev.clickShop.goldBonusLevel + 1,
              },
              stats: {
                ...prev.stats,
                goldMultiplier: prev.stats.goldMultiplier + 0.1,
              }, // +10%
            }));
          }
          break;
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

        // 4. Rage Potion
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
      />

      {/* Battle Area - Full screen clickable */}
      <MonsterBattle
        monster={monster}
        stageId={stage.currentStageId}
        onMonsterClick={handleMonsterClick}
        baseDamage={player.stats.baseDamage}
        criticalChance={player.stats.criticalChance}
        criticalDamage={player.stats.criticalDamage}
        monstersKilled={stage.monstersKilledInStage}
        monstersRequired={stage.monstersRequiredForBoss}
        isBossActive={stage.isBossActive}
        mercenaryLevel={player.goldShop.mercenaryLevel}
        partnerLevel={player.goldShop.partnerLevel}
        potionCount={player.inventory.ragePotionCount}
        activeBuffs={player.activeBuffs}
        onUsePotion={() => handleUsePotion("RAGE")}
      />

      {/* Footer Navigation */}
      <FooterNav onOpenModal={setActiveModal} />

      {/* Profile Modal */}
      <Modal
        isOpen={activeModal === "PROFILE"}
        onClose={() => setActiveModal(null)}
        title="玩家資料"
      >
        <ProfilePage
          player={player}
          combatPower={combatPower}
          userId={userId}
          onLogin={handleLogin}
          onLogout={handleLogout}
          onManualSave={handleManualSave}
          gameConfig={gameConfig}
        />
      </Modal>

      {/* Upgrade Modal (Legacy) */}
      <Modal
        isOpen={activeModal === "UPGRADES"}
        onClose={() => setActiveModal(null)}
        title="升級強化"
      >
        <UpgradePage
          player={player}
          upgradeLevels={upgradeLevels}
          onPurchaseUpgrade={handlePurchaseUpgrade}
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
              border: "none",
              background: "transparent",
              padding: 0,
              marginLeft: "12px",
              gap: "12px",
            }}
          >
            <div
              className="ca-currency ca-currency-gold"
              style={{ fontSize: "0.8rem" }}
            >
              <span>💰</span>
              <span>{Math.floor(player.wallet.gold).toLocaleString()}</span>
            </div>
            <div
              className="ca-currency ca-currency-diamond"
              style={{ fontSize: "0.8rem" }}
            >
              <span>💎</span>
              <span>{player.wallet.diamonds.toLocaleString()}</span>
            </div>
          </div>
        }
      >
        <ShopPage
          player={player}
          onPurchase={handleShopPurchase}
          gameConfig={gameConfig}
        />
      </Modal>
    </div>
  );
}
