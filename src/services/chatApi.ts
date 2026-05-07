export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatApiResponse {
  reply: string;
}

export const GEMINI_MODEL = "gemini-flash-latest";

const GAS_PROXY_URL =
  "https://script.google.com/macros/s/AKfycbyX8Gb41K9uCBDOsZgufvC_G4OiDY5wX181SHb5Gykki4BmXMG3nlhfnY888r8jUbLM/exec";

export async function chatWithAI(
  messages: ChatMessage[],
  timeoutMs = 60000
): Promise<ChatApiResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(GAS_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error("無法連線至 Gemini 代理伺服器 (GAS)");

    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return { reply: data.reply };
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === "AbortError")
        throw new Error(`請求超時（${timeoutMs / 1000}秒），請再試一次。`);
      throw new Error(err.message);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
