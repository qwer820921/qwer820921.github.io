"use client";
import { useState, useEffect, useRef } from "react";

interface PageInfoButtonProps {
  title: string;
  description: React.ReactNode;
}

export default function PageInfoButton({
  title,
  description,
}: PageInfoButtonProps) {
  const [isOpen, setIsOpen] = useState(true);
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
