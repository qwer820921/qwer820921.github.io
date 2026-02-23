import axios from "axios";
import { ApiResponse, Novel, ChapterSummary, ChapterContent } from "../types";

// Google Apps Script Web App URL
// 建議未來可移至環境變數 process.env.NEXT_PUBLIC_GAS_NOVEL_API
export const BASE_URL = "https://script.google.com/macros/s/AKfycbyXrD_ddpu_Z9w-DeUroC4mniQrwKsHdCQWbaE3o2dDlwSvHVB3fLapwepgA3dFaDfi4Q/exec";

/**
 * 獲取所有書籍資料（圖書館首頁用）
 * 發送 GET 請求到後端，獲取包含最新章節與總字數的書籍清單
 * @returns {Promise<ApiResponse<Novel[]>>} 包含所有書籍資料的響應物件
 * @throws {Error} 如果請求失敗或後端返回錯誤格式
 */
export const getLibraryData = async (): Promise<ApiResponse<Novel[]>> => {
  try {
    const response = await axios.get(`${BASE_URL}?action=getLibrary`);
    
    // 確認響應格式與成功狀態
    if (!response.data || typeof response.data.success !== "boolean") {
      throw new Error("Unexpected response format: Expected success boolean");
    }
    if (response.data.success && !Array.isArray(response.data.data)) {
      throw new Error("Unexpected response format: Expected data to be an array");
    }
    
    return response.data as ApiResponse<Novel[]>;
  } catch (error) {
    console.error("Error fetching library data:", error);
    throw error;
  }
};

/**
 * 查詢指定書籍的章節目錄
 * 發送 GET 請求到後端，獲取該書所有已公開的章節簡要資訊
 * @param {string} bookId - 指定的書籍 ID (例如: "N001")
 * @returns {Promise<ApiResponse<ChapterSummary[]>>} 包含章節目錄資料的響應物件
 * @throws {Error} 如果 bookId 無效或請求失敗
 */
export const getChaptersData = async (bookId: string): Promise<ApiResponse<ChapterSummary[]>> => {
  try {
    // 驗證必填欄位
    if (!bookId || typeof bookId !== "string") {
      throw new Error("Book ID is required and must be a string");
    }

    const response = await axios.get(`${BASE_URL}?action=getChapters&bookId=${bookId}`);
    
    // 確認響應格式與成功狀態
    if (!response.data || typeof response.data.success !== "boolean") {
      throw new Error("Unexpected response format: Expected success boolean");
    }
    if (response.data.success && !Array.isArray(response.data.data)) {
      throw new Error("Unexpected response format: Expected data to be an array");
    }

    return response.data as ApiResponse<ChapterSummary[]>;
  } catch (error) {
    console.error(`Error fetching chapters for book ${bookId}:`, error);
    throw error;
  }
};

/**
 * 獲取單一章節的完整內文
 * 發送 GET 請求到後端，獲取包含 50 萬字小說內文與作者的話
 * @param {string} bookId - 指定的書籍 ID
 * @param {number} chapterIndex - 指定的章節序號
 * @returns {Promise<ApiResponse<ChapterContent>>} 包含單一章節完整內容的響應物件
 * @throws {Error} 如果參數無效或請求失敗
 */
export const getChapterContentData = async (
  bookId: string,
  chapterIndex: number
): Promise<ApiResponse<ChapterContent>> => {
  try {
    // 驗證必填欄位
    if (!bookId || typeof bookId !== "string") {
      throw new Error("Book ID is required and must be a string");
    }
    if (!Number.isInteger(chapterIndex) || chapterIndex <= 0) {
      throw new Error("Chapter Index must be a positive integer");
    }

    const response = await axios.get(
      `${BASE_URL}?action=getChapterContent&bookId=${bookId}&chapterIndex=${chapterIndex}`
    );

    // 確認響應格式
    if (!response.data || typeof response.data.success !== "boolean") {
      throw new Error("Unexpected response format: Expected success boolean");
    }
    
    // 內容取得失敗時 (例如查無此章節)，拋出錯誤交由前端 UI 處理
    if (!response.data.success) {
      throw new Error(response.data.error || "Failed to fetch chapter content");
    }

    return response.data as ApiResponse<ChapterContent>;
  } catch (error) {
    console.error(`Error fetching content for book ${bookId}, chapter ${chapterIndex}:`, error);
    throw error;
  }
};