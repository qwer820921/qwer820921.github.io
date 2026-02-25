import { create } from "zustand";
import { getLibraryData, getChaptersData, getChapterContentData } from "../api/novelApi";
import { Novel, ChapterSummary, ChapterContent } from "../types";

/** 快取過期時間（毫秒）：5 分鐘 */
const CACHE_TTL = 5 * 60 * 1000;

interface ChaptersCache {
  data: ChapterSummary[];
  fetchedAt: number;
}

interface NovelStore {
  // ── 書庫資料 ──
  novels: Novel[];
  novelsLoading: boolean;
  novelsError: string | null;
  novelsFetchedAt: number | null;

  // ── 章節目錄（以 bookId 為 key）──
  chaptersMap: Record<string, ChaptersCache>;
  chaptersLoading: Record<string, boolean>;
  chaptersError: Record<string, string | null>;

  // ── 章節內容快取（以 "bookId-chapterIndex" 為 key）──
  chapterContentMap: Record<string, ChapterContent>;

  // ── Actions ──
  fetchLibrary: (forceRefresh?: boolean) => Promise<Novel[]>;
  fetchChapters: (bookId: string, forceRefresh?: boolean) => Promise<ChapterSummary[]>;
  fetchChapterContent: (bookId: string, chapterIndex: number) => Promise<ChapterContent | null>;
  getNovelById: (bookId: string) => Novel | undefined;
}

/** 產生章節內容快取 key */
const contentKey = (bookId: string, chapterIndex: number) => `${bookId}-${chapterIndex}`;

export const useNovelStore = create<NovelStore>((set, get) => ({
  // ── 初始狀態 ──
  novels: [],
  novelsLoading: false,
  novelsError: null,
  novelsFetchedAt: null,

  chaptersMap: {},
  chaptersLoading: {},
  chaptersError: {},

  chapterContentMap: {},

  // ── 取得書庫清單 ──
  fetchLibrary: async (forceRefresh = false) => {
    const state = get();
    const now = Date.now();
    const hasCache = state.novels.length > 0 && state.novelsFetchedAt !== null;
    const isFresh = hasCache && now - state.novelsFetchedAt! < CACHE_TTL;

    if (isFresh && !forceRefresh) {
      return state.novels;
    }

    if (hasCache && !forceRefresh) {
      getLibraryData()
        .then((res) => {
          if (res.success && res.data) {
            set({ novels: res.data, novelsFetchedAt: Date.now(), novelsError: null });
          }
        })
        .catch(() => {});
      return state.novels;
    }

    set({ novelsLoading: true, novelsError: null });
    try {
      const res = await getLibraryData();
      if (res.success && res.data) {
        set({
          novels: res.data,
          novelsFetchedAt: Date.now(),
          novelsLoading: false,
          novelsError: null,
        });
        return res.data;
      } else {
        const errorMsg = res.error || "無法取得書籍資料";
        set({ novelsLoading: false, novelsError: errorMsg });
        return [];
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "伺服器連線異常，請稍後再試";
      set({ novelsLoading: false, novelsError: message });
      return [];
    }
  },

  // ── 取得指定書籍的章節目錄 ──
  fetchChapters: async (bookId, forceRefresh = false) => {
    const state = get();
    const now = Date.now();
    const cached = state.chaptersMap[bookId];
    const hasCache = !!cached;
    const isFresh = hasCache && now - cached.fetchedAt < CACHE_TTL;

    if (isFresh && !forceRefresh) {
      return cached.data;
    }

    if (hasCache && !forceRefresh) {
      getChaptersData(bookId)
        .then((res) => {
          if (res.success && res.data) {
            set((s) => ({
              chaptersMap: {
                ...s.chaptersMap,
                [bookId]: { data: res.data!, fetchedAt: Date.now() },
              },
              chaptersError: { ...s.chaptersError, [bookId]: null },
            }));
          }
        })
        .catch(() => {});
      return cached.data;
    }

    set((s) => ({
      chaptersLoading: { ...s.chaptersLoading, [bookId]: true },
      chaptersError: { ...s.chaptersError, [bookId]: null },
    }));

    try {
      const res = await getChaptersData(bookId);
      if (res.success && res.data) {
        set((s) => ({
          chaptersMap: {
            ...s.chaptersMap,
            [bookId]: { data: res.data!, fetchedAt: Date.now() },
          },
          chaptersLoading: { ...s.chaptersLoading, [bookId]: false },
          chaptersError: { ...s.chaptersError, [bookId]: null },
        }));
        return res.data;
      } else {
        set((s) => ({
          chaptersLoading: { ...s.chaptersLoading, [bookId]: false },
          chaptersError: { ...s.chaptersError, [bookId]: "無法取得章節資料" },
        }));
        return [];
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "章節目錄載入失敗";
      set((s) => ({
        chaptersLoading: { ...s.chaptersLoading, [bookId]: false },
        chaptersError: { ...s.chaptersError, [bookId]: message },
      }));
      return [];
    }
  },

  // ── 取得單一章節的完整內容（帶快取）──
  fetchChapterContent: async (bookId, chapterIndex) => {
    const key = contentKey(bookId, chapterIndex);
    const cached = get().chapterContentMap[key];

    // 已快取 → 直接回傳
    if (cached) return cached;

    try {
      const res = await getChapterContentData(bookId, chapterIndex);
      if (res.success && res.data) {
        set((s) => ({
          chapterContentMap: { ...s.chapterContentMap, [key]: res.data! },
        }));
        return res.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  // ── 從快取中找特定書籍 ──
  getNovelById: (bookId) => {
    return get().novels.find((n) => n.id === bookId);
  },
}));
