"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useNovelStore } from "../store/novelStore";
import { useReadingStore } from "../store/readingStore";
import NovelCard from "./NovelCard";
import BottomTabs from "./BottomTabs";
import NovelSearchPanel from "./NovelSearchPanel";
import NovelNoResult from "./NovelNoResult";
import styles from "../novels.module.css";

export default function NovelsPage() {
  const { novels, novelsLoading, novelsError, fetchLibrary } = useNovelStore();
  const { getTodayStats, getLastRead } = useReadingStore();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    fetchLibrary();
  }, [fetchLibrary]);

  const todayStats = getTodayStats();
  const lastRead = getLastRead();

  // 格式化分鐘 (不到 1 分鐘也算 1 分鐘)
  const readMinutes =
    todayStats.totalSeconds > 0
      ? Math.max(1, Math.floor(todayStats.totalSeconds / 60))
      : 0;
  // 格式化字數
  const readWords =
    todayStats.totalWords >= 10000
      ? `${(todayStats.totalWords / 10000).toFixed(1)} 萬`
      : todayStats.totalWords.toLocaleString();

  // 取得不重複的所有標籤
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    novels.forEach((novel) => {
      novel.tags.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [novels]);

  // 過濾邏輯
  const filteredNovels = useMemo(() => {
    return novels.filter((novel) => {
      const matchText =
        !searchText ||
        novel.title.toLowerCase().includes(searchText.toLowerCase()) ||
        novel.summary.toLowerCase().includes(searchText.toLowerCase());

      const matchTags =
        selectedTags.length === 0 ||
        selectedTags.every((t) => novel.tags.includes(t));

      return matchText && matchTags;
    });
  }, [novels, searchText, selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSearchText("");
    setSelectedTags([]);
  };

  // 狀態 1: 載入中
  if (novelsLoading) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.loadingState}>
          <p>正在從藏書閣讀取卷宗...</p>
        </div>
        <BottomTabs />
      </div>
    );
  }

  // 狀態 2: 發生錯誤
  if (novelsError) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.errorState}>
          <h2>讀取失敗</h2>
          <p>{novelsError}</p>
          <button
            onClick={() => fetchLibrary(true)}
            className={styles.retryBtn}
          >
            重新嘗試
          </button>
        </div>
        <BottomTabs />
      </div>
    );
  }

  // 狀態 3: 成功取得資料並渲染
  return (
    <div className={styles.pageContainer}>
      <header className={styles.pageHeader}>
        {/* Dashboard 卡片列 */}
        <div className={styles.headerDashboard}>
          {/* 今日閱讀統計卡片 */}
          <div className={styles.dashCard}>
            <div className={styles.dashCardIcon}>📖</div>
            <div className={styles.dashCardBody}>
              <div className={styles.dashCardLabel}>今日閱讀</div>
              <div className={styles.dashCardValue}>
                {isClient ? (
                  readMinutes > 0 ? (
                    <>
                      <span className={styles.dashCardBig}>{readMinutes}</span>
                      <span className={styles.dashCardUnit}> 分鐘</span>
                      <span className={styles.dashCardSep}> · </span>
                      <span className={styles.dashCardBig}>{readWords}</span>
                      <span className={styles.dashCardUnit}> 字</span>
                    </>
                  ) : (
                    <span className={styles.dashCardEmpty}>
                      今天還沒開始閱讀
                    </span>
                  )
                ) : (
                  <span className={styles.dashCardEmpty}>載入中...</span>
                )}
              </div>
            </div>
          </div>

          {/* 繼續閱讀卡片（有紀錄才顯示） */}
          {isClient && lastRead && (
            <Link
              href={`/novels/reader/${lastRead.bookId}/${lastRead.chapterIndex}`}
              className={styles.dashCard + " " + styles.dashCardLink}
            >
              <div className={styles.dashCardIcon}>🔖</div>
              <div className={styles.dashCardBody}>
                <div className={styles.dashCardLabel}>繼續閱讀</div>
                <div className={styles.dashCardValue}>
                  <span className={styles.dashCardBookTitle}>
                    {lastRead.bookTitle}
                  </span>
                  <span className={styles.dashCardChapter}>
                    　第 {lastRead.chapterIndex} 章 · {lastRead.chapterTitle}
                  </span>
                </div>
              </div>
              <span className={styles.dashCardArrow}>→</span>
            </Link>
          )}
        </div>
      </header>

      {/* 小說列表 Header */}
      <div className={styles.sectionTitleRow}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>📚</span>
          萬事屋藏書閣
        </h2>

        {/* 搜尋下拉選單觸發按鈕 */}
        <div className={styles.searchAnchor}>
          <button
            className={`${styles.searchIconBtn} ${isSearchOpen ? styles.searchIconBtnActive : ""}`}
            onClick={() => setIsSearchOpen((prev) => !prev)}
            aria-label="搜尋書籍"
          >
            🔍
          </button>
          <NovelSearchPanel
            isOpen={isSearchOpen}
            onClose={() => setIsSearchOpen(false)}
            searchText={searchText}
            onSearchChange={setSearchText}
            allTags={allTags}
            selectedTags={selectedTags}
            onTagToggle={toggleTag}
            onClearAll={clearFilters}
            totalCount={novels.length}
            filteredCount={filteredNovels.length}
          />
        </div>
      </div>

      {/* 小說列表 */}
      {novels.length === 0 ? (
        <div className={styles.emptyState}>
          目前藏書閣還沒有收錄任何作品喔！
        </div>
      ) : filteredNovels.length === 0 ? (
        <NovelNoResult searchText={searchText} selectedTags={selectedTags} />
      ) : (
        <div className={styles.novelGrid}>
          {filteredNovels.map((novel) => (
            <NovelCard key={novel.id} novel={novel} />
          ))}
        </div>
      )}
      <BottomTabs />
    </div>
  );
}
