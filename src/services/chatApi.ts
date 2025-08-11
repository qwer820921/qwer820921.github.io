export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatApiResponse {
  reply: string;
}

const API_URL = "https://api.chatanywhere.tech/v1/chat/completions";

// 建議用 env 變數注入你的 API Key
const API_KEY = process.env.NEXT_PUBLIC_CHATANYWHERE_API_KEY || "";

export async function chatWithAI(
  messages: ChatMessage[],
  model = "gpt-4o-mini",
  timeoutMs = 15000
): Promise<ChatApiResponse> {
  if (!API_KEY) {
    throw new Error(
      "API Key 未設定，請在環境變數 NEXT_PUBLIC_CHATANYWHERE_API_KEY 設定"
    );
  }

  // 超時處理，避免請求卡死
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      const errorMsg =
        errorData?.error?.message || res.statusText || "API 呼叫失敗";
      throw new Error(errorMsg);
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      throw new Error("API 回傳格式錯誤或無回覆內容");
    }

    return { reply };
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw new Error(err.message);
    }
    throw err;
  }
}
