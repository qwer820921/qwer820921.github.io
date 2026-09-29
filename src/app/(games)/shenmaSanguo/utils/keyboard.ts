import type { KeyboardEvent } from "react";

/**
 * 用 div 做的可點擊卡片（role="button"、tabIndex=0）：Enter 或空白鍵等同點擊。
 * 空白鍵另外取消預設動作，避免捲動頁面
 */
export const onActivateKey =
  (fn: () => void) =>
  (e: KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };
