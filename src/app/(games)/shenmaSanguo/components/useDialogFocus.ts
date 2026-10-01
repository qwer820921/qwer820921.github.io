"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";

/** 可以用 Tab 走到的控制項（停用的不算） */
export const FOCUSABLE =
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
 * 視窗的鍵盤操作（主頁的玩家資訊與關卡選擇、關卡的敵軍預覽、戰場內的「下一波」共用）：
 * 開啟時焦點移到 initialRef（右上的關閉鈕），焦點被移到視窗外時（例如輔助工具）拉回視窗裡，
 * 關閉時還給開啟前的元素（觸發的按鈕；見 Options.fallbackFocus）。回傳的 onKeyDown 放在視窗上：
 * Esc 只關閉這個視窗（不再傳到後面），Tab 只在視窗內循環（不能操作背後的按鈕）。
 * 焦點所在的按鈕在處理中停用、或所在的區塊收起時，焦點會掉到頁面本身（按鍵不會經過視窗）：
 * 這時最上層的視窗照樣處理 Esc（關閉）與 Tab（回到視窗裡的第一個控制項，Shift+Tab 是最後一個）。
 * 視窗裡再開另一個視窗時，只有最上層的視窗拉回焦點、處理 Esc 與 Tab；最上層關閉後由下一層接手。
 * initialRef 拿不到焦點（例如處理中停用）、或視窗裡暫時沒有可以操作的控制項時，焦點留在視窗本身
 * （視窗要有 tabIndex={-1}），不會跑到背後的頁面
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
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    fallbackRef.current = options?.fallbackFocus;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const key = keyRef.current;
    const focusInto = () => {
      initialRef.current?.focus();
      const panel = panelRef.current;
      if (panel && !panel.contains(document.activeElement)) panel.focus();
    };
    const prev =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null;
    openDialogs.push(key);
    focusInto();
    const onFocusIn = (e: FocusEvent) => {
      if (!isTop(key)) return;
      const panel = panelRef.current;
      if (panel && e.target instanceof Node && !panel.contains(e.target)) {
        focusInto();
      }
    };
    // 焦點掉到頁面本身（沒有任何元素有焦點）時的 Esc 與 Tab；焦點在元素上時交給視窗的 onKeyDown 與 onFocusIn
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (!isTop(key)) return;
      const a = document.activeElement;
      if (a && a !== document.body) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      );
      e.preventDefault();
      if (items.length === 0) {
        panelRef.current.focus();
        return;
      }
      (e.shiftKey ? items[items.length - 1] : items[0]).focus();
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onDocKeyDown);
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
    if (items.length === 0) {
      // 暫時沒有可以操作的控制項（例如處理中都停用）：焦點留在視窗本身
      e.preventDefault();
      panelRef.current.focus();
      return;
    }
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
