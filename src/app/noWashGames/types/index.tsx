// =============================================================================
// 1. Interfaces & Enums (資料結構層)
// =============================================================================

/** * 遊戲核心屬性枚舉
 * 所有的數值計算與升級對象都以此為 Key
 */
export enum GameAttribute {
  STRENGTH = "STRENGTH", // 力量：影響基礎傷害
  ATTACK_SPEED = "ATTACK_SPEED", // 攻速：影響每秒攻擊頻率
  CRITICAL_CHANCE = "CRITICAL_CHANCE", // 暴擊率：影響造成雙倍傷害的機率
  GOLD_BONUS = "GOLD_BONUS", // 金幣加成：影響擊殺怪物後獲得的資源量
}

/** * 數值加成類型
 */
export enum EffectType {
  ADDITIVE = "ADDITIVE", // 加法：直接增加基礎值 (Base + Value)
  MULTIPLICATIVE = "MULTIPLICATIVE", // 乘法：增加百分比倍率 (Multiplier + Value)
}

/** * 能力稀有度 */
export enum Rarity {
  COMMON = "COMMON",
  RARE = "RARE",
  EPIC = "EPIC",
  LEGEND = "LEGEND",
}

/** * Popup 顯示訊息 */
export interface PopupMessage {
  id: number;
  text: string;
  isClick: boolean;
  isCrit: boolean;
}

/** * 單一屬性的詳細狀態
 * 最終數值通常計算為：value * bonusMultiplier
 */
export interface AttributeState {
  value: number; // 基礎數值 (Base Value)
  bonusMultiplier: number; // 總和乘法加成 (例如 1.5 代表 +50%)
}

/** * 隨機能力升級選項
 * 點擊滿 10 下後產出的「三選一」卡片資料
 */
export interface UpgradeOption {
  id: string; // 唯一識別碼 (通常用 UUID 或隨機字串)
  name: string; // UI 顯示的名稱
  description: string; // 能力的效果描述
  targetAttribute: GameAttribute; // 此升級影響哪一個屬性
  effectType: EffectType; // 影響的方式 (加法或乘法)
  effectValue: number; // 提升的數值
  rarity: Rarity; // 稀有度，用於決定 UI 顏色
  weight: number; // 權重：決定在加權隨機算法中出現的機率
}

/** * 遊戲全域狀態 (Save Data)
 * 包含所有需要持久化或連動的數據
 */
export interface GameState {
  // 角色所有屬性的現況
  attributes: Record<GameAttribute, AttributeState>;

  // 當前關卡與戰鬥進度
  stage: {
    currentLevel: number; // 目前關卡數
    currentHp: number; // 怪物當前剩餘血量
    maxHp: number; // 怪物最大血量上限
    monsterName: string; // 顯示的怪物名稱
    isLucky: boolean; // 是否為金幣史萊姆
    isBoss: boolean; // 是否為 BOSS
    timer: number; // BOSS 剩餘時間 (秒)
    maxTimer: number; // BOSS 總時間
  };

  // 點擊相關計數器
  clickProgress: {
    currentClicks: number; // 當前累積點擊數 (0-10)
    totalClicks: number; // 總點擊次數 (統計與成就用)
    pendingUpgrades: number; // 待使用的升級機會次數
  };

  // 使用者介面狀態
  ui: {
    isUpgradeModalOpen: boolean; // 是否正開啟「三選一」介面
    currentOptions: UpgradeOption[]; // 當前產出的三個升級選項
  };

  // 持有金幣總額
  gold: number;

  // 商店商品
  shop: {
    generalItems: GeneralShopItem[];
    relics: RelicItem[];
  };

  // 當前連擊數
  combo: number;
}

/** 商店商品類型：區分是一般屬性還是特殊文物 */
export enum ShopCategory {
  GENERAL = "GENERAL",
  RELIC = "RELIC",
}

/** 文物專用的特殊效果類型 */
export enum RelicEffectType {
  FINAL_DAMAGE_BOOST = "FINAL_DAMAGE_BOOST", // 最終傷害百分比加成 (例：總傷 +20%)
  DOUBLE_HIT_CHANCE = "DOUBLE_HIT_CHANCE", // 連擊機率 (例：10% 機率造成兩次傷害)
  BOSS_DAMAGE_BONUS = "BOSS_DAMAGE_BONUS", // 對高血量怪物傷害加成
  CRITICAL_DAMAGE_UP = "CRITICAL_DAMAGE_UP", // 暴擊傷害倍率提升 (例：2倍變3倍)
  GOLD_DROP_FIXED = "GOLD_DROP_FIXED", // 擊殺怪物固定額外獲得金幣
  AUTO_CLICKER = "AUTO_CLICKER", // 自動點擊 (每秒產能)
  COMBO_STREAK = "COMBO_STREAK", // 連擊加成
}

/** 一般商店：升級現有的 GameAttribute */
export interface GeneralShopItem {
  id: string;
  name: string;
  description: string;
  targetAttribute: GameAttribute; // 引用原本的 STRENGTH, ATTACK_SPEED 等
  basePrice: number;
  priceMultiplier: number; // 漲價指數 (如 1.5)
  currentLevel: number; // 目前購買等級
}

/** 文物商店：購買獨特效果 */
export interface RelicItem {
  id: string;
  name: string;
  description: string;
  relicEffect: RelicEffectType; // 使用 Enum 控管效果
  effectValue: number;
  price: number;
  isOwned: boolean; // 文物通常為唯一性
}
