"use client";

import { ChatMessage, chatWithAI } from "@/services/chatApi";
import React, { useState } from "react";

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ text: string; sender: string }[]>([
    { text: "哈囉！有什麼我可以幫你的嗎？", sender: "bot" },
  ]);
  const [input, setInput] = useState("");
  const [showRedDot, setShowRedDot] = useState(true);
  const [loading, setLoading] = useState(false);

  const toggleChat = () => {
    setIsOpen(!isOpen);
    setShowRedDot(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = { text: input, sender: "user" };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setShowRedDot(false);
    setLoading(true);

    const apiMessages: ChatMessage[] = updatedMessages.map((m) => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.text,
    }));

    try {
      // 先加一個「機器人正在輸入」的假訊息
      setMessages((prev) => [...prev, { text: "...", sender: "bot" }]);

      const { reply } = await chatWithAI(apiMessages);

      // 把剛剛的「...」訊息替換成正式回覆
      setMessages((prev) => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = { text: reply, sender: "bot" };
        return msgs;
      });
    } catch (error: unknown) {
      setMessages((prev) => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = {
          text: error?.toString() || "發生錯誤，請稍後再試。",
          sender: "bot",
        };
        return msgs;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="position-fixed bottom-0 end-0 mb-3 me-3"
      style={{ zIndex: 1050, maxWidth: "320px" }}
    >
      {/* 聊天圖示 */}
      <div className="position-relative">
        <button
          onClick={toggleChat}
          className="btn btn-primary rounded-circle d-flex align-items-center justify-content-center shadow"
          style={{ width: "56px", height: "56px" }}
          aria-label="切換聊天視窗"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            style={{ width: "24px", height: "24px" }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </button>
        {showRedDot && !isOpen && (
          <span
            className="position-absolute bg-danger rounded-circle"
            style={{
              width: "12px",
              height: "12px",
              top: "0",
              right: "0",
              border: "2px solid white",
            }}
          ></span>
        )}
      </div>

      {/* 聊天視窗 */}
      {isOpen && (
        <div className="card mt-2 me-2" style={{ height: "400px" }}>
          <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
            <span className="fw-bold">聊天助手</span>
            <button
              onClick={toggleChat}
              className="btn-close btn-close-white"
              aria-label="關閉聊天視窗"
            ></button>
          </div>
          <div
            className="card-body overflow-auto d-flex flex-column"
            style={{ maxHeight: "calc(100% - 110px)" }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`mb-2 d-flex ${
                  msg.sender === "user"
                    ? "justify-content-end"
                    : "justify-content-start"
                }`}
              >
                <div
                  className={`p-2 rounded ${
                    msg.sender === "user"
                      ? "bg-primary-subtle"
                      : "bg-secondary-subtle"
                  }`}
                  style={{ maxWidth: "75%" }}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
          <div className="card-footer border-top">
            <form onSubmit={handleSendMessage} className="d-flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="輸入消息..."
                className="form-control"
                aria-label="聊天輸入"
                disabled={loading}
                rows={2}
                style={{ resize: "vertical", minHeight: "38px" }}
              />
              <button
                type="submit"
                className="btn btn-primary text-nowrap"
                disabled={loading || !input.trim()}
                aria-label="發送消息"
              >
                發送
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWidget;
