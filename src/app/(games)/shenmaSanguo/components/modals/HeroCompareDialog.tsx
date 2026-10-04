"use client";

import React, { useId, useRef } from "react";
import HeroCompareTable from "../HeroCompareTable";
import { useDialogFocus } from "../useDialogFocus";
import { HeroCompareColumn } from "../../utils/heroCompare";
import styles from "../../styles/shenmaSanguo.module.css";

/**
 * 主頁武將視窗上方疊的「武將比較」視窗：自己的視窗焦點與按鍵（Esc 只關閉比較，焦點還給「比較這兩位」）。
 * 開啟它的按鈕不在畫面上時，焦點交給列表的比較入口，再沒有時交給列表的關閉鈕
 */
export default function HeroCompareDialog({
  columns,
  onClose,
  listPanelRef,
  listCloseRef,
}: {
  columns: HeroCompareColumn[];
  onClose: () => void;
  listPanelRef: React.RefObject<HTMLElement | null>;
  listCloseRef: React.RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onKeyDown = useDialogFocus(panelRef, closeRef, onClose, {
    fallbackFocus: () => {
      const list = listPanelRef.current;
      return (
        list?.querySelector<HTMLElement>(
          '[data-testid="hero-compare-start"]:not([disabled]), [data-testid="hero-compare-toggle"]'
        ) ?? listCloseRef.current
      );
    },
  });
  return (
    <div
      className={styles.modalBackdrop}
      style={{ zIndex: 210 }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={styles.modalPanel}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="hero-compare-dialog"
      >
        <div className={styles.modalHeader}>
          <span id={titleId} className={styles.modalTitle}>
            武將比較
          </span>
          <button
            ref={closeRef}
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="關閉武將比較"
          >
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <HeroCompareTable columns={columns} />
        </div>
      </div>
    </div>
  );
}
