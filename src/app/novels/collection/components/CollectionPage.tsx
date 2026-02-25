"use client";

import { useEffect, useMemo } from "react";
import { useNovelStore } from "../../store/novelStore";
import { getStorage } from "../../utils";
import NovelCard from "../../components/NovelCard";
import BottomTabs from "../../components/BottomTabs";
import styles from "../../novels.module.css";

export default function CollectionPage() {
  const { novels, novelsLoading, novelsError, fetchLibrary } = useNovelStore();

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  // 從 LocalStorage 讀取收藏 ID，篩選出收藏的書籍
  const collectedNovels = useMemo(() => {
    const savedIds = getStorage<string[]>("COLLECTION", []);
    if (savedIds.length === 0 || novels.length === 0) return [];
    return novels.filter((novel) => savedIds.includes(novel.id));
  }, [novels]);

  if (novelsLoading && novels.length === 0) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.loadingState}>
          <p>正在打開你的書櫃...</p>
        </div>
        <BottomTabs />
      </div>
    );
  }

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

  return (
    <div className={styles.pageContainer}>
      <header className={styles.pageHeader}>
        <h1>我的書櫃</h1>
        <p>你收藏了 {collectedNovels.length} 部作品</p>
      </header>

      <div className={styles.novelGrid}>
        {collectedNovels.length > 0 ? (
          collectedNovels.map((novel) => <NovelCard key={novel.id} novel={novel} />)
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
