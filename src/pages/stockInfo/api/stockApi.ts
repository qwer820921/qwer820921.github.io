import axios from "axios";
import { TwseStock, TwseResponse } from "../types";
import { formatPrices } from "../../../utils/format";

const GAS_URL =
  "https://script.google.com/macros/s/AKfycbyolCeT20JaxPtv89s6b_r8xrwkqCa2Fw9P_l0t4mC4CgRonWrbeuSpDpYBCuaU0sHd/exec";

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

    return data.msgArray.map((stock: TwseStock) => {
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

      // 計算漲跌幅百分比
      const prevClose = parseFloat(stock.y ?? "");
      const currentPrice = parseFloat(stock.z ?? "");
      let changePercent: number | undefined = undefined;
      let changePoints: number | undefined = undefined;

      if (!isNaN(prevClose) && !isNaN(currentPrice) && prevClose > 0) {
        // 計算漲跌幅百分比
        changePercent = parseFloat(
          (((currentPrice - prevClose) / prevClose) * 100).toFixed(2)
        );

        // 計算漲跌點數
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
        changePoints, // 加上漲跌點數
      };
    });
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
