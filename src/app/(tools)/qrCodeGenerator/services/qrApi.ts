// 動態 QR 碼生成與更新 API

// Base URL 這裡先預設寫死，視部署情況再調整
const API_BASE_URL = "https://zyee-core-api.qwer820921.workers.dev";

export interface CreateDynamicQRResponse {
  success: boolean;
  shortId: string;
  shortUrl: string;
  expires_in_days: number;
}

export interface UpdateDynamicQRResponse {
  success: boolean;
  message: string;
}

export const createDynamicQRCode = async (
  targetUrl: string
): Promise<CreateDynamicQRResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/qr/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: targetUrl }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create dynamic QR code: ${response.statusText}`);
  }
  return response.json();
};

export const updateDynamicQRCode = async (
  shortId: string,
  newUrl: string
): Promise<UpdateDynamicQRResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/qr/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shortId, newUrl }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update dynamic QR code: ${response.statusText}`);
  }
  return response.json();
};
