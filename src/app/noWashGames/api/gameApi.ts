import axios from "axios";
import { GameState, UpgradeOption, GeneralShopItem, RelicItem } from "../types";

// Google Apps Script Web App URL (請替換為你部署後的實際網址)
export const BASE_URL =
  "https://script.google.com/macros/s/AKfycbztLuM47hvLMEDzhNIxuZHM-P6hgo1K4_PIje2NfwQug9E8keM2HtuwyI0M8dQyikcjUA/exec";

/**
 * 定義設定檔的響應格式
 */
export interface GameConfigs {
  upgradePool: UpgradeOption[];
  generalShop: GeneralShopItem[];
  relics: RelicItem[];
}

/**
 * 獲取所有遊戲設定資料 (從 Config 工作表)
 * @returns {Promise<GameConfigs>} 包含能力池、商店、文物的物件
 */
export const getGameConfigs = async (): Promise<GameConfigs> => {
  try {
    const response = await axios.get(`${BASE_URL}?action=getConfigs`);

    // 驗證必要的欄位是否存在
    if (
      !response.data.upgradePool ||
      !response.data.generalShop ||
      !response.data.relics
    ) {
      throw new Error(
        "Unexpected response format: Missing game configurations"
      );
    }

    return response.data as GameConfigs;
  } catch (error) {
    console.error("Error fetching game configs:", error);
    throw error;
  }
};

/**
 * 載入指定玩家的存檔
 * @param {string} userId - 玩家唯一識別碼
 * @returns {Promise<GameState | null>} 返回玩家狀態，若無存檔則返回 null
 */
export const loadPlayerSave = async (
  userId: string
): Promise<GameState | null> => {
  try {
    const response = await axios.get(
      `${BASE_URL}?action=loadSave&userId=${userId}`
    );

    // 如果後端返回 "NotFound" 則代表無存檔
    if (response.data === "NotFound") {
      return null;
    }

    return response.data as GameState;
  } catch (error) {
    console.error("Error loading player save:", error);
    throw error;
  }
};

/**
 * 儲存/更新玩家進度到雲端
 * @param {string} userId - 玩家唯一識別碼
 * @param {GameState} gameState - 目前的遊戲狀態
 * @returns {Promise<{ success: boolean }>} 儲存結果
 */
export const savePlayerProgress = async (
  userId: string,
  gameState: GameState
): Promise<{ success: boolean }> => {
  try {
    // 驗證必要的 ID
    if (!userId) {
      throw new Error("User ID is required for saving");
    }

    const response = await axios.post(
      BASE_URL,
      {
        userId: userId,
        gameState: gameState,
      },
      {
        headers: {
          "Content-Type": "text/plain", // 避免 CORS 預檢請求
        },
        withCredentials: false,
      }
    );

    // 根據 GAS 的傳回值判定成功 (我們之前寫的是傳回 "Save Success")
    if (response.data === "Save Success" || response.data.success) {
      return { success: true };
    }

    throw new Error("Save operation failed on backend");
  } catch (error) {
    console.error("Error saving player progress:", error);
    throw error;
  }
};
