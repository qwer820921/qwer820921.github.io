import { create } from "zustand";
import { getStorage, setStorage } from "../utils";
import { ReadingProgress, Bookmark, DailyReadStat } from "../types";

// 今天的日期字串 YYYY-MM-DD (確保使用本地時間而非 UTC)
const todayStr = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface ReadingStore {
  // ── 狀態 ──
  progressMap: Record<string, ReadingProgress>;  // key: bookId
  bookmarks: Bookmark[];
  stats: DailyReadStat[];                        // 最近 30 天

  // ── 閱讀進度 ──
  saveProgress: (
    bookId: string,
    bookTitle: string,
    chapterIndex: number,
    chapterTitle: string,
    scrollPercent: number
  ) => void;
  getProgress: (bookId: string) => ReadingProgress | null;
  getLastRead: () => ReadingProgress | null;   // 最近閱讀的一本書

  // ── 書籤 ──
  addBookmark: (
    bookId: string,
    bookTitle: string,
    chapterIndex: number,
    chapterTitle: string,
    note?: string
  ) => void;
  removeBookmark: (id: string) => void;
  getBookmarksByBook: (bookId: string) => Bookmark[];
  hasBookmark: (bookId: string, chapterIndex: number) => boolean;

  // ── 閱讀統計 ──
  addReadTime: (seconds: number, words: number) => void;
  getTodayStats: () => DailyReadStat;
}

// 從 LocalStorage 初始化
const initProgressMap = (): Record<string, ReadingProgress> =>
  getStorage<Record<string, ReadingProgress>>("PROGRESS", {});

const initBookmarks = (): Bookmark[] =>
  getStorage<Bookmark[]>("BOOKMARKS", []);

const initStats = (): DailyReadStat[] =>
  getStorage<DailyReadStat[]>("READ_STATS", []);

export const useReadingStore = create<ReadingStore>((set, get) => ({
  progressMap: initProgressMap(),
  bookmarks: initBookmarks(),
  stats: initStats(),

  // ── 儲存閱讀進度 ──
  saveProgress: (bookId, bookTitle, chapterIndex, chapterTitle, scrollPercent) => {
    const entry: ReadingProgress = {
      bookId,
      bookTitle,
      chapterIndex,
      chapterTitle,
      scrollPercent,
      updatedAt: Date.now(),
    };
    set(() => {
      // 每次存擋前先從 localStorage 讀取最新狀態，避免不同分頁的 Zustand 狀態互相覆蓋
      const latest = getStorage<Record<string, ReadingProgress>>("PROGRESS", {});
      const next = { ...latest, [bookId]: entry };
      setStorage("PROGRESS", next);
      return { progressMap: next };
    });
  },

  getProgress: (bookId) => get().progressMap[bookId] ?? null,

  getLastRead: () => {
    const entries = Object.values(get().progressMap);
    if (entries.length === 0) return null;
    return entries.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  },

  // ── 新增書籤 ──
  addBookmark: (bookId, bookTitle, chapterIndex, chapterTitle, note) => {
    const bookmark: Bookmark = {
      id: Date.now().toString(),
      bookId,
      bookTitle,
      chapterIndex,
      chapterTitle,
      note,
      createdAt: Date.now(),
    };
    set((s) => {
      const next = [...s.bookmarks, bookmark];
      setStorage("BOOKMARKS", next);
      return { bookmarks: next };
    });
  },

  removeBookmark: (id) => {
    set((s) => {
      const next = s.bookmarks.filter((b) => b.id !== id);
      setStorage("BOOKMARKS", next);
      return { bookmarks: next };
    });
  },

  getBookmarksByBook: (bookId) =>
    get().bookmarks.filter((b) => b.bookId === bookId),

  hasBookmark: (bookId, chapterIndex) =>
    get().bookmarks.some(
      (b) => b.bookId === bookId && b.chapterIndex === chapterIndex
    ),

  // ── 累積閱讀時間與字數 ──
  addReadTime: (seconds, words) => {
    // 預防 NaN 或無效數值
    const validSeconds = Number.isFinite(seconds) ? seconds : 0;
    const validWords = Number.isFinite(words) ? words : 0;
    if (validSeconds <= 0 && validWords <= 0) return;

    const today = todayStr();
    set((s) => {
      // 防呆：確保 s.stats 為陣列
      const currentStats = Array.isArray(s.stats) ? s.stats : [];
      const existing = currentStats.find((st) => st.date === today);
      let nextStats: DailyReadStat[];

      if (existing) {
        nextStats = currentStats.map((st) =>
          st.date === today
            ? { 
                ...st, 
                totalSeconds: (Number(st.totalSeconds) || 0) + validSeconds, 
                totalWords: (Number(st.totalWords) || 0) + validWords 
              }
            : st
        );
      } else {
        nextStats = [
          ...currentStats,
          { date: today, totalSeconds: validSeconds, totalWords: validWords },
        ];
      }
      
      // 只保留最近 30 天
      nextStats = nextStats
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30);
        
      try {
        setStorage("READ_STATS", nextStats);
      } catch (e) {
        console.error("Failed to save READ_STATS", e);
      }
      
      return { stats: nextStats };
    });
  },

  getTodayStats: () => {
    const today = todayStr();
    const currentStats = Array.isArray(get().stats) ? get().stats : [];
    return (
      currentStats.find((st) => st.date === today) ?? {
        date: today,
        totalSeconds: 0,
        totalWords: 0,
      }
    );
  },
}));
