import axios from "axios";
import { LotteryPeriod } from "../types";

// 直接呼叫財政部 API（靜態導出不支援 API routes）
// 如果遇到 CORS 問題，可以使用 CORS proxy
const DIRECT_XML_URL = "https://invoice.etax.nat.gov.tw/invoice.xml";
const CORS_PROXY = "https://corsproxy.io/?";
const XML_URL = CORS_PROXY + encodeURIComponent(DIRECT_XML_URL);

/**
 * XML 解析後的原始資料結構
 */
interface XmlPeriodData {
  title: string; // 期別標題，例如 "113年11-12月 第6次開獎"
  superPrizeNo: string; // 特別獎號碼
  spcPrizeNo: string; // 特獎號碼
  firstPrizeNo: string[]; // 頭獎號碼陣列
  sixthPrizeNo: string[]; // 增開六獎號碼陣列
}

/**
 * 從 XML 回應中解析中獎號碼資料
 * @param {string} xmlText - XML 文字內容
 * @returns {XmlPeriodData[]} 解析後的期別資料陣列
 */
const parseInvoiceXml = (xmlText: string): XmlPeriodData[] => {
  const results: XmlPeriodData[] = [];

  try {
    // 使用 DOMParser 解析 XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    // 取得所有期別
    const items = xmlDoc.querySelectorAll("item");

    items.forEach((item) => {
      const title = item.querySelector("title")?.textContent || "";

      // 解析描述內容
      const description = item.querySelector("description")?.textContent || "";

      // 使用正則表達式解析各獎項
      const superPrizeMatch = description.match(/特別獎[：:]\s*(\d{8})/);
      const spcPrizeMatch = description.match(/特獎[：:]\s*(\d{8})/);
      const firstPrizeMatch = description.match(/頭獎[：:]\s*([\d、,\s]+)/);
      const sixthPrizeMatch = description.match(/增開六獎[：:]\s*([\d、,\s]+)/);

      // 解析頭獎號碼（可能有多組）
      const firstPrizeNo: string[] = [];
      if (firstPrizeMatch && firstPrizeMatch[1]) {
        const numbers = firstPrizeMatch[1].split(/[、,\s]+/);
        numbers.forEach((num) => {
          const cleaned = num.trim();
          if (cleaned.length === 8 && /^\d+$/.test(cleaned)) {
            firstPrizeNo.push(cleaned);
          }
        });
      }

      // 解析增開六獎號碼
      const sixthPrizeNo: string[] = [];
      if (sixthPrizeMatch && sixthPrizeMatch[1]) {
        const numbers = sixthPrizeMatch[1].split(/[、,\s]+/);
        numbers.forEach((num) => {
          const cleaned = num.trim();
          if (cleaned.length === 3 && /^\d+$/.test(cleaned)) {
            sixthPrizeNo.push(cleaned);
          }
        });
      }

      if (
        title &&
        (superPrizeMatch || spcPrizeMatch || firstPrizeNo.length > 0)
      ) {
        results.push({
          title,
          superPrizeNo: superPrizeMatch ? superPrizeMatch[1] : "",
          spcPrizeNo: spcPrizeMatch ? spcPrizeMatch[1] : "",
          firstPrizeNo,
          sixthPrizeNo,
        });
      }
    });
  } catch (error) {
    console.error("Error parsing XML:", error);
  }

  return results;
};

/**
 * 從期別標題解析期別資訊
 * @param {string} title - 期別標題，例如 "113年11-12月 第6次開獎"
 * @returns {{ period: string, drawDate: string }} 期別資訊
 */
const parsePeriodFromTitle = (
  title: string
): { period: string; drawDate: string } => {
  // 嘗試匹配格式 "113年11-12月"
  const match = title.match(/(\d+)年(\d+)-(\d+)月/);
  if (match) {
    return {
      period: `${match[1]}年${match[2]}-${match[3]}月`,
      drawDate: title,
    };
  }
  return {
    period: title,
    drawDate: title,
  };
};

/**
 * 將 XML 解析資料轉換為 LotteryPeriod 格式
 * @param {XmlPeriodData} xmlData - XML 解析後的資料
 * @returns {LotteryPeriod} 標準化的期別資料
 */
const convertToLotteryPeriod = (xmlData: XmlPeriodData): LotteryPeriod => {
  const { period, drawDate } = parsePeriodFromTitle(xmlData.title);

  return {
    period,
    drawDate,
    specialPrize: xmlData.superPrizeNo,
    grandPrize: xmlData.spcPrizeNo,
    firstPrize: xmlData.firstPrizeNo,
    additionalSixth: xmlData.sixthPrizeNo,
  };
};

/**
 * 從財政部 XML 來源取得中獎號碼
 * @returns {Promise<LotteryPeriod[]>} 中獎號碼資料陣列
 * @throws {Error} 如果請求失敗
 */
export const fetchWinningListFromXml = async (): Promise<LotteryPeriod[]> => {
  try {
    const response = await axios.get(XML_URL, {
      responseType: "text",
      headers: {
        Accept: "application/xml, text/xml, */*",
      },
    });

    const xmlData = parseInvoiceXml(response.data);

    if (xmlData.length === 0) {
      throw new Error("No data found in XML response");
    }

    return xmlData.map(convertToLotteryPeriod);
  } catch (error) {
    console.error("Error fetching winning list from XML:", error);
    throw error;
  }
};

/**
 * 智慧取得中獎號碼
 * @param {number} index - 期別索引，0 為最新一期
 * @returns {Promise<LotteryPeriod>} 中獎號碼資料
 * @throws {Error} 如果 API 無法取得
 */
export const getWinningList = async (
  index: number = 0
): Promise<LotteryPeriod> => {
  const periods = await fetchWinningListFromXml();
  if (periods.length > index) {
    return periods[index];
  }
  // 如果索引超出範圍，返回最新一期
  return periods[0];
};

/**
 * 取得所有期別的中獎號碼
 * @returns {Promise<LotteryPeriod[]>} 所有期別的中獎號碼資料
 */
export const getAllWinningLists = async (): Promise<LotteryPeriod[]> => {
  return await fetchWinningListFromXml();
};
