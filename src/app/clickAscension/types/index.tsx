export type CurrencyType = "GOLD" | "CLICK_POINT" | "DIAMOND"; // 貨幣類型：金幣、點擊點數、鑽石

export interface Wallet {
  gold: number; // 金幣數量
  clickPoints: number; // 點擊點數
  diamonds: number; // 鑽石數量
  levelPoints: number; // 等級積分
}

/**
 * Global Statistics for the Profile Modal
 * 個人資料頁面的全局統計數據
 */
export interface PlayerStatistics {
  totalClicks: number; // 總點擊次數
  totalDamageDealt: number; // 總造成傷害
  maxStageReached: number; // 最高到達關卡
  totalGoldEarned: number; // 總獲得金幣
  playtimeSeconds: number; // 遊玩時間 (秒)
  monstersKilled: number; // 擊殺怪物數
  bossesKilled: number; // 擊殺 BOSS 數
}

export interface PlayerSystem {
  level: number; // 當前等級
  currentXp: number; // 當前經驗值
  requiredXp: number; // 升級所需經驗值 (Derived or static lookup)
}

export interface PlayerAttributes {
  // Base Stats // 基礎屬性
  baseDamage: number; // 基礎傷害
  autoAttackDamage: number; // 自動攻擊傷害 (For future partners/auto)

  // Multipliers // 倍率/加成
  criticalChance: number; // 爆擊機率 (0.05 = 5%)
  criticalDamage: number; // 爆擊傷害倍率 (1.5 = 150%)
  goldMultiplier: number; // 金幣獲取倍率
  cpMultiplier: number; // 點擊點數倍率 (Click Point multiplier)
  xpMultiplier: number; // 經驗值倍率
  bossDamageMultiplier: number; // 對 BOSS 傷害倍率
}

export interface PlayerState {
  system: PlayerSystem; // 系統狀態 (等級、經驗)
  wallet: Wallet; // 錢包狀態
  stats: PlayerAttributes; // 戰鬥屬性
  records: PlayerStatistics; // 統計記錄
  clickShop: {
    // 點擊商店 (修仙) 等級
    clickPowerLevel: number;
    critDamageLevel: number;
    goldBonusLevel: number;
  };
  levelShop: {
    // 等級商店 (天賦) 等級
    wisdomLevel: number; // 悟性 (XP)
    greedLevel: number; // 貪婪 (Gold)
    autoClickLevel: number; // 自動聚氣 (Auto Dmg)
    bossSlayerLevel: number; // BOSS 殺手
    luckLevel: number; // 幸運 (Crit Chance)
  };
  goldShop: {
    // 金幣商店等級
    weaponLevel: number; // 鍛造武器
    mercenaryLevel: number; // 傭兵
    partnerLevel: number; // 夥伴
  };
  inventory: {
    // 道具欄
    ragePotionCount: number; // 狂暴藥水數量
  };
  activeBuffs: {
    // 啟用中的 Buff (結束時間戳)
    ragePotionExpiresAt: number;
  };
  lastDailyRewardClaimTime?: number; // 上次領取每日獎勵的時間 (timestamp)
}

// ============================================================================
// Stage & Combat // 關卡與戰鬥
// ============================================================================

export interface StageState {
  currentStageId: number; // 當前關卡 ID
  isBossActive: boolean; // 是否正在挑戰 BOSS
  autoChallengeBoss: boolean; // 自動挑戰 BOSS 開關
  maxStageReached: number; // 最高到達關卡
  monstersKilledInStage: number; // 當前關卡已擊殺怪物數
  monstersRequiredForBoss: number; // 召喚 BOSS 所需擊殺數 (e.g. 10)
}

export interface Monster {
  id: string; // 唯一實例 ID
  name: string; // 怪物名稱
  level: number; // 怪物等級
  currentHp: number; // 當前生命值
  maxHp: number; // 最大生命值
  isBoss: boolean; // 是否為 BOSS
  rewardGold: number; // 掉落金幣
  rewardXp: number; // 掉落經驗
  // Visuals // 視覺效果
  assetUrl?: string; // 資源 URL (用於不同外觀)
  emoji?: string; // 用於顯示的 emoji
}

// ============================================================================
// UI & Visuals // UI 與視覺
// ============================================================================

export type DamageType = "CLICK" | "AUTO" | "CRIT"; // 傷害類型：點擊、自動、爆擊

export interface FloatingText {
  id: string;
  text: string; // 顯示文字
  x: number; // X 座標
  y: number; // Y 座標
  type: DamageType; // 類型
  createdAt: number; // 創建時間 (用於動畫清理)
}

// ============================================================================
// Shop & Upgrades // 商店與升級
// ============================================================================

export enum UpgradeCategory {
  CLICK_UPGRADE = "CLICK_UPGRADE", // 點擊升級
  AUTO_UPGRADE = "AUTO_UPGRADE", // 自動升級
  FEATURE = "FEATURE", // 功能升級
}

export enum UpgradeEffectType {
  ADD_DAMAGE = "ADD_DAMAGE", // 增加點擊傷害
  ADD_AUTO = "ADD_AUTO", // 增加自動攻擊傷害
  ADD_CRIT = "ADD_CRIT", // 增加爆擊機率/傷害
  ADD_GOLD = "ADD_GOLD", // 增加金幣獲取
}

export interface UpgradeItem {
  id: string;
  name: string; // 名稱
  description: string; // 描述
  baseCost: number; // 基礎花費
  costMultiplier: number; // 花費成長倍率
  currency: CurrencyType; // 消耗貨幣類型

  level: number; // 當前等級
  maxLevel?: number; // 最大等級

  effectType: UpgradeEffectType; // 效果類型
  effectValue: number; // 每級增加的數值 (固定值或百分比)
}

export interface GameState {
  lastSaveTime: number; // 上次存檔時間
  player: PlayerState; // 玩家狀態
  stage: StageState; // 關卡狀態
  currentMonster: Monster | null; // 當前怪物
}
