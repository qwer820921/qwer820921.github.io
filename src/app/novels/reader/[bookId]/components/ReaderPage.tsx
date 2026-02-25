"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useNovelStore } from "../../../store/novelStore";
import { getStorage } from "../../../utils";
import { ChapterContent, ReaderSettings } from "../../../types";
import ReaderMenu from "../../../components/ReaderMenu";
import TTSPlayer from "../../../components/TTSPlayer";
import styles from "../../../novels.module.css";
import { DEFAULT_READER_SETTINGS, THEME_COLORS } from "@/app/novels/constants/themeConfig";

interface Props {
  bookId: string;
}

export default function ReaderPage({ bookId }: Props) {
  const { chaptersMap, fetchChapters, fetchChapterContent } = useNovelStore();
  const chapters = chaptersMap[bookId]?.data ?? [];

  const [loadedChapters, setLoadedChapters] = useState<ChapterContent[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(1);
  const [visibleChapterTitle, setVisibleChapterTitle] = useState<string>("");
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [noMoreChapters, setNoMoreChapters] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_READER_SETTINGS);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false);
  
  // TTS State
  const [isTTSOpen, setIsTTSOpen] = useState(false);
  const [isTTSPlaying, setIsTTSPlaying] = useState(false);
  const [activeTTSIndex, setActiveTTSIndex] = useState<number | null>(null);

  // refs
  const chapterRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false); // 防止重複觸發

  const currentTheme = THEME_COLORS[settings.theme];

  // 從 URL hash 讀取初始章節
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    const parsed = parseInt(hash, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setCurrentChapterIndex(parsed);
    }
  }, []);

  // 載入閱讀設定
  useEffect(() => {
    const savedSettings = getStorage<ReaderSettings>("SETTINGS", DEFAULT_READER_SETTINGS);
    setSettings(savedSettings);
  }, []);

  // 載入章節目錄
  useEffect(() => {
    fetchChapters(bookId);
  }, [bookId, fetchChapters]);

  // 載入初始章節
  useEffect(() => {
    const loadInitialChapter = async () => {
      setIsLoadingInitial(true);
      setError(null);
      setNoMoreChapters(false);

      const content = await fetchChapterContent(bookId, currentChapterIndex);
      if (content) {
        setLoadedChapters([content]);
        setVisibleChapterTitle(content.chapter_title);
        // 預載下一章
        fetchChapterContent(bookId, currentChapterIndex + 1);
      } else {
        setError("無法取得章節內容，可能是作者還沒發布喔！");
      }
      setIsLoadingInitial(false);
    };

    loadInitialChapter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, currentChapterIndex]);

  // scroll 事件：追蹤目前可見的章節 → 更新標題 + URL hash
  useEffect(() => {
    let rafId: number;

    const handleScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const headerOffset = 80; // header 高度 + 一點緩衝
        let closestIdx: number | null = null;
        let closestTitle = "";
        let closestDistance = Infinity;

        chapterRefs.current.forEach((el, idx) => {
          const rect = el.getBoundingClientRect();
          // 找出頂端最接近 header 下方的章節
          const distance = Math.abs(rect.top - headerOffset);
          if (rect.top <= headerOffset + 100 && distance < closestDistance) {
            closestDistance = distance;
            closestIdx = idx;
            closestTitle = el.getAttribute("data-chapter-title") || "";
          }
        });

        // 如果沒有章節在 header 下方（可能在最頂端），就取第一個
        if (closestIdx === null && chapterRefs.current.size > 0) {
          const firstEntry = Array.from(chapterRefs.current.entries())[0];
          if (firstEntry) {
            closestIdx = firstEntry[0];
            closestTitle = firstEntry[1].getAttribute("data-chapter-title") || "";
          }
        }

        if (closestIdx !== null) {
          const currentHash = window.location.hash.replace("#", "");
          if (currentHash !== String(closestIdx)) {
            window.history.replaceState(null, "", `#${closestIdx}`);
          }
          setVisibleChapterTitle(closestTitle);
        }
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, [loadedChapters]);

  // 自動載入下一章：用 IntersectionObserver 觀察底部哨兵元素
  const loadNextChapter = useCallback(async () => {
    if (loadingRef.current || noMoreChapters) return;
    loadingRef.current = true;
    setIsLoadingMore(true);

    const lastLoaded = loadedChapters[loadedChapters.length - 1];
    if (!lastLoaded) {
      loadingRef.current = false;
      setIsLoadingMore(false);
      return;
    }

    const nextIndex = lastLoaded.chapter_index + 1;
    const content = await fetchChapterContent(bookId, nextIndex);

    if (content) {
      setLoadedChapters((prev) => [...prev, content]);
      // 預載再下一章
      fetchChapterContent(bookId, nextIndex + 1);
    } else {
      setNoMoreChapters(true);
    }

    setIsLoadingMore(false);
    loadingRef.current = false;
  }, [bookId, loadedChapters, noMoreChapters, fetchChapterContent]);

  // 哨兵元素的 IntersectionObserver（滾到接近底部時觸發載入）
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadNextChapter();
        }
      },
      { rootMargin: "1000px" } // 提前 600px 開始載入
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadNextChapter]);

  // 把所有已載入章節的內容拆分成段落陣列供 TTS 播放
  const ttsParagraphs = useMemo(() => {
    return loadedChapters.flatMap((ch) => {
      const texts: string[] = [];
      texts.push(`第${ch.chapter_index}章 ${ch.chapter_title}`);
      const lines = ch.content.split("\n");
      lines.forEach((line) => {
        if (line.trim()) texts.push(line);
      });
      if (ch.author_note) texts.push(`作者有話說：${ch.author_note}`);
      return texts;
    });
  }, [loadedChapters]);

  // 從目錄跳到指定章節
  const jumpToChapter = useCallback((chapterIndex: number) => {
    setLoadedChapters([]);
    setNoMoreChapters(false);
    setCurrentChapterIndex(chapterIndex);
    setIsTocOpen(false);
    setIsTTSOpen(false);
    setActiveTTSIndex(null);
    window.history.replaceState(null, "", `#${chapterIndex}`);
    window.scrollTo({ top: 0 });
  }, []);

  // 點擊螢幕中央區域 → 切換設定選單
  const handleContentClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // 如果目前有其他的彈窗（目錄、聲音）開著，點擊外面只會關閉它們，不要觸發開啟 Aa 設定
      if (isTocOpen || isTTSOpen) return;

      const target = e.target as HTMLElement;
      if (target.closest("a") || target.closest("button")) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const sectionHeight = rect.height / 3;

      if (clickY > sectionHeight && clickY < sectionHeight * 2) {
        setIsMenuOpen((prev) => !prev);
      }
    },
    [isTocOpen, isTTSOpen]
  );

  // 彈窗開啟時鎖定 body 滾動
  useEffect(() => {
    document.body.style.overflow = (isMenuOpen || isTocOpen || isTTSOpen) ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isMenuOpen, isTocOpen, isTTSOpen]);

  // TTS 播放進度改變時，自動滾動到該段落
  useEffect(() => {
    if (activeTTSIndex !== null) {
      const node = document.getElementById(`tts-node-${activeTTSIndex}`);
      if (node) {
        // 預留標題列以及上方空間（約 140px 高度處），確保段落出現在畫面上半部，不被底部 TTS 面板遮住
        const offset = 140;
        const rect = node.getBoundingClientRect();
        // 只有當元素被面板遮擋或距離頂部太遠 / 太近時才進行平滑滾動
        const absoluteY = window.scrollY + rect.top;
        window.scrollTo({
          top: absoluteY - offset,
          behavior: "smooth"
        });
      }
    }
  }, [activeTTSIndex]);

  // 設定章節 ref
  const setChapterRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) chapterRefs.current.set(index, el);
    else chapterRefs.current.delete(index);
  }, []);

  // ── 狀態 1: 載入中 ──
  if (isLoadingInitial) {
    return <div className={styles.readerLoading}>靈力運轉中，正在載入章節...</div>;
  }

  // ── 狀態 2: 錯誤 ──
  if (error || loadedChapters.length === 0) {
    return (
      <div className={styles.readerError}>
        <h2>前方沒有路了</h2>
        <p>{error}</p>
        <div className={styles.readerNavButtons}>
          <button onClick={() => window.location.href = `/novels/${bookId}`} className={styles.navBtn}>
            返回目錄
          </button>
        </div>
      </div>
    );
  }

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
      {/* 頂部導覽（固定）- 顯示當前章節標題 */}
      <div className={styles.readerHeader}>
        <Link href={`/novels/${bookId}`} className={styles.readerBackLink}>
          ← 返回
        </Link>
        <span className={styles.readerHeaderTitle}>{visibleChapterTitle}</span>
        <div className={styles.readerHeaderRight}>
          <button 
            className={`${styles.readerSettingsBtn} ${isTTSPlaying ? styles.ttsBtnPlaying : ""}`} 
            onClick={() => setIsTTSOpen(true)} 
            aria-label="語音朗讀"
          >
            🔊
          </button>
          <button className={styles.readerSettingsBtn} onClick={() => setIsTocOpen(true)} aria-label="開啟目錄">
            ☰
          </button>
          <button className={styles.readerSettingsBtn} onClick={() => setIsMenuOpen(true)} aria-label="開啟閱讀設定">
            Aa
          </button>
        </div>
      </div>

      {/* 多章連續渲染 (包含 TTS 高亮邏輯) */}
      {(() => {
        let globalTTSIdx = 0;
        
        return loadedChapters.map((ch, idx) => {
          const titleIdx = globalTTSIdx++;
          const lines = ch.content.split("\n");

          return (
            <div
              key={ch.chapter_index}
              ref={(el) => setChapterRef(ch.chapter_index, el)}
              data-chapter-index={ch.chapter_index}
              data-chapter-title={ch.chapter_title}
            >
              {/* 章節間分隔線 */}
              {idx > 0 && (
                <div className={styles.chapterDivider}>
                  <span>— 第 {ch.chapter_index} 章 —</span>
                </div>
              )}
              <h1 
                id={`tts-node-${titleIdx}`}
                className={`${styles.readerTitle} ${activeTTSIndex === titleIdx ? styles.ttsHighlight : ""}`}
              >
                {ch.chapter_title}
              </h1>
              <p className={styles.readerMeta}>
                字數：{ch.word_count.toLocaleString()} 字 | 發布於：{ch.publish_date}
              </p>
              <div className={styles.readerContent}>
                {lines.map((line, i) => {
                  if (!line.trim()) {
                    return <span key={i}>{line}{"\n"}</span>;
                  }
                  const lineIdx = globalTTSIdx++;
                  return (
                    <span
                      key={i}
                      id={`tts-node-${lineIdx}`}
                      className={activeTTSIndex === lineIdx ? styles.ttsHighlight : ""}
                    >
                      {line}
                      {"\n"}
                    </span>
                  );
                })}
              </div>
              {ch.author_note && (() => {
                const noteIdx = globalTTSIdx++;
                return (
                  <div 
                    id={`tts-node-${noteIdx}`}
                    className={`${styles.authorNoteBox} ${activeTTSIndex === noteIdx ? styles.ttsHighlight : ""}`}
                  >
                    <strong>作者有話說：</strong>
                    <p>{ch.author_note}</p>
                  </div>
                );
              })()}
            </div>
          );
        });
      })()}

      {/* 底部哨兵元素（觸發自動載入下一章） */}
      {!noMoreChapters && (
        <div ref={sentinelRef} className={styles.chapterSentinel}>
          {isLoadingMore && <p>正在載入下一章...</p>}
        </div>
      )}

      {/* 已是最新章節提示 */}
      {noMoreChapters && (
        <div className={styles.readerEndMessage}>
          <p>— 已是最新章節 —</p>
          <button
            className={styles.navBtnGhost}
            onClick={() => setIsTocOpen(true)}
          >
            開啟目錄
          </button>
        </div>
      )}

      {/* 目錄彈窗 */}
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
              <button
                key={ch.chapter_index}
                className={`${styles.tocItem} ${
                  loadedChapters.some((lc) => lc.chapter_index === ch.chapter_index)
                    ? styles.tocItemActive
                    : ""
                }`}
                onClick={() => jumpToChapter(ch.chapter_index)}
              >
                <span>第 {ch.chapter_index} 章　{ch.chapter_title}</span>
                <span className={styles.tocItemDate}>{ch.publish_date}</span>
              </button>
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

      {/* TTS 語音朗讀彈窗 */}
      <TTSPlayer
        isOpen={isTTSOpen}
        onClose={() => setIsTTSOpen(false)}
        paragraphs={ttsParagraphs}
        onParagraphChange={setActiveTTSIndex}
        onPlayingChange={setIsTTSPlaying}
      />
    </div>
  );
}
