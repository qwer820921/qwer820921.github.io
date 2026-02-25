"use client";

import { useEffect } from "react";
import { useNovelStore } from "../store/novelStore";
import NovelCard from "./NovelCard";
import BottomTabs from "./BottomTabs";
import styles from "../novels.module.css";

export default function NovelsPage() {
  const { novels, novelsLoading, novelsError, fetchLibrary } = useNovelStore();

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

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
          <button onClick={() => fetchLibrary(true)} className={styles.retryBtn}>
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
        <h1>萬事屋藏書閣</h1>
        <p>歡迎來到子yee 的專屬輕書庫</p>
      </header>

      {/* 小說列表 Grid */}
      <div className={styles.novelGrid}>
        {novels.length > 0 ? (
          novels.map((novel) => <NovelCard key={novel.id} novel={novel} />)
        ) : (
          <p className={styles.emptyState}>目前藏書閣還沒有收錄任何作品喔！</p>
        )}
      </div>
      <BottomTabs />
    </div>
  );
}