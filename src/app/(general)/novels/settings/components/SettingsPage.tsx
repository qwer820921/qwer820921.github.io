"use client";

import { useEffect, useState } from "react";
import { ReaderSettings } from "../../types";
import { getStorage, setStorage } from "../../utils";
import {
  DEFAULT_READER_SETTINGS,
  READER_OPTIONS,
  THEME_COLORS,
} from "../../constants/themeConfig";
import BottomTabs from "../../components/BottomTabs";
import styles from "../../novels.module.css";

const PREVIEW_TEXT =
  "道可道，非常道；名可名，非常名。無名天地之始，有名萬物之母。故常無欲以觀其妙，常有欲以觀其徼。此兩者同出而異名，同謂之玄，玄之又玄，眾妙之門。";

export default function SettingsPage() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_READER_SETTINGS);

  // 初始化：從 LocalStorage 讀取設定
  useEffect(() => {
    const savedSettings = getStorage<ReaderSettings>("SETTINGS", DEFAULT_READER_SETTINGS);
    setSettings(savedSettings);
  }, []);

  // 更新設定並存入 LocalStorage
  const updateSettings = (updates: Partial<ReaderSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    setStorage("SETTINGS", newSettings);
  };

  // 恢復預設值
  const resetSettings = () => {
    setSettings(DEFAULT_READER_SETTINGS);
    setStorage("SETTINGS", DEFAULT_READER_SETTINGS);
  };

  // 字級增減
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

  const currentTheme = THEME_COLORS[settings.theme];

  return (
    <div className={styles.pageContainer}>
      <header className={styles.pageHeader}>
        <h1>偏好設定</h1>
        <p>打造你最舒適的閱讀環境</p>
      </header>

      {/* ===== 閱讀主題 ===== */}
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>閱讀主題</h2>
        <div className={styles.themeSelector}>
          {READER_OPTIONS.themes.map((theme) => {
            const colors = THEME_COLORS[theme.id];
            const isActive = settings.theme === theme.id;
            return (
              <button
                key={theme.id}
                className={`${styles.themeOption} ${isActive ? styles.themeOptionActive : ""}`}
                onClick={() => updateSettings({ theme: theme.id })}
                aria-label={`切換至${theme.label}主題`}
              >
                <span
                  className={styles.themeCircle}
                  style={{ backgroundColor: colors.background, color: colors.text }}
                >
                  Aa
                </span>
                <span className={styles.themeLabel}>{theme.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ===== 字體與排版 ===== */}
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>字體與排版</h2>

        {/* 字體選擇 */}
        <div className={styles.settingsRow}>
          <span className={styles.settingsRowLabel}>字體</span>
          <div className={styles.fontFamilySelector}>
            {READER_OPTIONS.fontFamilies.map((font) => (
              <button
                key={font.id}
                className={`${styles.fontFamilyOption} ${settings.fontFamily === font.id ? styles.fontFamilyActive : ""}`}
                onClick={() => updateSettings({ fontFamily: font.id })}
                style={{ fontFamily: font.id }}
              >
                {font.label}
              </button>
            ))}
          </div>
        </div>

        {/* 字級調整 */}
        <div className={styles.settingsRow}>
          <span className={styles.settingsRowLabel}>字級</span>
          <div className={styles.fontSizeControl}>
            <button
              className={styles.fontSizeBtn}
              onClick={decreaseFontSize}
              disabled={currentFontIndex <= 0}
            >
              −
            </button>
            <span className={styles.fontSizeValue}>{settings.fontSize}px</span>
            <button
              className={styles.fontSizeBtn}
              onClick={increaseFontSize}
              disabled={currentFontIndex >= fontSizes.length - 1}
            >
              +
            </button>
          </div>
        </div>

        {/* 行距選擇 */}
        <div className={styles.settingsRow}>
          <span className={styles.settingsRowLabel}>行距</span>
          <div className={styles.lineHeightSelector}>
            {READER_OPTIONS.lineHeights.map((lh) => (
              <button
                key={lh}
                className={`${styles.lineHeightOption} ${settings.lineHeight === lh ? styles.lineHeightActive : ""}`}
                onClick={() => updateSettings({ lineHeight: lh })}
              >
                {lh}x
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 即時預覽 ===== */}
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>即時預覽</h2>
        <div
          className={styles.previewBox}
          style={{
            backgroundColor: currentTheme.background,
            color: currentTheme.text,
            fontSize: `${settings.fontSize}px`,
            fontFamily: settings.fontFamily,
            lineHeight: settings.lineHeight,
          }}
        >
          {PREVIEW_TEXT}
        </div>
      </section>

      {/* ===== 操作按鈕 ===== */}
      <section className={styles.settingsActions}>
        <button className={styles.resetBtn} onClick={resetSettings}>
          🔄 恢復預設值
        </button>
      </section>
      <BottomTabs />
    </div>
  );
}