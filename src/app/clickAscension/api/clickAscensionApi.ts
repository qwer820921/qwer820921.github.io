import axios from "axios";

// Google Apps Script Web App URL for Click Ascension
export const BASE_URL =
  "https://script.google.com/macros/s/AKfycbytd_hvb2K_jpkXM9ZoY5Feyi2ddZYI112UG0cUZpZrTcjZ5IZnsZCwAhU3xSSUYJxj/exec";

export interface ApiResponse<T> {
  success?: boolean;
  exists?: boolean; // For legacy support if needed, but we will follow reference logic
  data?: T;
  error?: string;
  message?: string;
}

/**
 * 載入指定玩家的存檔
 * @param {string} userId - 玩家唯一識別碼
 * @returns {Promise<any | null>} 返回玩家狀態，若無存檔則返回 null
 */
export const loadPlayerSave = async (
  userId: string
): Promise<Record<string, unknown> | null> => {
  try {
    const response = await axios.get(
      `${BASE_URL}?action=load_save&userId=${encodeURIComponent(userId)}`
    );

    // Backend returns { exists: boolean, data: ... } usually based on my GAS script.
    // The reference says "if response.data === 'NotFound'".
    // BUT my GAS script (Step 608) returns JSON: { exists: true, data: ... } or { exists: false, message: ... }
    // I should adapt to what my GAS script actually returns.
    // GAS Script from Step 608:
    // return successResponse({ exists: true, data: saveData });
    // return successResponse({ exists: false, message: 'New user' });

    // So:
    if (response.data && response.data.exists) {
      return response.data.data;
    }
    return null;
  } catch (error) {
    console.error("Error loading player save:", error);
    throw error;
  }
};

/**
 * 儲存/更新玩家進度到雲端
 * @param {string} userId - 玩家唯一識別碼
 * @param {any} saveData - 目前的遊戲狀態
 * @returns {Promise<{ success: boolean }>} 儲存結果
 */
export const savePlayerProgress = async (
  userId: string,
  saveData: Record<string, unknown>
): Promise<{ success: boolean }> => {
  try {
    if (!userId) {
      throw new Error("User ID is required for saving");
    }

    // GAS Script expects JSON body with { action: 'save_progress', userId, saveData }
    // Reference uses axios.post(URL, payload, { headers: { 'Content-Type': 'text/plain' } })
    const payload = {
      action: "save_progress",
      userId,
      saveData,
    };

    const response = await axios.post(BASE_URL, payload, {
      headers: {
        "Content-Type": "text/plain", // Avoid CORS preflight
      },
    });

    // My GAS script returns { success: true, timestamp: ... }
    if (response.data && response.data.success) {
      return { success: true };
    }

    throw new Error("Save operation failed on backend");
  } catch (error) {
    console.error("Error saving player progress:", error);
    throw error;
  }
};

/**
 * 定義靜態遊戲資料的介面
 * 對應 Google Sheet 中的 Settings, Monsters, Upgrades 分頁
 */
export interface GameStaticData {
  settings: Record<string, unknown>;
  monsters: Record<string, unknown>[];
  upgrades: Record<string, unknown>[];
}

/**
 * 獲取所有遊戲設定資料 (從 Google Sheet)
 * @returns {Promise<GameStaticData | null>}
 */
export const getGameConfigs = async (): Promise<GameStaticData | null> => {
  try {
    const response = await axios.get(`${BASE_URL}?action=load_static`);

    // Check if response contains the expected data structure
    if (
      response.data &&
      (response.data.settings ||
        response.data.monsters ||
        response.data.upgrades)
    ) {
      return response.data as GameStaticData;
    }
    return null;
  } catch (error) {
    console.error("Error fetching game configs:", error);
    return null; // Don't throw, just return null so game can use defaults
  }
};

export const clickAscensionApi = {
  loadPlayerSave,
  savePlayerProgress,
  getGameConfigs,
};
