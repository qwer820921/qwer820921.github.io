/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from "axios";

import { GetKlinesParams, KlineData, QuickQueryOption } from "../types";
import { KlineInterval } from "@/constants/intervals";
import { Rule } from "@/types";
// 幣安 API 的 base URL
const BINANCE_BASE_URL = "https://api.binance.com/api/v3";

/**
 * 取得幣種資訊（從 Binance exchangeInfo 轉換為 Rule[] 格式）
 * @returns Rule[]：每個幣種轉為 { key: symbol, value: symbol }
 */
export const getExchangeInfo = async (): Promise<Rule[]> => {
  const response = await axios.get(`${BINANCE_BASE_URL}/exchangeInfo`);
  const symbols = response.data.symbols;

  // 將每個 symbol 對象轉換成 Rule 格式
  const rules: Rule[] = symbols.map((s: any) => ({
    key: s.symbol,
    value: s.symbol,
  }));

  return rules;
};

/**
 * 取得 Binance 支援的時間週期清單（轉換為 Rule[]）
 * @returns Rule[]：像是 { key: "1m", value: "1 分鐘" }
 */
export const getIntervalOptions = (): Rule[] => {
  return Object.entries(KlineInterval).map(([key, value]) => ({
    key,
    value,
  }));
};

/**
 * 取得指定幣種的 K 線資料
 * @param symbol 幣種（如 BTCUSDT）
 * @param interval 時間週期（如 1h、1d）
 * @param startTime 開始時間（timestamp, 毫秒）
 * @param endTime 結束時間（timestamp, 毫秒）
 * @param limit 資料筆數（預設為 500）
 * @returns KlineData[]：回傳 K 線資料陣列
 */
export const getKlines = async ({
  symbol,
  interval,
  startTime,
  endTime,
  limit = 500,
}: GetKlinesParams): Promise<KlineData[]> => {
  const response = await axios.get(`${BINANCE_BASE_URL}/klines`, {
    params: {
      symbol,
      interval,
      startTime,
      endTime,
      limit,
    },
  });
  return response.data;
};

/**
 * 預設的快速查詢選項（用於建立快捷按鈕）
 * 每個選項包含 symbol, interval, limit 與顯示用 value
 * @returns QuickQueryOption[]：可供 UI 使用的預設查詢清單
 */
export const getQuickQueryOptions = (): QuickQueryOption[] => {
  return [
    {
      symbol: "BTCUSDT",
      value: "BTC/USDT - 60分K",
      interval: "1h",
      limit: 100,
    },
    {
      symbol: "ETHUSDT",
      value: "ETH/USDT - 15分K",
      interval: "15m",
      limit: 200,
    },
    {
      symbol: "BNBUSDT",
      value: "BNB/USDT - 日K",
      interval: "1d",
      limit: 100,
    },
    {
      symbol: "BTCUSDT",
      value: "BTC/USDT - 5分K",
      interval: "5m",
      limit: 50,
    },
  ];
};
