import { ReaderSettings } from "../types";

/** 預設閱讀設定（首次使用 / 恢復預設時套用） */
export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: "sepia",
  fontSize: 18,
  fontFamily: "sans-serif",
  lineHeight: 1.8,
};

/** 各主題的背景色與文字色 */
export const THEME_COLORS = {
  light: { background: "#ffffff", text: "#333333" },
  sepia: { background: "#f4ecd8", text: "#5b4636" },
  dark: { background: "#1a1a1a", text: "#cccccc" },
};

/** 設定頁 & ReaderMenu 的可選項目 */
export const READER_OPTIONS = {
  fontSizes: [14, 16, 18, 20, 22, 24, 28, 32],
  lineHeights: [1.5, 1.8, 2.0, 2.2],

  themes: [
    { id: "light", label: "明亮" },
    { id: "sepia", label: "護眼" },
    { id: "dark", label: "深色" },
  ] as { id: ReaderSettings["theme"]; label: string }[],

  fontFamilies: [
    { id: "sans-serif", label: "黑體" },
    { id: "serif", label: "明體" },
  ] as { id: ReaderSettings["fontFamily"]; label: string }[],
};