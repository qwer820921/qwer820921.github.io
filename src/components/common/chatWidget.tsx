/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { ChatMessage, chatWithAI, ChatProvider, CHATANYWHERE_MODEL, GEMINI_MODEL } from "@/services/chatApi";
import React, { useState, useRef, useEffect } from "react";

// Typing Indicator Component with animated dots
const TypingIndicator = () => {
  return (
    <div className="d-flex align-items-center gap-1">
      <style jsx>{`
        @keyframes bounce {
          0%, 60%, 100% {
            transform: translateY(0);
          }
          30% {
            transform: translateY(-8px);
          }
        }
        .typing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out;
        }
        .typing-dot:nth-child(1) {
          background: #10b981;
          animation-delay: 0s;
        }
        .typing-dot:nth-child(2) {
          background: #3b82f6;
          animation-delay: 0.2s;
        }
        .typing-dot:nth-child(3) {
          background: #8b5cf6;
          animation-delay: 0.4s;
        }
      `}</style>
      <div className="typing-dot"></div>
      <div className="typing-dot"></div>
      <div className="typing-dot"></div>
    </div>
  );
};

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  
  // 為每個 provider 維護獨立的對話歷史
  const [chatHistories, setChatHistories] = useState<Record<ChatProvider, { text: string; sender: string }[]>>({
    chatanywhere: [{ text: "哈囉！有什麼我可以幫你的嗎？", sender: "bot" }],
    gemini: [{ text: "哈囉！有什麼我可以幫你的嗎？", sender: "bot" }],
  });
  
  const [input, setInput] = useState("");
  const [showRedDot, setShowRedDot] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ChatProvider>("chatanywhere");

  // 當前顯示的訊息（根據選中的 provider）
  const messages = chatHistories[selectedProvider];

  const modelOptions = {
    chatanywhere: `🤖 ChatAnywhere (無聯網) · ${CHATANYWHERE_MODEL}`,
    gemini: `✨ Gemini (聯網) · ${GEMINI_MODEL}`,
  };

  // 拖曳相關狀態
  const [position, setPosition] = useState({ x: 0, y: 0 }); // 相對位移
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const hasMovedRef = useRef(false);

  // 縮放相關狀態
  const [size, setSize] = useState({ width: 350, height: 500 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeType, setResizeType] = useState<'tl' | 'bl' | null>(null);
  const resizeStartRef = useRef<{ x: number; y: number; w: number; h: number; posX: number; posY: number } | null>(null);

  // 開始拖曳
  const handleDragStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    hasMovedRef.current = false;
    dragStartRef.current = {
      x: clientX - position.x,
      y: clientY - position.y,
    };
  };

  // 開始縮放
  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, type: 'tl' | 'bl') => {
    e.stopPropagation();
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    setIsResizing(true);
    setResizeType(type);
    resizeStartRef.current = {
      x: clientX,
      y: clientY,
      w: size.width,
      h: size.height,
      posX: position.x,
      posY: position.y
    };
  };

  // 拖曳中
  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDragging || !dragStartRef.current) return;
    
    const newX = clientX - dragStartRef.current.x;
    const newY = clientY - dragStartRef.current.y;
    
    if (Math.abs(newX - position.x) > 5 || Math.abs(newY - position.y) > 5) {
      hasMovedRef.current = true;
    }

    setPosition({ x: newX, y: newY });
  };

  // 縮放中
  const handleResizeMove = (clientX: number, clientY: number) => {
    if (!isResizing || !resizeStartRef.current) return;
    
    const deltaX = clientX - resizeStartRef.current.x;
    const deltaY = clientY - resizeStartRef.current.y;
    
    // 寬度一律向左增加 (因為視窗靠右固定)
    const newWidth = Math.max(280, resizeStartRef.current.w - deltaX);
    
    let newHeight = resizeStartRef.current.h;
    if (resizeType === 'tl') {
      // 左上：向上拉 (deltaY 為負) 增加高度
      newHeight = Math.max(200, resizeStartRef.current.h - deltaY);
    } else {
      // 左下：向下拉 (deltaY 為正) 增加高度
      // 註：因為視窗固定在底部，增加高度會由底部向上生長，不需改 position
      newHeight = Math.max(200, resizeStartRef.current.h + deltaY);
    }
    
    setSize({ width: newWidth, height: newHeight });
  };

  // 結束拖曳/縮放
  const handleEnd = () => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeType(null);
    dragStartRef.current = null;
    resizeStartRef.current = null;
  };

  // 監聽全局滑鼠/觸摸事件
  // 滑鼠事件
  const onMouseDown = (e: React.MouseEvent) => {
    // 避免拖曳內容或捲軸觸發
    if ((e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;
    handleDragStart(e.clientX, e.clientY);
  };

  // 觸控事件
  const onTouchStart = (e: React.TouchEvent) => {
     // 避免拖曳內容或捲軸觸發
    if ((e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  };

  const toggleChat = () => {
    if (!hasMovedRef.current) {
      const nextOpen = !isOpen;
      if (nextOpen) {
        setPosition({ x: 0, y: 0 }); // 打開時重置位移回到右下角
      }
      setIsOpen(nextOpen);
      setShowRedDot(false);
    }
  };

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
      if (isDragging) handleDragMove(clientX, clientY);
      if (isResizing) handleResizeMove(clientX, clientY);
    };

    if (isDragging || isResizing) {
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", handleEnd);
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", handleEnd);
    }

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging, isResizing]);

  // ... (send message logic)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = { text: input, sender: "user" };
    const updatedMessages = [...messages, userMessage];
    
    // 更新當前 provider 的對話歷史
    setChatHistories(prev => ({
      ...prev,
      [selectedProvider]: updatedMessages
    }));
    
    setInput("");
    setShowRedDot(false);
    setLoading(true);

    const apiMessages: ChatMessage[] = updatedMessages.map((m) => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.text,
    }));

    try {
      // 添加 typing 指示器
      setChatHistories(prev => ({
        ...prev,
        [selectedProvider]: [...prev[selectedProvider], { text: "typing", sender: "bot" }]
      }));
      
      const { reply } = await chatWithAI(apiMessages, selectedProvider);
      
      // 更新最後一條訊息為 AI 回覆
      setChatHistories(prev => {
        const currentHistory = [...prev[selectedProvider]];
        currentHistory[currentHistory.length - 1] = { text: reply, sender: "bot" };
        return {
          ...prev,
          [selectedProvider]: currentHistory
        };
      });
    } catch (error: unknown) {
      // 更新最後一條訊息為錯誤訊息
      setChatHistories(prev => {
        const currentHistory = [...prev[selectedProvider]];
        currentHistory[currentHistory.length - 1] = {
          text: error instanceof Error ? error.message : "發生錯誤，請稍後再試。",
          sender: "bot",
        };
        return {
          ...prev,
          [selectedProvider]: currentHistory
        };
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
        transition: (isDragging || isResizing) ? "none" : "transform 0.3s ease",
      }}
      onTouchEnd={handleEnd}
    >
      {/* 聊天圖示 */}
      {!isOpen && (
        <div className="position-relative">
          <button
            onClick={toggleChat}
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
            className="btn rounded-circle d-flex align-items-center justify-content-center shadow-lg"
            style={{ 
              width: "60px", 
              height: "60px", 
              cursor: "grab",
              background: "linear-gradient(135deg, #0d6efd, #0a58ca)",
              border: "2px solid rgba(255,255,255,0.2)",
              transition: "transform 0.2s ease"
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.1)"}
            onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
            aria-label="切換聊天視窗"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="white"
              style={{ width: "28px", height: "28px", pointerEvents: "none" }}
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
            width: `${size.width}px`, 
            maxWidth: "calc(100vw - 40px)", 
            height: `${size.height}px`,
            maxHeight: "calc(100vh - 120px)", 
            display: "flex", 
            flexDirection: "column",
            borderRadius: "16px",
            overflow: "visible", // 改為 visible 以顯示角落的 handle
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(10px)",
            position: "relative"
          }}
        >
          {/* 左上縮放手把 */}
          <div 
            onMouseDown={(e) => handleResizeStart(e, 'tl')}
            onTouchStart={(e) => handleResizeStart(e, 'tl')}
            style={{
              position: "absolute",
              top: "-5px",
              left: "-5px",
              width: "25px",
              height: "25px",
              cursor: "nw-resize",
              zIndex: 1060,
              backgroundColor: "transparent"
            }}
          />
          {/* 左下縮放手把 */}
          <div 
            onMouseDown={(e) => handleResizeStart(e, 'bl')}
            onTouchStart={(e) => handleResizeStart(e, 'bl')}
            style={{
              position: "absolute",
              bottom: "-5px",
              left: "-5px",
              width: "25px",
              height: "25px",
              cursor: "sw-resize",
              zIndex: 1060,
              backgroundColor: "transparent"
            }}
          />

          <div 
            className="card-header text-white d-flex justify-content-between align-items-center py-2 px-3"
            style={{ 
              background: "linear-gradient(135deg, #0d6efd, #0a58ca)",
              borderBottom: "none",
              borderTopLeftRadius: "16px",
              borderTopRightRadius: "16px"
            }}
          >
            <div className="d-flex align-items-center gap-2 flex-grow-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" className="bi bi-robot" viewBox="0 0 16 16">
                <path d="M6 12.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5ZM3 8.062C3 6.76 4.235 5.765 5.53 5.886a26.58 26.58 0 0 0 4.94 0C11.765 5.765 13 6.76 13 8.062v1.157a.933.933 0 0 1-.765.935c-.845.147-2.34.346-4.235.346-1.895 0-3.39-.2-4.235-.346A.933.933 0 0 1 3 9.219V8.062Zm4.542-.827a.25.25 0 0 0-.217.068l-.92.9a24.767 24.767 0 0 1-1.871-.183.25.25 0 0 0-.068.495c.55.076 1.232.149 2.02.193a.25.25 0 0 0 .189-.071l.754-.736.847 1.71a.25.25 0 0 0 .404.062l.932-.97a25.286 25.286 0 0 0 1.922-.188.25.25 0 0 0-.068-.495c-.538.074-1.207.145-1.98.189a.25.25 0 0 0-.166.076l-.754.785-.842-1.7a.25.25 0 0 0-.182-.135Z"/>
                <path d="M8.5 1.866a1 1 0 1 0-1 0V3h-2A4.5 4.5 0 0 0 1 7.5V8a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1v-.5A4.5 4.5 0 0 0 10.5 3h-2V1.866ZM14 7.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.5A3.5 3.5 0 0 1 5.5 4h5A3.5 3.5 0 0 1 14 7.5Z"/>
              </svg>
              {/* Provider Selector - Bootstrap Dropdown */}
              <div className="dropdown" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                <button
                  className="btn dropdown-toggle text-white fw-bold shadow-none"
                  type="button"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                  style={{
                    cursor: "pointer",
                    paddingRight: "0.75rem",
                    paddingLeft: "0.75rem",
                    paddingTop: "0.4rem",
                    paddingBottom: "0.4rem",
                    background: `linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1))`,
                    backdropFilter: "blur(10px)",
                    border: "1.5px solid rgba(255,255,255,0.3)",
                    borderRadius: "20px",
                    fontSize: "0.85rem",
                    transition: "all 0.3s ease",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)",
                    maxWidth: "250px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "linear-gradient(135deg, rgba(255,255,255,0.3), rgba(255,255,255,0.2))";
                    e.currentTarget.style.transform = "scale(1.02)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1))";
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
                  }}
                >
                  {modelOptions[selectedProvider]}
                </button>
                <ul 
                  className="dropdown-menu"
                  style={{
                    background: "rgba(26, 26, 46, 0.98)",
                    backdropFilter: "blur(10px)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    padding: "0.5rem",
                    minWidth: "220px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.3)"
                  }}
                >
                  <li>
                    <button
                      className="dropdown-item"
                      onClick={() => setSelectedProvider("chatanywhere")}
                      style={{
                        color: "#eee",
                        padding: "0.75rem 1rem",
                        borderRadius: "8px",
                        fontSize: "0.9rem",
                        fontWeight: "500",
                        background: selectedProvider === "chatanywhere" ? "rgba(255,255,255,0.1)" : "transparent",
                        transition: "all 0.2s ease"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.15)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = selectedProvider === "chatanywhere" ? "rgba(255,255,255,0.1)" : "transparent";
                      }}
                    >
                      {modelOptions.chatanywhere}
                    </button>
                  </li>
                  <li>
                    <button
                      className="dropdown-item"
                      onClick={() => setSelectedProvider("gemini")}
                      style={{
                        color: "#eee",
                        padding: "0.75rem 1rem",
                        borderRadius: "8px",
                        fontSize: "0.9rem",
                        fontWeight: "500",
                        background: selectedProvider === "gemini" ? "rgba(255,255,255,0.1)" : "transparent",
                        transition: "all 0.2s ease"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.15)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = selectedProvider === "gemini" ? "rgba(255,255,255,0.1)" : "transparent";
                      }}
                    >
                      {modelOptions.gemini}
                    </button>
                  </li>
                </ul>
              </div>
            </div>
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
            style={{ 
              backgroundColor: "rgba(248, 249, 250, 0.8)", 
              scrollbarWidth: "thin"
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`mb-3 d-flex ${
                  msg.sender === "user"
                    ? "justify-content-end"
                    : "justify-content-start"
                }`}
              >
                <div
                  className={`p-3 rounded-4 ${
                    msg.sender === "user"
                      ? "text-white ms-4"
                      : "text-dark shadow-sm me-4"
                  }`}
                  style={{ 
                    maxWidth: "85%", 
                    wordBreak: "break-word",
                    background: msg.sender === "user" 
                      ? "linear-gradient(135deg, #0d6efd, #0b5ed7)" 
                      : "#fff",
                    borderBottomRightRadius: msg.sender === "user" ? "4px" : "16px",
                    borderBottomLeftRadius: msg.sender === "user" ? "16px" : "4px"
                  }}
                >
                  {msg.text === "typing" ? <TypingIndicator /> : msg.text}
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
                placeholder={selectedProvider === "gemini" ? `問問 ${GEMINI_MODEL}` : `問問 ${CHATANYWHERE_MODEL}`}
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
