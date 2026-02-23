"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getChapterContentData, getChaptersData } from "../../../../api/novelApi";
import { getStorage } from "../../../../utils";
import { ChapterContent, ChapterSummary, ReaderSettings } from "../../../../types";
import ReaderMenu from "../../../../components/ReaderMenu";
import styles from "../../../../novels.module.css";
import { DEFAULT_READER_SETTINGS, THEME_COLORS } from "@/app/novels/constants/themeConfig";

interface Props {
  bookId: string;
  chapterIndex: number;
}

export default function ReaderPage({ bookId, chapterIndex }: Props) {
  const router = useRouter();
  const [chapter, setChapter] = useState<ChapterContent | null>(null);
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_READER_SETTINGS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isTocOpen, setIsTocOpen] = useState<boolean>(false);

  // 從 LocalStorage 讀取使用者的閱讀設定
  useEffect(() => {
    const savedSettings = getStorage<ReaderSettings>("SETTINGS", DEFAULT_READER_SETTINGS);
    setSettings(savedSettings);
  }, []);

  const currentTheme = THEME_COLORS[settings.theme];

  // 載入當前章節內容
  useEffect(() => {
    const fetchChapter = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await getChapterContentData(bookId, chapterIndex);
        
        if (response.success && response.data) {
          setChapter(response.data);
          window.scrollTo(0, 0);
        } else {
          setError("無法取得章節內容，可能是作者還沒發布喔！");
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "章節載入失敗";
        setError(message);
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchChapter();
  }, [bookId, chapterIndex]);

  // 載入章節目錄（用於目錄彈窗）
  useEffect(() => {
    const fetchChapterList = async () => {
      try {
        const res = await getChaptersData(bookId);
        if (res.success && res.data) {
          setChapters(res.data);
        }
      } catch (err) {
        console.error("載入章節目錄失敗:", err);
      }
    };

    fetchChapterList();
  }, [bookId]);

  // 點擊螢幕中央區域 → 切換設定選單
  const handleContentClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest("a") || target.closest("button")) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const sectionHeight = rect.height / 3;

      if (clickY > sectionHeight && clickY < sectionHeight * 2) {
        setIsMenuOpen((prev) => !prev);
      }
    },
    []
  );

  // 任一彈窗開啟時鎖定 body 滾動
  useEffect(() => {
    if (isMenuOpen || isTocOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen, isTocOpen]);

  // 狀態 1: 載入中
  if (isLoading) {
    return <div className={styles.readerLoading}>靈力運轉中，正在載入章節...</div>;
  }

  // 狀態 2: 發生錯誤
  if (error || !chapter) {
    return (
      <div className={styles.readerError}>
        <h2>前方沒有路了</h2>
        <p>{error}</p>
        <div className={styles.readerNavButtons}>
          <button onClick={() => router.push(`/novels/${bookId}`)} className={styles.navBtn}>
            返回目錄
          </button>
          {chapterIndex > 1 && (
            <button onClick={() => router.push(`/novels/reader/${bookId}/${chapterIndex - 1}`)} className={styles.navBtn}>
              回上一章
            </button>
          )}
        </div>
      </div>
    );
  }

  // 狀態 3: 渲染小說內容
  return (
    <div 
      className={styles.readerContainer}
      style={{
        backgroundColor: currentTheme.background,
        color: currentTheme.text,
        fontSize: `${settings.fontSize}px`,
        fontFamily: settings.fontFamily,
        lineHeight: settings.lineHeight,
      }}
      onClick={handleContentClick}
    >
      {/* 頂部導覽 */}
      <div className={styles.readerHeader}>
        <Link href={`/novels/${bookId}`} className={styles.readerBackLink}>
          ← 返回
        </Link>
        <div className={styles.readerHeaderRight}>
          <button
            className={styles.readerSettingsBtn}
            onClick={() => setIsTocOpen(true)}
            aria-label="開啟目錄"
          >
            ☰
          </button>
          <button
            className={styles.readerSettingsBtn}
            onClick={() => setIsMenuOpen(true)}
            aria-label="開啟閱讀設定"
          >
            Aa
          </button>
        </div>
      </div>

      {/* 章節標題 */}
      <h1 className={styles.readerTitle}>{chapter.chapter_title}</h1>
      <p className={styles.readerMeta}>
        字數：{chapter.word_count.toLocaleString()} 字 | 發布於：{chapter.publish_date}
      </p>

      {/* 核心內文 */}
      <div className={styles.readerContent}>
        {chapter.content}
      </div>

      {/* 作者的話 */}
      {chapter.author_note && (
        <div className={styles.authorNoteBox}>
          <strong>作者有話說：</strong>
          <p>{chapter.author_note}</p>
        </div>
      )}

      {/* 底部翻頁按鈕 */}
      <div className={styles.readerFooterNav}>
        {chapterIndex > 1 ? (
          <Link href={`/novels/reader/${bookId}/${chapterIndex - 1}`} className={styles.navBtn}>
            上一章
          </Link>
        ) : (
          <div className={styles.navBtnDisabled}>已是第一章</div>
        )}

        <button
          className={styles.navBtnGhost}
          onClick={() => setIsTocOpen(true)}
        >
          目錄
        </button>

        <Link href={`/novels/reader/${bookId}/${chapterIndex + 1}`} className={styles.navBtn}>
          下一章
        </Link>
      </div>

      {/* 目錄彈窗 (Bottom Drawer) */}
      <>
        <div
          className={`${styles.menuOverlay} ${isTocOpen ? styles.menuOverlayVisible : ""}`}
          onClick={() => setIsTocOpen(false)}
        />
        <div className={`${styles.tocDrawer} ${isTocOpen ? styles.tocDrawerOpen : ""}`}>
          <div className={styles.menuHandle} onClick={() => setIsTocOpen(false)}>
            <span className={styles.menuHandleBar} />
          </div>
          <div className={styles.tocHeader}>
            <h3>章節目錄</h3>
            <span className={styles.tocCount}>共 {chapters.length} 章</span>
          </div>
          <div className={styles.tocList}>
            {chapters.map((ch) => (
              <Link
                key={ch.chapter_index}
                href={`/novels/reader/${bookId}/${ch.chapter_index}`}
                className={`${styles.tocItem} ${ch.chapter_index === chapterIndex ? styles.tocItemActive : ""}`}
                onClick={() => setIsTocOpen(false)}
              >
                <span>第 {ch.chapter_index} 章　{ch.chapter_title}</span>
                <span className={styles.tocItemDate}>{ch.publish_date}</span>
              </Link>
            ))}
          </div>
        </div>
      </>

      {/* 閱讀設定彈窗 */}
      <ReaderMenu
        isOpen={isMenuOpen}
        settings={settings}
        onSettingsChange={setSettings}
        onClose={() => setIsMenuOpen(false)}
      />
    </div>
  );
}