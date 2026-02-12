export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatApiResponse {
  reply: string;
}

export type ChatProvider = "chatanywhere" | "gemini";

// --- ChatAnywhere (OpenAI Compatible) ---
export const CHATANYWHERE_MODEL = "gpt-4o-mini";
const CHATANYWHERE_API_URL = "https://api.chatanywhere.tech/v1/chat/completions";
const CHATANYWHERE_API_KEY = process.env.NEXT_PUBLIC_CHATANYWHERE_API_KEY || "";

// --- Google Gemini (透過 GAS 代理) ---
export const GEMINI_MODEL = "gemini-flash-latest";

/**
 * 重要通知：
 * 由於網站部署於 GitHub Pages (靜態網站)，為了隱藏 Gemini API Key，
 * 我們透過 Google Apps Script (GAS) 進行代理。
 * ChatAnywhere 則維持原有的直接呼叫方式。
 */

// 請將此處替換為您部署新專案 GitHub-Page-Gemini-Safe-Proxy 後取得的網址
const GAS_PROXY_URL = "https://script.google.com/macros/s/AKfycbyX8Gb41K9uCBDOsZgufvC_G4OiDY5wX181SHb5Gykki4BmXMG3nlhfnY888r8jUbLM/exec";

// Helper: ChatAnywhere (直接呼叫)
async function chatWithChatAnywhere(
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<string> {
  if (!CHATANYWHERE_API_KEY) {
    throw new Error("ChatAnywhere API Key 未設定");
  }

  const res = await fetch(CHATANYWHERE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CHATANYWHERE_API_KEY}`,
    },
    body: JSON.stringify({ model: CHATANYWHERE_MODEL, messages }),
    signal,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.error?.message || res.statusText || "ChatAnywhere 呼叫失敗");
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "無回覆內容";
}

// Helper: Gemini (透過 GAS 代理呼叫)
async function chatWithGeminiProxy(
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<string> {
  const res = await fetch(GAS_PROXY_URL, {
    method: "POST",
    headers: { 
      "Content-Type": "text/plain;charset=utf-8" 
    },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!res.ok) {
    throw new Error("無法連線至 Gemini 代理伺服器 (GAS)");
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.reply;
}

// Main Function
export async function chatWithAI(
  messages: ChatMessage[],
  provider: ChatProvider = "chatanywhere",
  timeoutMs = 60000 
): Promise<ChatApiResponse> {
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let reply = "";
    
    if (provider === "gemini") {
      reply = await chatWithGeminiProxy(messages, controller.signal);
    } else {
      reply = await chatWithChatAnywhere(messages, controller.signal);
    }
    
    return { reply };

  } catch (err: unknown) {
    if (err instanceof Error) {
        if (err.name === 'AbortError') {
            throw new Error(`請求超時（${timeoutMs/1000}秒），請再試一次。`);
        }
        throw new Error(err.message);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
