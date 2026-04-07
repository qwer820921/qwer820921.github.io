import axios from "axios";
import { TwseStock, TwseResponse } from "../types";
import { formatPrices } from "@/utils/format";

const GAS_URL =
  "https://script.google.com/macros/s/AKfycbzmj2getu2ad8WqLV_AKZJ8h1Y0oMcpsa6xGTFXeivrraWAfw-4uaUoJsPO2daTxBkg/exec";

// 取得 stock list 清單 (包含 ID, Code, Market, Name)
export const fetchStockList = async () => {
  try {
    const response = await axios.get(`${GAS_URL}?action=read`);
    return response.data.stockCodes.map(
      (item: { id: number; code: string; market?: string; name?: string }) => ({
        id: item.id,
        code: item.code,
        market: item.market,
        name: item.name,
      })
    );
  } catch {
    throw new Error("無法獲取股票代號清單");
  }
};

// 1. 證交所 API (TWSE)
export const fetchStockDataTWSE = async (stockCodes: string[]) => {
  try {
    const response = await axios.get(
      `${GAS_URL}?action=twse&codes=${encodeURIComponent(
        JSON.stringify(stockCodes)
      )}&json=1&delay=0`
    );
    const data: TwseResponse = response.data;

    if (!data.msgArray || data.msgArray.length === 0) {
      return [];
    }

    return processStockArray(data.msgArray);
  } catch (error) {
    console.error("Error fetchStockDataTWSE:", error);
    return [];
  }
};

// 統一處理報價邏輯的私有 Helper
const processStockArray = (msgArray: TwseStock[]) => {
  return msgArray.map((stock: TwseStock) => {
    const askPrices = stock.a?.split("_").filter(Boolean) || [];
    const bidPrices = stock.b?.split("_").filter(Boolean) || [];
    const askVolumes = stock.f?.split("_").filter(Boolean) || [];
    const bidVolumes = stock.g?.split("_").filter(Boolean) || [];

    const askCombined = askPrices.map(
      (price, i) => `${formatPrices(price)} (${askVolumes[i] ?? "-"})`
    );
    const bidCombined = bidPrices.map(
      (price, i) => `${formatPrices(price)} (${bidVolumes[i] ?? "-"})`
    );

    const prevClose = parseFloat(stock.y ?? "");
    let currentPrice: number | undefined;
    const possiblePriceFields = [stock.z, bidPrices[0], askPrices[0], stock.o];

    for (const price of possiblePriceFields) {
      const parsedPrice = parseFloat(price ?? "");
      if (!isNaN(parsedPrice) && parsedPrice > 0) {
        currentPrice = parsedPrice;
        break;
      }
    }

    let changePercent: number | undefined = undefined;
    let changePoints: number | undefined = undefined;

    if (!isNaN(prevClose) && currentPrice !== undefined && prevClose > 0) {
      changePercent = parseFloat(
        (((currentPrice - prevClose) / prevClose) * 100).toFixed(2)
      );
      changePoints = parseFloat((currentPrice - prevClose).toFixed(2));
    }

    return {
      ...stock,
      askPrices,
      askVolumes,
      askCombined,
      bidPrices,
      bidVolumes,
      bidCombined,
      changePercent,
      changePoints,
      currentPrice,
    };
  });
};

// 新增股票代號
export const addStockCode = async (newStockCode: string) => {
  try {
    const response = await axios.post(GAS_URL, null, {
      params: {
        action: "create",
        stockCode: newStockCode,
      },
    });
    return response.data;
  } catch (error: any) {
    // 試圖從 Axios 報錯中提取後端回傳的 JSON 錯誤訊息
    const apiError = error.response?.data?.error || error.message;
    throw new Error(apiError || "無法新增股票代號");
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
  } catch {
    throw new Error("無法刪除股票代號");
  }
};
