import axios from "axios";
import { TwseStock, TwseResponse } from "../types";
import { formatPrices } from "../../../utils/format";

const GAS_URL =
  "https://script.google.com/macros/s/AKfycbxu5MVPUWIXFzxOM6lFjp3MpeyxMjg2rnjpZlxoFYGBHvnOFqrjJdYv1ZBMllVXAM51/exec";

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
      `${GAS_URL}?action=twse&ex_ch=${encodeURIComponent(stockListStr)}&json=1&delay=0`
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

      // 優先檢查 stock.z，若無效則依序檢查 bidPrices[0], askPrices[0], stock.o
      let currentPrice: number | undefined;
      const possiblePriceFields = [
        stock.z, // 最新成交價
        bidPrices[0], // 第一檔買價
        askPrices[0], // 第一檔賣價
        stock.o, // 開盤價
      ];

      for (const price of possiblePriceFields) {
        const parsedPrice = parseFloat(price ?? "");
        if (!isNaN(parsedPrice) && parsedPrice > 0) {
          currentPrice = parsedPrice;
          break;
        }
      }

      // 計算漲跌幅
      let changePercent: number | undefined = undefined;
      let changePoints: number | undefined = undefined;

      if (!isNaN(prevClose) && currentPrice !== undefined && prevClose > 0) {
        // 計算漲跌幅百分比
        changePercent = parseFloat(
          (((currentPrice - prevClose) / prevClose) * 100).toFixed(2)
        );

        // 計算漲跌點數
        changePoints = parseFloat((currentPrice - prevClose).toFixed(2));
      } else {
        console.warn(
          `No valid price found for stock ${stock.c} (${stock.n}), using undefined for change calculations`
        );
      }

      return {
        ...stock, // 原始 API 回傳的股票數據，包含 c（股票代碼）、n（股票名稱）、z（原始現價，可能為 "-"）、y（昨日收盤價）等欄位
        askPrices, // 賣價陣列，從 stock.a 解析而來，包含五檔賣價（例如 ["989.0000", "990.0000", ...]）
        askVolumes, // 賣單量陣列，從 stock.f 解析而來，對應五檔賣價的成交量（例如 ["157", "645", ...]）
        askCombined, // 賣價與賣單量組合陣列，格式為 "價格 (成交量)"（例如 ["989.00 (157)", "990.00 (645)", ...]）
        bidPrices, // 買價陣列，從 stock.b 解析而來，包含五檔買價（例如 ["988.0000", "987.0000", ...]）
        bidVolumes, // 買單量陣列，從 stock.g 解析而來，對應五檔買價的成交量（例如 ["368", "241", ...]）
        bidCombined, // 買價與買單量組合陣列，格式為 "價格 (成交量)"（例如 ["988.00 (368)", "987.00 (241)", ...]）
        changePercent, // 漲跌幅百分比，基於 (currentPrice - 昨日收盤價) / 昨日收盤價 * 100，保留兩位小數（例如 1.96，若無有效現價則為 undefined）
        changePoints, // 漲跌點數，基於 currentPrice - 昨日收盤價，保留兩位小數（例如 19.00，若無有效現價則為 undefined）
        currentPrice, // 整理後的現價，優先從 stock.z 取得，若 stock.z 無效（例如 "-"）則依序從第一檔買價（bidPrices[0]）、第一檔賣價（askPrices[0]）、開盤價（stock.o）取得（例如 988.0 或 181.65，若均無效則為 undefined）
      };
    });
  } catch (error) {
    console.error("Error fetchStockData:", error);
  }
};

export const fetchStockData2 = async () => {
  try {
    // 使用測試的假資料
    const symbols = "2330.TW,0050.TW,0056.TW";

    const response = await axios.get(
      `${GAS_URL}?action=yahoo&symbols=${encodeURIComponent(symbols)}`
    );

    // 假設你想查看回傳資料
    console.log(response.data);
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
