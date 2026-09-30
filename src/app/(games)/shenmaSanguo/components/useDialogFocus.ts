"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 目前開著的視窗（開啟的先後順序，最後一個是最上層）：巢狀視窗（例如關卡選擇裡的敵軍預覽）只由最上層處理焦點與按鍵
 */
const openDialogs: object[] = [];
const isTop = (key: object) => openDialogs[openDialogs.length - 1] === key;

interface Options {
  /**
   * 關閉時開啟前的元素已經不在畫面上（例如開啟它的提示已收起、換關後那一塊已卸載），
   * 或開啟時焦點不在任何元素上：改把焦點交給這裡回傳的元素（沒有或不在畫面上時不移動焦點）
   */
  fallbackFocus?: () => HTMLElement | null;
}

/**
 * 視窗的鍵盤操作（主頁的關卡選擇、關卡的敵軍預覽、戰場內的「下一波」共用）：
 * 開啟時焦點移到 initialRef（右上的關閉鈕），焦點被移到視窗外時（例如輔助工具）拉回視窗裡，
 * 關閉時還給開啟前的元素（觸發的按鈕；見 Options.fallbackFocus）。回傳的 onKeyDown 放在視窗上：
 * Esc 只關閉這個視窗（不再傳到後面），Tab 只在視窗內循環（不能操作背後的按鈕）。
 * 視窗裡再開另一個視窗時，只有最上層的視窗拉回焦點、處理 Esc 與 Tab；最上層關閉後由下一層接手
 */
export function useDialogFocus(
  panelRef: RefObject<HTMLElement | null>,
  initialRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  options?: Options
) {
  // 這個視窗在 openDialogs 裡的識別（元件存在期間不變）
  const keyRef = useRef<object>({});
  const fallbackRef = useRef(options?.fallbackFocus);
  useEffect(() => {
    fallbackRef.current = options?.fallbackFocus;
  });

  useEffect(() => {
    const key = keyRef.current;
    const prev =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null;
    openDialogs.push(key);
    initialRef.current?.focus();
    const onFocusIn = (e: FocusEvent) => {
      if (!isTop(key)) return;
      const panel = panelRef.current;
      if (panel && e.target instanceof Node && !panel.contains(e.target)) {
        initialRef.current?.focus();
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      const i = openDialogs.lastIndexOf(key);
      if (i >= 0) openDialogs.splice(i, 1);
      if (prev && prev.isConnected) {
        prev.focus();
        return;
      }
      const next = fallbackRef.current?.();
      if (next && next.isConnected) next.focus();
    };
  }, [panelRef, initialRef]);

  return (e: ReactKeyboardEvent<HTMLElement>) => {
    if (!isTop(keyRef.current)) return;
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
