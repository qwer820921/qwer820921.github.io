import { Food } from "../types";
import axios from "axios";

// Google Apps Script Web App URL
export const BASE_URL =
  "https://script.google.com/macros/s/AKfycbxo9lgXGePlAnI6qU0d1Iaaz4y4xlnHoL2VRBwEPIbxXt02Hc3_F1ChEQmRIe12W056QQ/exec";

/**
 * 獲取所有食物資料（不限群組）
 * 發送 GET 請求到後端，無需指定 group 參數
 * @returns {Promise<Food[]>} 包含所有食物資料的陣列
 * @throws {Error} 如果請求失敗或後端返回錯誤
 */
export const getAllFoodData = async (): Promise<Food[]> => {
  try {
    const response = await axios.get(BASE_URL);
    // 確認響應數據為陣列
    if (!Array.isArray(response.data)) {
      throw new Error("Unexpected response format: Expected an array");
    }
    return response.data as Food[];
  } catch (error) {
    console.error("Error fetching all food data:", error);
    throw error;
  }
};

/**
 * 查詢指定分組的食物資料
 * 發送 GET 請求到後端，包含 group 查詢參數
 * @param {number} group - 指定的分組編號
 * @returns {Promise<Food[]>} 包含指定分組食物資料的陣列
 * @throws {Error} 如果 group 無效或請求失敗
 */
export const getFoodData = async (group: number): Promise<Food[]> => {
  try {
    // 驗證 group 為整數
    if (!Number.isInteger(group)) {
      throw new Error("Group must be an integer");
    }
    const response = await axios.get(`${BASE_URL}?group=${group}`);
    // 確認響應數據為陣列
    if (!Array.isArray(response.data)) {
      throw new Error("Unexpected response format: Expected an array");
    }
    return response.data as Food[];
  } catch (error) {
    console.error("Error fetching food data:", error);
    throw error;
  }
};

/**
 * 新增食物資料（不包含 id，由後端產生）
 * 發送 POST 請求到後端，包含 action: 'create'
 * @param {Omit<Food, "id">} food - 食物資料（不包含 id）
 * @param {number} group - 所屬分組編號
 * @returns {Promise<{ success: boolean; id: number }>} 後端返回的成功狀態和新記錄 ID
 * @throws {Error} 如果請求失敗或後端返回錯誤
 */
export const addFoodData = async (
  food: Omit<Food, "id">,
  group: number
): Promise<{ success: boolean; id: number }> => {
  try {
    // 驗證必填欄位
    if (!food.name) {
      throw new Error("Name is required");
    }
    // 驗證 group 為整數
    if (!Number.isInteger(group)) {
      throw new Error("Group must be an integer");
    }
    // 驗證 coordinates（如果提供）
    if (
      food.coordinates &&
      (typeof food.coordinates.lat !== "number" ||
        typeof food.coordinates.lng !== "number")
    ) {
      throw new Error("Coordinates must contain valid lat and lng numbers");
    }

    const response = await axios.post(
      BASE_URL,
      {
        action: "create",
        name: food.name,
        address: food.address || "",
        coordinates: food.coordinates || null,
        group: group,
      },
      {
        headers: {
          "Content-Type": "text/plain",
        },
        withCredentials: false,
      }
    );

    // 確認響應格式
    if (!response.data.success || !Number.isInteger(response.data.id)) {
      throw new Error("Unexpected response format: Expected success and id");
    }
    return response.data;
  } catch (error) {
    console.error("Error adding food data:", error);
    throw error;
  }
};

/**
 * 更新食物資料（根據 id 和 group）
 * 發送 POST 請求到後端，包含 action: 'update'
 * @param {Food} food - 完整食物資料（包含 id）
 * @returns {Promise<{ success: boolean }>} 後端返回的成功狀態
 * @throws {Error} 如果請求失敗或後端返回錯誤
 */
export const updateFoodData = async (
  food: Food
): Promise<{ success: boolean }> => {
  try {
    // 驗證必填欄位
    if (!Number.isInteger(food.id)) {
      throw new Error("ID must be an integer");
    }
    if (!Number.isInteger(food.group)) {
      throw new Error("Group must be an integer");
    }
    if (!food.name) {
      throw new Error("Name is required");
    }
    // 驗證 coordinates（如果提供）
    if (
      food.coordinates &&
      (typeof food.coordinates.lat !== "number" ||
        typeof food.coordinates.lng !== "number")
    ) {
      throw new Error("Coordinates must contain valid lat and lng numbers");
    }

    const response = await axios.post(
      BASE_URL,
      {
        action: "update",
        id: food.id,
        name: food.name,
        address: food.address || "",
        coordinates: food.coordinates || null,
        group: food.group,
      },
      {
        headers: {
          "Content-Type": "text/plain",
        },
        withCredentials: false,
      }
    );

    // 確認響應格式
    if (!response.data.success) {
      throw new Error("Unexpected response format: Expected success");
    }
    return response.data;
  } catch (error) {
    console.error("Error updating food data:", error);
    throw error;
  }
};

/**
 * 刪除指定食物資料
 * 發送 POST 請求到後端，包含 action: 'delete'
 * @param {number} id - 食物 ID
 * @param {number} group - 所屬分組編號
 * @returns {Promise<{ success: boolean }>} 後端返回的成功狀態
 * @throws {Error} 如果請求失敗或後端返回錯誤
 */
export const deleteFoodData = async (
  id: number,
  group: number
): Promise<{ success: boolean }> => {
  try {
    // 驗證輸入
    if (!Number.isInteger(id)) {
      throw new Error("ID must be an integer");
    }
    if (!Number.isInteger(group)) {
      throw new Error("Group must be an integer");
    }

    const response = await axios.post(
      BASE_URL,
      {
        action: "delete",
        id,
        group,
      },
      {
        headers: {
          "Content-Type": "text/plain",
        },
        withCredentials: false,
      }
    );

    // 確認響應格式
    if (!response.data.success) {
      throw new Error("Unexpected response format: Expected success");
    }
    return response.data;
  } catch (error) {
    console.error("Error deleting food data:", error);
    throw error;
  }
};
