"use client";

import { useRouter } from "next/navigation";
import { ReaderSettings } from "../types";
import { setStorage } from "../utils";
import { READER_OPTIONS, THEME_COLORS } from "../constants/themeConfig";
import { useReadingStore } from "../store/readingStore";
import styles from "../novels.module.css";

interface ReaderMenuProps {
  isOpen: boolean;
  settings: ReaderSettings;
  onSettingsChange: (settings: ReaderSettings) => void;
  onClose: () => void;
  bookId: string;
  bookTitle: string;
  chapterIndex: number;
  chapterTitle: string;
}

export default function ReaderMenu({
  isOpen,
  settings,
  onSettingsChange,
  onClose,
  bookId,
  bookTitle,
  chapterIndex,
  chapterTitle,
}: ReaderMenuProps) {
  const router = useRouter();
  const { addBookmark, removeBookmark, getBookmarksByBook, hasBookmark } = useReadingStore();

  const isBookmarked = hasBookmark(bookId, chapterIndex);
  const bookmarks = getBookmarksByBook(bookId);

  // 更新設定：即時反映到閱讀器 + 存入 LocalStorage
  const updateSettings = (updates: Partial<ReaderSettings>) => {
    const newSettings = { ...settings, ...updates };
    onSettingsChange(newSettings);
    setStorage("SETTINGS", newSettings);
  };

  const toggleBookmark = () => {
    if (isBookmarked) {
      const existing = bookmarks.find(
        (b) => b.chapterIndex === chapterIndex
      );
      if (existing) removeBookmark(existing.id);
    } else {
      addBookmark(bookId, bookTitle, chapterIndex, chapterTitle);
    }
  };

  // 字級增減邏輯
  const fontSizes = READER_OPTIONS.fontSizes;
  const currentFontIndex = fontSizes.indexOf(settings.fontSize);

  const decreaseFontSize = () => {
    if (currentFontIndex > 0) {
      updateSettings({ fontSize: fontSizes[currentFontIndex - 1] });
    }
  };

  const increaseFontSize = () => {
    if (currentFontIndex < fontSizes.length - 1) {
      updateSettings({ fontSize: fontSizes[currentFontIndex + 1] });
    }
  };

  return (
    <>
      {/* 背景遮罩：點擊關閉選單 */}
      <div
        className={`${styles.menuOverlay} ${isOpen ? styles.menuOverlayVisible : ""}`}
        onClick={onClose}
      />

      {/* 底部彈窗本體 */}
      <div
        className={`${styles.readerMenu} ${isOpen ? styles.readerMenuOpen : ""}`}
      >
        {/* 拖曳提示條 */}
        <div className={styles.menuHandle} onClick={onClose}>
          <span className={styles.menuHandleBar} />
        </div>

        {/* ===== 主題切換 ===== */}
        <div className={styles.menuSection}>
          <span className={styles.menuSectionLabel}>主題</span>
          <div className={styles.menuThemeRow}>
            {READER_OPTIONS.themes.map((theme) => {
              const colors = THEME_COLORS[theme.id];
              const isActive = settings.theme === theme.id;
              return (
                <button
                  key={theme.id}
                  className={`${styles.menuThemeBtn} ${isActive ? styles.menuThemeBtnActive : ""}`}
                  onClick={() => updateSettings({ theme: theme.id })}
                  style={{
                    backgroundColor: colors.background,
                    color: colors.text,
                  }}
                  aria-label={`切換至${theme.label}主題`}
                >
                  {theme.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== 字級調整 ===== */}
        <div className={styles.menuSection}>
          <span className={styles.menuSectionLabel}>字級</span>
          <div className={styles.menuFontSizeRow}>
            <button
              className={styles.menuStepBtn}
              onClick={decreaseFontSize}
              disabled={currentFontIndex <= 0}
            >
              A−
            </button>
            <span className={styles.menuFontSizeValue}>
              {settings.fontSize}px
            </span>
            <button
              className={styles.menuStepBtn}
              onClick={increaseFontSize}
              disabled={currentFontIndex >= fontSizes.length - 1}
            >
              A+
            </button>
          </div>
        </div>

        {/* ===== 字體選擇 ===== */}
        <div className={styles.menuSection}>
          <span className={styles.menuSectionLabel}>字體</span>
          <div className={styles.menuFontFamilyRow}>
            {READER_OPTIONS.fontFamilies.map((font) => (
              <button
                key={font.id}
                className={`${styles.menuFontFamilyBtn} ${settings.fontFamily === font.id ? styles.menuFontFamilyBtnActive : ""}`}
                onClick={() => updateSettings({ fontFamily: font.id })}
                style={{ fontFamily: font.id }}
              >
                {font.label}
              </button>
            ))}
          </div>
        </div>

        {/* ===== 行距選擇 ===== */}
        <div className={styles.menuSection}>
          <span className={styles.menuSectionLabel}>行距</span>
          <div className={styles.menuLineHeightRow}>
            {READER_OPTIONS.lineHeights.map((lh) => (
              <button
                key={lh}
                className={`${styles.menuLineHeightBtn} ${settings.lineHeight === lh ? styles.menuLineHeightBtnActive : ""}`}
                onClick={() => updateSettings({ lineHeight: lh })}
              >
                {lh}x
              </button>
            ))}
          </div>
        </div>

        {/* ===== 書籤 ===== */}
        <div className={styles.menuSection}>
          <span className={styles.menuSectionLabel}>書籤</span>

          {/* 加入/移除書籤 */}
          <button
            className={`${styles.bookmarkToggleBtn} ${isBookmarked ? styles.bookmarkToggleBtnActive : ""}`}
            onClick={toggleBookmark}
          >
            {isBookmarked ? "✓ 已書籤 · 點擊移除" : "📌 加入書籤"}
          </button>

          {/* 此書的書籤列表 */}
          {bookmarks.length > 0 && (
            <div className={styles.bookmarkList}>
              {bookmarks
                .sort((a, b) => a.chapterIndex - b.chapterIndex)
                .map((bm) => (
                  <div
                    key={bm.id}
                    className={`${styles.bookmarkItem} ${bm.chapterIndex === chapterIndex ? styles.bookmarkItemCurrent : ""}`}
                  >
                    <button
                      className={styles.bookmarkJumpBtn}
                      onClick={() => {
                        onClose();
                        router.push(`/novels/reader/${bookId}/${bm.chapterIndex}`);
                      }}
                    >
                      第 {bm.chapterIndex} 章 · {bm.chapterTitle}
                    </button>
                    <button
                      className={styles.bookmarkRemoveBtn}
                      onClick={() => removeBookmark(bm.id)}
                      aria-label="移除書籤"
                    >
                      ✕
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
