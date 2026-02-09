"use client";

import { ChatMessage, chatWithAI } from "@/services/chatApi";
import React, { useState, useRef, useEffect } from "react";

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ text: string; sender: string }[]>([
    { text: "哈囉！有什麼我可以幫你的嗎？", sender: "bot" },
  ]);
  const [input, setInput] = useState("");
  const [showRedDot, setShowRedDot] = useState(true);
  const [loading, setLoading] = useState(false);

  // 拖曳相關狀態
  const [position, setPosition] = useState({ x: 0, y: 0 }); // 相對位移
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const hasMovedRef = useRef(false);

  // 開始拖曳
  const handleDragStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    hasMovedRef.current = false;
    dragStartRef.current = {
      x: clientX - position.x,
      y: clientY - position.y,
    };
  };

  // 拖曳中
  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDragging || !dragStartRef.current) return;
    
    const newX = clientX - dragStartRef.current.x;
    const newY = clientY - dragStartRef.current.y;
    
    // 簡單的防抖動檢查，移動超過 5px 才算拖曳
    if (Math.abs(newX - position.x) > 5 || Math.abs(newY - position.y) > 5) {
      hasMovedRef.current = true;
    }

    setPosition({ x: newX, y: newY });
  };

  // 結束拖曳
  const handleDragEnd = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // 滑鼠事件
  const onMouseDown = (e: React.MouseEvent) => {
    // 避免拖曳內容或捲軸觸發
    if ((e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT") return;
    handleDragStart(e.clientX, e.clientY);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientX, e.clientY);
    const onMouseUp = () => handleDragEnd();

    if (isDragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging]);

  // 觸控事件
  const onTouchStart = (e: React.TouchEvent) => {
     // 避免拖曳內容或捲軸觸發
    if ((e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT") return;
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleDragMove(touch.clientX, touch.clientY);
  };

  const toggleChat = () => {
    if (!hasMovedRef.current) {
      if (!isOpen) {
        setPosition({ x: 0, y: 0 }); // 開啟時重置位置
      }
      setIsOpen(!isOpen);
      setShowRedDot(false);
    }
  };

  // ... (send message logic)
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
      setMessages((prev) => [...prev, { text: "...", sender: "bot" }]);
      const { reply } = await chatWithAI(apiMessages);
      setMessages((prev) => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = { text: reply, sender: "bot" };
        return msgs;
      });
    } catch (error: unknown) {
      setMessages((prev) => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = {
           text: error instanceof Error ? error.message : "發生錯誤，請稍後再試。",
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
      ref={widgetRef}
      className="position-fixed"
      style={{
        zIndex: 1050,
        bottom: "20px",
        right: "20px",
        transform: `translate(${position.x}px, ${position.y}px)`,
        touchAction: "none",
        cursor: isDragging ? "grabbing" : "default",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        transition: isDragging ? "none" : "transform 0.3s ease", // 非拖曳時有動畫效果
      }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={handleDragEnd}
    >
      {/* 聊天圖示 */}
      {!isOpen && (
        <div className="position-relative">
          <button
            onClick={toggleChat}
            className="btn btn-primary rounded-circle d-flex align-items-center justify-content-center shadow"
            style={{ width: "56px", height: "56px", cursor: "grab" }}
            aria-label="切換聊天視窗"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              style={{ width: "24px", height: "24px", pointerEvents: "none" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </button>
          {showRedDot && (
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
      )}

      {/* 聊天視窗 */}
      {isOpen && (
        <div 
          className="card shadow-lg border-0" 
          style={{ 
            width: "320px", 
            maxWidth: "calc(100vw - 40px)", // 防止超出小螢幕
            height: "450px",
            maxHeight: "calc(100vh - 120px)", // 防止超出高度
            display: "flex", 
            flexDirection: "column" 
          }}
        >
          <div 
            className="card-header bg-primary text-white d-flex justify-content-between align-items-center py-2"
            style={{ cursor: "grab" }}
          >
            <span className="fw-bold user-select-none">聊天助手</span>
            <button
              onClick={() => setIsOpen(false)}
              className="btn-close btn-close-white"
              aria-label="關閉聊天視窗"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            ></button>
          </div>
          <div
            className="card-body overflow-auto d-flex flex-column flex-grow-1 p-3"
            style={{ background: "#f8f9fa" }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
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
                      ? "bg-primary text-white"
                      : "bg-white text-dark shadow-sm"
                  }`}
                  style={{ maxWidth: "85%", wordBreak: "break-word" }}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
          <div 
            className="card-footer border-top p-2 bg-white"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleSendMessage} className="d-flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="輸入消息..."
                className="form-control"
                aria-label="聊天輸入"
                disabled={loading}
                rows={1}
                style={{ resize: "none", minHeight: "38px", maxHeight: "80px" }}
              />
              <button
                type="submit"
                className="btn btn-primary text-nowrap align-self-end"
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
