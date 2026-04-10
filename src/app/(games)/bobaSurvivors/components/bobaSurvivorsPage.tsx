"use client";
import React, { useState, useRef } from "react";
import { Container, Spinner, Button } from "react-bootstrap";
import styles from "../styles/bobaSurvivors.module.css";

const BobaSurvivorsPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleIframeLoad = () => {
    setTimeout(() => {
      setIsLoading(false);
    }, 500);
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;

    // 取得各種瀏覽器的全螢幕 API 路徑
    const doc = document as any;
    const requestFs =
      el.requestFullscreen ||
      (el as any).webkitRequestFullscreen ||
      (el as any).mozRequestFullScreen ||
      (el as any).msRequestFullscreen;
    const exitFs =
      doc.exitFullscreen ||
      doc.webkitExitFullscreen ||
      doc.mozCancelFullScreen ||
      doc.msExitFullscreen;

    // 檢查目前是否已在全螢幕狀態
    const currentFsEl =
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement;

    if (!currentFsEl && !isPseudoFullscreen) {
      // 優先嘗試系統級全螢幕
      if (requestFs) {
        requestFs.call(el).catch((err: any) => {
          console.warn("系統全螢幕啟動失敗，切換至偽全螢幕模式:", err);
          setIsPseudoFullscreen(true);
        });
      } else {
        // iOS 手機瀏覽器通常不支援 API，直接進入偽全螢幕
        setIsPseudoFullscreen(true);
      }
    } else {
      // 退出邏輯
      if (currentFsEl && exitFs) {
        exitFs.call(doc);
      }
      setIsPseudoFullscreen(false);
    }
  };

  // 監聽全螢幕狀態變化 (處理 Esc 鍵或系統手勢退出)
  React.useEffect(() => {
    const handleFsChange = () => {
      const doc = document as any;
      const currentFsEl =
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement;
      setIsFullscreen(!!currentFsEl);
      if (!currentFsEl) setIsPseudoFullscreen(false); // 同步重置
    };

    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    document.addEventListener("mozfullscreenchange", handleFsChange);
    document.addEventListener("MSFullscreenChange", handleFsChange);

    // [強力退場機制]：防掉 onLoad 沒觸發的情況
    // 如果 8 秒後還在讀取，強迫關閉讀取畫面
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 8000);

    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
      document.removeEventListener("mozfullscreenchange", handleFsChange);
      document.removeEventListener("MSFullscreenChange", handleFsChange);
      clearTimeout(timer);
    };
  }, []);

  // 是否處於全螢幕狀態 (任一模式皆是)
  const isAnyFullscreen = isFullscreen || isPseudoFullscreen;

  return (
    <Container fluid className={styles.pageContainer}>
      <div className={styles.header}>
        <h1 className="mb-0">重裝全糖珍奶</h1>
        <p className="text-muted mb-0">Boba Survivors</p>
      </div>

      <div
        className={`${styles.gameWrapper} ${isPseudoFullscreen ? styles.pseudoFullscreen : ""}`}
        ref={containerRef}
      >
        {/* 工具列 */}
        <div className={styles.toolbar}>
          <Button
            variant="dark"
            size="sm"
            className={styles.fullscreenBtn}
            onClick={toggleFullscreen}
          >
            {isAnyFullscreen ? "🗗 退出全螢幕" : "⛶ 全螢幕"}
          </Button>
        </div>

        {/* 載入畫面 */}
        {isLoading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.loadingContent}>
              <h3 className={styles.loadingTitle}>煮珍珠中...</h3>
              <Spinner
                animation="border"
                variant="warning"
                className={styles.spinner}
              />
              <p className={styles.loadingSub}>首次載入可能需要稍等一下</p>
            </div>
          </div>
        )}

        {/* Godot 遊戲 iframe */}
        <iframe
          ref={iframeRef}
          src="/games/bobaSurvivors/index.html"
          className={styles.gameIframe}
          onLoad={handleIframeLoad}
          allow="autoplay; fullscreen"
          title="Boba Survivors Game"
        />
      </div>

      <div className={styles.gameInfo}>
        <h4>遊戲說明</h4>
        <ul>
          <li>
            <strong>電腦操作：</strong>使用 <code>W</code> <code>A</code>{" "}
            <code>S</code> <code>D</code> 或 方向鍵移動。
          </li>
          <li>
            <strong>手機操作：</strong>在畫面上滑動使用虛擬搖桿移動。
          </li>
          <li>
            <strong>自動戰鬥：</strong>
            角色會自動攻擊範圍內的敵人，請專注於走位與躲避！
          </li>
        </ul>
      </div>
    </Container>
  );
};

export default BobaSurvivorsPage;
