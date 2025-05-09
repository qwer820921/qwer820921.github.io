import axios from "axios";
import { TwseStock, TwseResponse } from "../types";

const GAS_URL =
  "https://script.google.com/macros/s/AKfycbyPWEcSZmrfI1KuusgakPTxFDMORuDwqqAX4nlNFA4pv3Ay9d0_ci6VTpTw2qZlXFy9/exec";

// 取得 stock list 字串
export const fetchStockList = async () => {
  try {
    const response = await axios.get(`${GAS_URL}?action=read`);
    // 直接返回包含 id 和 code 的陣列
    return response.data.stockCodes.map(
      (item: { id: number; code: string }) => ({
        id: item.id,
        code: item.code,
      })
    );
  } catch (err) {
    throw new Error("無法獲取股票代號清單");
  }
};

// 根據 stockListStr 抓取股票資料
export const fetchStockData = async (stockListStr: string) => {
  try {
    const response = await axios.get(
      `${GAS_URL}?ex_ch=${encodeURIComponent(stockListStr)}&json=1&delay=0`
    );
    const data: TwseResponse = response.data;

    if (!data.msgArray || data.msgArray.length === 0) {
      throw new Error("API 回傳數據為空");
    }

    return data.msgArray.map((stock: TwseStock) => ({
      ...stock,
      askPrices: stock.a?.split("_").filter(Boolean) || [],
      bidPrices: stock.b?.split("_").filter(Boolean) || [],
      askVolumes: stock.f?.split("_").filter(Boolean) || [],
      bidVolumes: stock.g?.split("_").filter(Boolean) || [],
    }));
  } catch (error) {
    console.error("Error fetchStockData:", error);
  }
};

// 新增股票代號
export const addStockCode = async (newStockCode: string) => {
  try {
    await axios.post(GAS_URL, null, {
      params: {
        action: "create",
        stockCode: newStockCode,
      },
    });
  } catch (error) {
    throw new Error("無法新增股票代號");
  }
};

// 刪除股票代號
export const removeStockCode = async (id: number) => {
  try {
    await axios.post(GAS_URL, null, {
      params: {
        action: "delete",
        id, // 傳遞 id 來刪除
      },
    });
  } catch (error) {
    throw new Error("無法刪除股票代號");
  }
};
