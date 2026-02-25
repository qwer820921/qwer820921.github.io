// ==========================================
// 1. API 回傳的基礎格式
// ==========================================
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ==========================================
// 2. 小說基本資料 (圖書館首頁用)
// ==========================================
export interface Novel {
  id: string;
  title: string;
  author: string;
  tags: string[];
  summary: string;
  cover_url: string;
  status: string;           // 例如: "連載中", "已完結"
  total_words: number;      // GAS 自動加總的總字數
  latest_chapter_index: number;
  latest_chapter_title: string;
}

// ==========================================
// 3. 章節簡要資料 (作品詳情頁的目錄用，不含內文)
// ==========================================
export interface ChapterSummary {
  chapter_index: number;
  chapter_title: string;
  word_count: number;
  publish_date: string;     // 格式: YYYY-MM-DD
}

// ==========================================
// 4. 章節完整內容 (閱讀器用)
// ==========================================
export interface ChapterContent extends ChapterSummary {
  book_id: string;
  content: string;          // 50萬字大挑戰的核心欄位
  author_note: string;      // 作者的話 (可為空字串)
}

// ==========================================
// 5. 閱讀器外觀設定 (存於 LocalStorage)
// ==========================================
export interface ReaderSettings {
  theme: 'light' | 'sepia' | 'dark';
  fontSize: number;
  fontFamily: 'sans-serif' | 'serif';
  lineHeight: number;
}