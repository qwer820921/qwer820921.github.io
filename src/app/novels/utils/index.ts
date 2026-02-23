/**
 * 萬事屋藏書閣 工具函式庫
 */

// --- LocalStorage 鍵名定義 ---
const KEYS = {
  SETTINGS: 'novel_reader_settings',
  COLLECTION: 'novel_my_collection',
} as const;

/**
 * 讀取 LocalStorage 設定
 *
 * 包含 Next.js SSR 環境判斷
 */
export const getStorage = <T>(key: keyof typeof KEYS, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const data = localStorage.getItem(KEYS[key]);
    return data ? JSON.parse(data) : defaultValue;
  } catch (error) {
    console.error(`Error reading ${key} from localStorage`, error);
    return defaultValue;
  }
};

/**
 * 寫入 LocalStorage 設定
 */
export const setStorage = <T>(key: keyof typeof KEYS, value: T): void => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(KEYS[key], JSON.stringify(value));
    } catch (error) {
      console.error(`Error saving ${key} to localStorage`, error);
    }
  }
};

/**
 * 格式化字數顯示 (例如 52100 轉為 5.2 萬)
 */
export const formatWordCount = (count: number): string => {
  if (count < 10000) return count.toString();
  return `${(count / 10000).toFixed(1)} 萬`;
};

/**
 * 修正 Google Drive 圖片連結
 *
 * 將已過時的 `drive.google.com/uc?export=view` 格式
 * 轉換為穩定的 `lh3.googleusercontent.com/d/{fileId}` 格式。
 * 若非 Drive 連結則原樣回傳。
 */
export const fixDriveCoverUrl = (url: string): string => {
  if (!url) return url;

  // 匹配 uc?export=view&id=xxx 格式
  const ucMatch = url.match(/drive\.google\.com\/uc\?.*id=([^&]+)/);
  if (ucMatch?.[1]) {
    return `https://lh3.googleusercontent.com/d/${ucMatch[1]}`;
  }

  // 匹配 /file/d/xxx/ 格式（以防後端還沒更新）
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (fileMatch?.[1]) {
    return `https://lh3.googleusercontent.com/d/${fileMatch[1]}`;
  }

  return url;
};