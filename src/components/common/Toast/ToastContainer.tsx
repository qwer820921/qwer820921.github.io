"use client";

import React from "react";
import { useToast, Toast as ToastType } from "./ToastContext";
import styles from "./Toast.module.css";

const getIcon = (type: ToastType["type"]) => {
  switch (type) {
    case "success":
      return "✓";
    case "error":
      return "✕";
    case "warning":
      return "⚠";
    case "info":
      return "ℹ";
    default:
      return "ℹ";
  }
};

const ToastItem: React.FC<{ toast: ToastType; onClose: () => void }> = ({
  toast,
  onClose,
}) => {
  return (
    <div className={`${styles.toast} ${styles[toast.type]}`}>
      <span className={styles.icon}>{getIcon(toast.type)}</span>
      <span className={styles.message}>{toast.message}</span>
      <button className={styles.closeButton} onClick={onClose}>
        ✕
      </button>
    </div>
  );
};

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};

export default ToastContainer;
