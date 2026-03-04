import React from "react";
import styles from "../novels.module.css";

interface NovelNoResultProps {
  searchText: string;
  selectedTags: string[];
}

export default function NovelNoResult({
  searchText,
  selectedTags,
}: NovelNoResultProps) {
  return (
    <div className={styles.noResultWrapper}>
      <div className={styles.noResultIcon}>🔍</div>
      <h3 className={styles.noResultTitle}>沒有找到符合的書籍</h3>
      {searchText && (
        <p className={styles.noResultHint}>
          關鍵字：<strong>&ldquo;{searchText}&rdquo;</strong>
        </p>
      )}
      {selectedTags.length > 0 && (
        <p className={styles.noResultHint}>
          標籤：{selectedTags.map((t) => `#${t}`).join("、")}
        </p>
      )}
      <p className={styles.noResultSub}>試試其他關鍵字或移除部分標籤篩選</p>
    </div>
  );
}
