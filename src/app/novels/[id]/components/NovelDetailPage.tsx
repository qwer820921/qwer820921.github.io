"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useNovelStore } from "../../store/novelStore";
import { getStorage, setStorage, fixDriveCoverUrl } from "../../utils";
import { Novel, ChapterSummary } from "../../types";
import BottomTabs from "../../components/BottomTabs";
import styles from "../../novels.module.css";

interface Props {
  bookId: string;
}

export default function NovelDetailPage({ bookId }: Props) {
  const {
    novels, novelsLoading, novelsError,
    chaptersMap, chaptersLoading, chaptersError,
    fetchLibrary, fetchChapters, getNovelById,
  } = useNovelStore();

  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const [imgError, setImgError] = useState(false);

  const novel = getNovelById(bookId);
  const chapters = chaptersMap[bookId]?.data ?? [];
  const isLoading = (novelsLoading && !novel) || (chaptersLoading[bookId] && chapters.length === 0);
  const error = novelsError || chaptersError[bookId] || (!novelsLoading && !novel ? "找不到這本書的資料" : null);

  // 載入書本資料 & 章節目錄
  useEffect(() => {
    fetchLibrary();
    fetchChapters(bookId);
  }, [bookId, fetchLibrary, fetchChapters]);

  // 初始化收藏狀態
  useEffect(() => {
    const savedIds = getStorage<string[]>("COLLECTION", []);
    setIsFavorite(savedIds.includes(bookId));
  }, [bookId]);

  // 切換收藏狀態
  const toggleFavorite = useCallback(() => {
    const savedIds = getStorage<string[]>("COLLECTION", []);
    const newIds = isFavorite
      ? savedIds.filter((id) => id !== bookId)
      : [...savedIds, bookId];

    setStorage("COLLECTION", newIds);
    setIsFavorite(!isFavorite);
  }, [bookId, isFavorite]);

  if (isLoading) return (
    <div className={styles.pageContainer}>
      <div className={styles.loadingState}>正在整理書頁...</div>
      <BottomTabs />
    </div>
  );
  if (error || !novel) return (
    <div className={styles.pageContainer}>
      <div className={styles.errorState}>{error}</div>
      <BottomTabs />
    </div>
  );

  return (
    <div className={styles.pageContainer}>
      {/* 返回上一頁 */}
      <div className={styles.backNav}>
        <Link href="/novels">← 返回藏書閣</Link>
      </div>

      {/* 書籍資訊區塊 */}
      <div className={styles.detailHeader}>
        <div className={styles.detailCover}>
          {novel.cover_url && !imgError ? (
            <img
              src={fixDriveCoverUrl(novel.cover_url)}
              alt={novel.title}
              onError={() => setImgError(true)}
            />
          ) : (
            <img
              src="/images/no_cover_5.png"
              alt={novel.title}
            />
          )}
        </div>
        <div className={styles.detailInfo}>
          <h1>{novel.title}</h1>
          <p className={styles.authorName}>作者：{novel.author}</p>
          <div className={styles.tagsContainer}>
            {novel.tags.map((tag, idx) => (
              <span key={idx} className={styles.tag}>{tag}</span>
            ))}
          </div>
          <div className={styles.metaData}>
            <p>狀態：{novel.status}</p>
            <p>總字數：{novel.total_words.toLocaleString()} 字</p>
          </div>

          {/* 收藏按鈕 */}
          <button
            className={`${styles.favoriteBtn} ${isFavorite ? styles.favorited : ""}`}
            onClick={toggleFavorite}
          >
            {isFavorite ? "★ 已收藏" : "☆ 加入收藏"}
          </button>
        </div>
      </div>

      {/* 簡介區塊 */}
      <div className={styles.summarySection}>
        <h2>作品簡介</h2>
        <p>{novel.summary}</p>
      </div>

      {/* 目錄區塊 */}
      <div className={styles.chaptersSection}>
        <div className={styles.chaptersHeader}>
          <h2>章節目錄</h2>
          <span className={styles.chapterCount}>共 {chapters.length} 章</span>
        </div>

        <div className={styles.chapterList}>
          {chapters.length > 0 ? (
            chapters.map((chapter) => (
              <Link
                key={chapter.chapter_index}
                href={`/novels/reader/${bookId}#${chapter.chapter_index}`}
                className={styles.chapterItem}
              >
                <span className={styles.chapterTitle}>第 {chapter.chapter_index} 章　{chapter.chapter_title}</span>
                <span className={styles.chapterDate}>{chapter.publish_date}</span>
              </Link>
            ))
          ) : (
            <p className={styles.emptyState}>作者還在努力碼字中，尚未發布任何章節。</p>
          )}
        </div>
      </div>
      <BottomTabs />
    </div>
  );
}