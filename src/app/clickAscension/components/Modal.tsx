"use client";

import React, { ReactNode } from "react";
import "../styles/clickAscension.css";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  headerContent?: ReactNode; // Optional extra content in header
  children: ReactNode;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  headerContent,
  children,
}: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="ca-modal-overlay" onClick={onClose}>
      <div className="ca-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ca-modal-header">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flex: 1,
            }}
          >
            <h2 className="ca-modal-title">{title}</h2>
            {headerContent}
          </div>
          <button className="ca-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="ca-modal-content">{children}</div>
      </div>
    </div>
  );
}
