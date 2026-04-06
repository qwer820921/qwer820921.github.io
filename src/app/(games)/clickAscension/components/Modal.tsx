"use client";

import React, { ReactNode } from "react";
import styles from "../styles/clickAscension.module.css";

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
    <div className={styles["ca-modal-overlay"]} onClick={onClose}>
      <div
        className={styles["ca-modal-container"]}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles["ca-modal-header"]}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flex: 1,
            }}
          >
            <h2 className={styles["ca-modal-title"]}>{title}</h2>
            {headerContent}
          </div>
          <button className={styles["ca-modal-close"]} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Content */}
        <div className={styles["ca-modal-content"]}>{children}</div>
      </div>
    </div>
  );
}
