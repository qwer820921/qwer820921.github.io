"use client";

import { useState } from "react";
import Link from "next/link";
import { Novel } from "../types";
import { fixDriveCoverUrl } from "../utils";
import styles from "../novels.module.css";

interface NovelCardProps {
  novel: Novel;
}

export default function NovelCard({ novel }: NovelCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    // 點擊卡片會跳轉到 /novels/N001 (作品詳情頁)
    <Link href={`/novels/${novel.id}`} className={styles.card}>
      <div className={styles.coverWrapper}>
        {/* 若有封面圖且載入成功則顯示，否則顯示預設底色 */}
        {novel.cover_url && !imgError ? (
          <img
            src={fixDriveCoverUrl(novel.cover_url)}
            alt={novel.title}
            className={styles.coverImage}
            onError={() => setImgError(true)}
          />
        ) : (
          <img
            src="/images/no_cover_5.png"
            alt={novel.title}
            className={styles.coverImage}
          />
        )}
        <div className={styles.statusBadge}>{novel.status}</div>
      </div>

      <div className={styles.cardContent}>
        <h3 className={styles.bookTitle}>{novel.title}</h3>
        <p className={styles.authorName}>{novel.author}</p>
        
        {/* 標籤 (Tags) 渲染 */}
        <div className={styles.tagsContainer}>
          {novel.tags.map((tag, index) => (
            <span key={index} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>

        {/* 數據資訊 */}
        <div className={styles.metaData}>
          <p>更新至：{novel.latest_chapter_title}</p>
          <p>總字數：{novel.total_words.toLocaleString()} 字</p>
        </div>
      </div>
    </Link>
  );
}