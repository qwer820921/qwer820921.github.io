"use client";

import { useEffect, useState } from "react";
import { getLibraryData } from "../api/novelApi";
import { Novel } from "../types";
import NovelCard from "./NovelCard";
import BottomTabs from "./BottomTabs";
import styles from "../novels.module.css";

export default function NovelsPage() {
  // 定義組件狀態
  const [novels, setNovels] = useState<Novel[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 初次渲染時抓取資料
  useEffect(() => {
    const fetchNovels = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await getLibraryData();
        
        if (response.success && response.data) {
          setNovels(response.data);
        } else {
          setError(response.error || "無法取得書籍資料");
        }
      } catch (err) {
        setError("伺服器連線異常，請稍後再試");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNovels();
  }, []); // 空陣列代表只在 Component Mount 時執行一次

  // 狀態 1: 載入中
  if (isLoading) {
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
  if (error) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.errorState}>
          <h2>讀取失敗</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()} className={styles.retryBtn}>
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