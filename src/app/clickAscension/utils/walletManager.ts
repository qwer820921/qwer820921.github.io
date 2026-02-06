/**
 * Wallet Manager - 統一處理貨幣的增減
 * Phase 1.2 of State Management Refactor
 */

import { Wallet, CurrencyType } from "../types";

/**
 * 貨幣類型對應 Wallet 屬性的映射
 */
const currencyToWalletKey: Record<CurrencyType, keyof Wallet> = {
  [CurrencyType.GOLD]: "gold",
  [CurrencyType.CP]: "clickPoints",
  [CurrencyType.DIAMOND]: "diamonds",
  [CurrencyType.LP]: "levelPoints",
  [CurrencyType.AP]: "ascensionPoints",
  [CurrencyType.EQUIPMENT_SHARD]: "equipmentShards",
};

/**
 * 取得指定貨幣的數量
 * @param wallet 錢包物件
 * @param currency 貨幣類型
 * @returns 貨幣數量
 */
export const getCurrencyAmount = (
  wallet: Wallet,
  currency: CurrencyType | string
): number => {
  const key = currencyToWalletKey[currency as CurrencyType];
  if (!key) {
    console.warn(`[WalletManager] Unknown currency type: ${currency}`);
    return 0;
  }
  return wallet[key] || 0;
};

/**
 * 檢查是否有足夠的貨幣
 * @param wallet 錢包物件
 * @param currency 貨幣類型
 * @param amount 需要的數量
 * @returns 是否足夠
 */
export const hasSufficientFunds = (
  wallet: Wallet,
  currency: CurrencyType | string,
  amount: number
): boolean => {
  return getCurrencyAmount(wallet, currency) >= amount;
};

/**
 * 扣除貨幣
 * @param wallet 錢包物件
 * @param currency 貨幣類型
 * @param amount 扣除數量
 * @returns 新的錢包物件 (如果餘額不足則返回原錢包)
 */
export const deductCurrency = (
  wallet: Wallet,
  currency: CurrencyType | string,
  amount: number
): Wallet => {
  if (!hasSufficientFunds(wallet, currency, amount)) {
    console.warn(`[WalletManager] Insufficient funds for ${currency}: need ${amount}, have ${getCurrencyAmount(wallet, currency)}`);
    return wallet;
  }

  const key = currencyToWalletKey[currency as CurrencyType];
  if (!key) return wallet;

  return {
    ...wallet,
    [key]: wallet[key] - amount,
  };
};

/**
 * 增加貨幣
 * @param wallet 錢包物件
 * @param currency 貨幣類型
 * @param amount 增加數量
 * @returns 新的錢包物件
 */
export const addCurrency = (
  wallet: Wallet,
  currency: CurrencyType | string,
  amount: number
): Wallet => {
  const key = currencyToWalletKey[currency as CurrencyType];
  if (!key) {
    console.warn(`[WalletManager] Unknown currency type: ${currency}`);
    return wallet;
  }

  return {
    ...wallet,
    [key]: (wallet[key] || 0) + amount,
  };
};

/**
 * 批量更新多種貨幣
 * @param wallet 錢包物件
 * @param changes 變更陣列 [{ currency, amount }] (正數為增加，負數為扣除)
 * @returns 新的錢包物件
 */
export const updateMultipleCurrencies = (
  wallet: Wallet,
  changes: Array<{ currency: CurrencyType | string; amount: number }>
): Wallet => {
  return changes.reduce((currentWallet, change) => {
    if (change.amount >= 0) {
      return addCurrency(currentWallet, change.currency, change.amount);
    } else {
      return deductCurrency(currentWallet, change.currency, Math.abs(change.amount));
    }
  }, { ...wallet });
};

/**
 * 取得貨幣的顯示名稱
 */
export const getCurrencyName = (currency: CurrencyType | string): string => {
  const names: Record<string, string> = {
    [CurrencyType.GOLD]: "金幣",
    [CurrencyType.CP]: "點擊點數",
    [CurrencyType.DIAMOND]: "鑽石",
    [CurrencyType.LP]: "等級積分",
    [CurrencyType.AP]: "飛昇點數",
    [CurrencyType.EQUIPMENT_SHARD]: "裝備碎片",
  };
  return names[currency] || currency;
};

/**
 * 取得貨幣的圖示
 */
export const getCurrencyIcon = (currency: CurrencyType | string): string => {
  const icons: Record<string, string> = {
    [CurrencyType.GOLD]: "💰",
    [CurrencyType.CP]: "⚡",
    [CurrencyType.DIAMOND]: "💎",
    [CurrencyType.LP]: "🆙",
    [CurrencyType.AP]: "🕊️",
    [CurrencyType.EQUIPMENT_SHARD]: "🔧",
  };
  return icons[currency] || "💵";
};

/**
 * 重置錢包 (用於飛昇)
 * @param wallet 錢包物件
 * @param keepCurrencies 保留的貨幣類型陣列
 * @returns 新的錢包物件
 */
export const resetWallet = (
  wallet: Wallet,
  keepCurrencies: CurrencyType[] = [CurrencyType.AP, CurrencyType.CP, CurrencyType.DIAMOND, CurrencyType.EQUIPMENT_SHARD]
): Wallet => {
  const newWallet: Wallet = {
    gold: 0,
    clickPoints: 0,
    diamonds: 0,
    levelPoints: 0,
    ascensionPoints: 0,
    equipmentShards: 0,
  };

  // 保留指定的貨幣
  for (const currency of keepCurrencies) {
    const key = currencyToWalletKey[currency];
    if (key) {
      newWallet[key] = wallet[key] || 0;
    }
  }

  return newWallet;
};
