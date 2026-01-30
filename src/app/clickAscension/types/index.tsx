export type CurrencyType =
  | "GOLD"
  | "CP"
  | "DIAMOND"
  | "AP"
  | "LP"
  | "EQUIPMENT_SHARD"; // 貨幣類型：金幣、點擊點數、鑽石、飛昇點數、等級點數、裝備碎片

export interface Wallet {
  gold: number; // 金幣數量
  clickPoints: number; // 點擊點數
  diamonds: number; // 鑽石數量
  levelPoints: number; // 等級積分
  ascensionPoints: number; // 飛昇點數 (轉生點數)
  equipmentShards: number; // 裝備碎片 (New)
}

/**
 * 個人資料頁面的全局統計數據
 * 用於記錄玩家的生涯累積數據
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
  requiredXp: number; // 升級所需經驗值 (衍生計算或查表)
}

export interface PlayerAttributes {
  // Base Stats // 基礎屬性
  baseDamage: number; // 基礎傷害
  autoAttackDamage: number; // 自動攻擊傷害 (預留給未來夥伴/自動功能)

  // Multipliers // 倍率/加成
  criticalChance: number; // 爆擊機率 (0.05 = 5%)
  criticalDamage: number; // 爆擊傷害倍率 (1.5 = 150%)
  goldMultiplier: number; // 金幣獲取倍率
  cpMultiplier: number; // 點擊點數倍率 (Click Point multiplier)
  xpMultiplier: number; // 經驗值倍率
  bossDamageMultiplier: number; // 對 BOSS 傷害倍率

  // New Ascension Stats
  autoClickPerSec: number; // 每秒模擬點擊次數
  monsterKillReduction: number; // 進入下關所需擊殺數減少量
  rareMonsterChance: number; // 稀有怪出現機率 (0.1 = 10%)
}

export interface PlayerState {
  system: PlayerSystem; // 系統狀態 (等級、經驗)
  wallet: Wallet; // 錢包狀態
  stats: PlayerAttributes; // 戰鬥屬性
  records: PlayerStatistics; // 統計記錄
  clickShop: Record<string, number>; // 點擊商店項目 ID -> 等級
  levelShop: Record<string, number>; // 等級商店項目 ID -> 等級
  goldShop: {
    // 金幣商店等級
    weaponLevel: number; // 鍛造武器
    mercenaryLevel: number; // 傭兵
    partnerLevel: number; // 夥伴
    archerLevel: number; // 精靈弓手 (New)
    knightLevel: number; // 騎士團長 (New)
    warlordLevel: number; // 荒野戰狂 (New)
    oracleLevel: number; // 神聖先知 (New)
    voidLevel: number; // 虛空領主 (New)
    titanLevel: number; // 遠古泰坦 (New)
    amuletLevel: number; // 貪婪護符 (New)
  };
  ascensionShop: AscensionShop;
  inventory: {
    // 道具欄
    ragePotionCount: number; // 狂暴藥水數量
  };
  activeBuffs: {
    // 啟用中的 Buff (結束時間戳)
    ragePotionExpiresAt: number;
    // 裝備等級已移除，移動到頂層 equipment 物件
  };
  // 新增：裝備系統狀態
  equipment: {
    inventory: Record<string, number>; // 擁有的裝備 ID -> 等級 (若為 0 或 undefined 代表未擁有)
    equipped: Partial<Record<EquipmentSlot, string>>; // 部位 -> 裝備 ID
  };
  lastDailyRewardClaimTime?: number; // 上次領取每日獎勵的時間 (timestamp)
}
// 備註：理想情況下 equipmentLevels 應該在頂層或獨立物件中，但原本依照使用者需求放在 PlayerState。
// 現在我們將其放在獨立的 'equipment' 屬性中，而不是放在 'activeBuffs' 內，這樣更乾淨。

// ============================================================================
// Stage & Combat // 關卡與戰鬥
// ============================================================================

export interface StageState {
  currentStageId: number; // 當前關卡 ID
  isBossActive: boolean; // 是否正在挑戰 BOSS
  autoChallengeBoss: boolean; // 自動挑戰 BOSS 開關
  autoUsePotion: boolean; // 自動使用藥水開關
  maxStageReached: number; // 最高到達關卡
  monstersKilledInStage: number; // 當前關卡已擊殺怪物數
  monstersRequiredForBoss: number; // 召喚 BOSS 所需擊殺數 (e.g. 10)
  bossTimeLeft?: number | null; // Boss 戰剩餘時間
  bossTimeLimit?: number; // Boss 戰總時長 (預設 60)
}

export interface AscensionShop {
  [key: string]: number; // 動態儲存各個飛昇項目的等級，例如 "ascension_shop_luck": 5
}

export enum MonsterRarity {
  COMMON = "COMMON",
  RARE = "RARE",
  BOSS = "BOSS",
}

export interface MonsterTemplate {
  configId: string;
  name: string;
  emoji: string;
  rarity: MonsterRarity;
  hpMultiplier: number;
  goldMultiplier: number;
  xpMultiplier: number;
  dropDiamonds?: number;
  note?: string;
}

export interface Monster {
  id: string; // 唯一實例 ID
  configId: string; // 模板 ID (用於圖片查找)
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
  rarity?: string; // Monster rarity
  dropDiamonds?: number; // Diamond drop amount
  note?: string; // 怪物備註 (例如: "新手村")
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
  ADD_AUTO = "ADD_AUTO", // 增加自動攻擊傷害,
  ADD_AUTO_DMG = "ADD_AUTO_DMG", // Same as ADD_AUTO, alias
  ADD_CRIT = "ADD_CRIT", // 增加爆擊機率/傷害
  ADD_GOLD = "ADD_GOLD", // 增加金幣獲取(Flat or Mult?) - Existing logic likely treats as flat or general category
  // New Types
  ADD_XP_MULT = "ADD_XP_MULT", // 經驗值倍率
  ADD_GOLD_MULT = "ADD_GOLD_MULT", // 金幣獲取倍率
  REDUCE_GOAL_V = "REDUCE_GOAL_V", // 減少關卡目標 (隻)
  RARE_CHANCE_P = "RARE_CHANCE_P", // 稀有怪機率 (%)
  AUTO_CLICK_V = "AUTO_CLICK_V", // 自動點擊 (次/秒)
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

// ============================================================================
// Equipment System (New) // 裝備系統
// ============================================================================

export enum EquipmentSlot {
  MAIN_HAND = "MAIN_HAND", // 武器
  HEAD = "HEAD", // 頭盔
  BODY = "BODY", // 護甲
  HANDS = "HANDS", // 手套
  LEGS = "LEGS", // 腿甲
  RELIC = "RELIC", // 法寶
}

// 裝備系統的 DB Schema 對應
export interface EquipmentItemConfig {
  ID: string; // 例如 "eq_main_hand_01"
  Name: string; // 裝備名稱
  Slot: EquipmentSlot; // 部位
  Desc_Template: string; // 描述 (例如 "點擊傷害 +{val}")
  Effect_Type: string; // "CLICK_DMG", "CRIT_RATE" 等
  Base_Val: number; // 基礎數值
  Level_Mult: number; // 數值成長倍率 (或累加值，由邏輯定義)
  Cost_Base: number; // 初始價格
  Cost_Mult: number; // 價格成長倍率
  Currency: CurrencyType; // 購買貨幣
  Rarity: string; // 稀有度 (例如 "Common", "Epic")
  Gacha_Weight: number; // 扭蛋權重 (例如 100 為普通, 10 為稀有)
  Max_Level: number; // 等級上限
}

// 商店與升級項目的 DB Schema 對應
export interface UpgradeConfig {
  ID: string; // 例如 "click_shop_damage"
  Name: string; // 名稱
  Shop_Type: string; // "CLICK", "GOLD", "LEVEL", "ASCENSION"
  Cost_Base: number;
  Cost_Mult: number;
  Effect_Type: string;
  Effect_Val: string | number;
  Max_Level: number;
  Currency: CurrencyType;
  Desc_Template: string;
}

// Monster config from Google Sheet
export interface MonsterConfig {
  ID: string;
  Name: string;
  Emoji: string;
  Rarity: string; // "COMMON", "RARE", "BOSS"
  Stage_Min: number;
  Stage_Max: number;
  HP_Mult: number;
  Gold_Mult: number;
  XP_Mult: number;
  Weight: number;
  Notes?: string;
  Drop_Diamonds?: number; // Optional
}

export interface GameConfig {
  settings: Record<string, unknown>; // From 'Settings' sheet
  monsters: MonsterConfig[]; // From 'Monsters' sheet
  upgrades: UpgradeConfig[]; // From 'Upgrades' sheet
  equipments: EquipmentItemConfig[]; // From 'Equipments' sheet
}
