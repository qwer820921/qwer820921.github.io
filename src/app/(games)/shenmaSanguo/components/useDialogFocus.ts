"use client";

import { useEffect } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 視窗的鍵盤操作（關卡的敵軍預覽、戰場內的「下一波」共用）：
 * 開啟時焦點移到 initialRef（右上的關閉鈕），焦點被移到視窗外時（例如輔助工具）拉回視窗裡，
 * 關閉時還給開啟前的元素（觸發的按鈕）。回傳的 onKeyDown 放在視窗上：
 * Esc 只關閉這個視窗（不再傳到後面），Tab 只在視窗內循環（不能操作背後的按鈕）
 */
export function useDialogFocus(
  panelRef: RefObject<HTMLElement | null>,
  initialRef: RefObject<HTMLElement | null>,
  onClose: () => void
) {
  useEffect(() => {
    const prev =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    initialRef.current?.focus();
    const onFocusIn = (e: FocusEvent) => {
      const panel = panelRef.current;
      if (panel && e.target instanceof Node && !panel.contains(e.target)) {
        initialRef.current?.focus();
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      if (prev && prev.isConnected) prev.focus();
    };
  }, [panelRef, initialRef]);

  return (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const inside = !!active && panelRef.current.contains(active);
    if (e.shiftKey && (active === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  };
}
