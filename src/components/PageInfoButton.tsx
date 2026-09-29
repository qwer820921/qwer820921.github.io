"use client";
import { useState, useEffect, useRef } from "react";

interface PageInfoButtonProps {
  title: string;
  description: React.ReactNode;
  /** 一進頁面是否展開說明（預設展開）；說明會蓋住頁面上方操作的頁面傳 false */
  defaultOpen?: boolean;
}

export default function PageInfoButton({
  title,
  description,
  defaultOpen = true,
}: PageInfoButtonProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    const timer = setTimeout(() => {
      document.addEventListener("click", handleClick);
    }, 200);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClick);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      // 全站浮動入口：頁面自己的視窗開啟時可以用這個標記暫時隱藏（例如神馬三國的 shenmaSanguo.module.css）
      data-floating-entry="page-info"
      style={{
        position: "fixed",
        top: "calc(var(--navbar-height, 70px) + 0.5rem)",
        left: "1rem",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "0.5rem",
      }}
    >
      <button
        onClick={() => setIsOpen((v) => !v)}
        style={{
          width: "2.5rem",
          height: "2.5rem",
          borderRadius: "50%",
          background: "#0d6efd",
          color: "white",
          border: "none",
          cursor: "pointer",
          fontSize: "1.1rem",
          boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
        aria-label={isOpen ? "收合說明" : "展開說明"}
      >
        ⓘ
      </button>

      <div
        style={{
          display: isOpen ? "block" : "none",
          background: "white",
          borderRadius: "12px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
          padding: "1rem 1.25rem",
          width: "min(300px, calc(100vw - 3rem))",
          maxHeight: "55vh",
          overflowY: "auto",
          lineHeight: 1.7,
          fontSize: "0.875rem",
          color: "#333",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "0.5rem",
          }}
        >
          <strong style={{ fontSize: "0.95rem" }}>{title}</strong>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "1rem",
              color: "#888",
              padding: "0 0 0 0.75rem",
              lineHeight: 1,
              flexShrink: 0,
            }}
            aria-label="關閉說明"
          >
            ✕
          </button>
        </div>
        {description}
      </div>
    </div>
  );
}
