"use client";
import React, { useState, useRef } from "react";
import { Container, Spinner, Button } from "react-bootstrap";
import styles from "../styles/bobaSurvivors.module.css";

const BobaSurvivorsPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleIframeLoad = () => {
    // 給 iframe 一點時間讓 Godot 引擎啟動，再隱藏 loading 畫面
    setTimeout(() => {
      setIsLoading(false);
    }, 500);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch((err) => {
        console.error(
          `Error attempting to enable full-screen mode: ${err.message} (${err.name})`
        );
      });
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  // 監聽全螢幕狀態變化
  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    // [強力退場機制]：防掉 onLoad 沒觸發的情況
    // 如果 8 秒後還在讀取，強迫關閉讀取畫面
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 8000);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      clearTimeout(timer);
    };
  }, []);

  return (
    <Container fluid className={styles.pageContainer}>
      <div className={styles.header}>
        <h1 className="mb-0">重裝全糖珍奶</h1>
        <p className="text-muted mb-0">Boba Survivors</p>
      </div>

      <div className={styles.gameWrapper} ref={containerRef}>
        {/* 工具列 */}
        <div className={styles.toolbar}>
          <Button
            variant="dark"
            size="sm"
            className={styles.fullscreenBtn}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? "🗗 退出全螢幕" : "⛶ 全螢幕"}
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
