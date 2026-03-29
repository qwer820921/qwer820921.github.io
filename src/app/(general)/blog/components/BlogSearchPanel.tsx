"use client";
import React, { useEffect, useRef } from "react";
import styles from "./blogPage.module.css";

interface BlogSearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  searchText: string;
  onSearchChange: (value: string) => void;
  allTags: string[];
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
  onClearAll: () => void;
  totalCount: number;
  filteredCount: number;
}

export default function BlogSearchPanel({
  isOpen,
  onClose,
  searchText,
  onSearchChange,
  allTags,
  selectedTags,
  onTagToggle,
  onClearAll,
  totalCount,
  filteredCount,
}: BlogSearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 展開時自動聚焦
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Escape 鍵關閉
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKey);
    }
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const hasFilter = searchText.length > 0 || selectedTags.length > 0;

  return (
    <>
      {/* 透明遮罩：點擊外部關閉 */}
      {isOpen && <div className={styles.panelBackdrop} onClick={onClose} />}

      {/* 浮動面板 */}
      <div
        ref={panelRef}
        className={`${styles.searchPanel} ${isOpen ? styles.searchPanelOpen : ""}`}
        aria-hidden={!isOpen}
      >
        {/* 小三角箭頭 */}
        <div className={styles.panelArrow} />

        {/* 搜尋輸入列 */}
        <div className={styles.panelSearchRow}>
          <span className={styles.panelSearchIcon}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            className={styles.panelInput}
            placeholder="搜尋文章標題或描述..."
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchText && (
            <button
              className={styles.panelClearBtn}
              onClick={() => onSearchChange("")}
              aria-label="清除搜尋"
            >
              ✕
            </button>
          )}
        </div>

        {/* 分隔線 */}
        <div className={styles.panelDivider} />

        {/* 標籤篩選 */}
        {allTags.length > 0 && (
          <div className={styles.panelTagSection}>
            <div className={styles.panelTagHeader}>
              <span className={styles.panelTagLabel}>標籤篩選</span>
              {selectedTags.length > 0 && (
                <button
                  className={styles.panelClearTagsBtn}
                  onClick={onClearAll}
                >
                  清除全部
                </button>
              )}
            </div>
            <div className={styles.panelTagList}>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  className={`${styles.panelTag} ${selectedTags.includes(tag) ? styles.panelTagActive : ""}`}
                  onClick={() => onTagToggle(tag)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 結果計數 */}
        {hasFilter && (
          <div className={styles.panelResultCount}>
            顯示 <strong>{filteredCount}</strong> / {totalCount} 篇
          </div>
        )}
      </div>
    </>
  );
}
