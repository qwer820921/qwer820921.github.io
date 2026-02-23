"use client";

import { useEffect, useState } from "react";
import { getLibraryData } from "../../api/novelApi";
import { getStorage } from "../../utils";
import { Novel } from "../../types";
import NovelCard from "../../components/NovelCard";
import BottomTabs from "../../components/BottomTabs";
import styles from "../../novels.module.css";

export default function CollectionPage() {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCollection = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // 1. 從 LocalStorage 讀取收藏的書籍 ID 清單
        const savedIds = getStorage<string[]>("COLLECTION", []);

        if (savedIds.length === 0) {
          setNovels([]);
          return;
        }

        // 2. 取得所有書籍資料，再篩選出收藏的
        const res = await getLibraryData();

        if (res.success && res.data) {
          const collected = res.data.filter((novel) =>
            savedIds.includes(novel.id)
          );
          setNovels(collected);
        } else {
          setError(res.error || "無法取得書籍資料");
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "載入書櫃時發生錯誤";
        setError(message);
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCollection();
  }, []);

  if (isLoading) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.loadingState}>
          <p>正在打開你的書櫃...</p>
        </div>
        <BottomTabs />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.errorState}>
          <h2>讀取失敗</h2>
          <p>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className={styles.retryBtn}
          >
            重新嘗試
          </button>
        </div>
        <BottomTabs />
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <header className={styles.pageHeader}>
        <h1>我的書櫃</h1>
        <p>你收藏了 {novels.length} 部作品</p>
      </header>

      <div className={styles.novelGrid}>
        {novels.length > 0 ? (
          novels.map((novel) => <NovelCard key={novel.id} novel={novel} />)
        ) : (
          <p className={styles.emptyState}>
            書櫃空空的，快去藏書閣挑幾本喜歡的作品吧！
          </p>
        )}
      </div>
      <BottomTabs />
    </div>
  );
}
