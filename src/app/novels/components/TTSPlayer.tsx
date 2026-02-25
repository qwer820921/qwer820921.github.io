"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { SkipBackwardFill, PlayFill, PauseFill, SkipForwardFill } from "react-bootstrap-icons";
import styles from "../novels.module.css";

interface TTSPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  /** 要朗讀的段落列表 */
  paragraphs: string[];
  /** 通知外部目前正在讀哪個段落 index（用於高亮） */
  onParagraphChange: (index: number | null) => void;
  /** 通知外部 TTS 是否正在播放 */
  onPlayingChange: (isPlaying: boolean) => void;
}

export default function TTSPlayer({
  isOpen,
  onClose,
  paragraphs,
  onParagraphChange,
  onPlayingChange,
}: TTSPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [rate, setRate] = useState(1.0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>("");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // 可用速率列表
  const rateOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];

  // 取得可用的中文語音
  useEffect(() => {
    const loadVoices = () => {
      const allVoices = speechSynthesis.getVoices();
      const zhVoices = allVoices.filter(
        (v) => v.lang.startsWith("zh") || v.lang.startsWith("cmn")
      );
      // 如果沒有中文語音，就用全部
      const available = zhVoices.length > 0 ? zhVoices : allVoices;
      setVoices(available);

      // 預設選第一個中文語音
      if (available.length > 0 && !selectedVoiceURI) {
        setSelectedVoiceURI(available[0].voiceURI);
      }
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      speechSynthesis.onvoiceschanged = null;
    };
  }, [selectedVoiceURI]);

  // 清除目前正在播放的語句，避免 cancel() 觸發 onend 導致自動連播
  const stopActiveUtterance = useCallback(() => {
    if (utteranceRef.current) {
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
    }
    // 從暫停狀態直接 cancel 會有雷，先 resume 保平安
    speechSynthesis.resume();
    speechSynthesis.cancel();
  }, []);

  // 組件卸載時停止播放
  useEffect(() => {
    return () => {
      stopActiveUtterance();
      onParagraphChange(null);
      onPlayingChange(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopActiveUtterance]);

  // 朗讀指定段落
  const speakParagraph = useCallback(
    (index: number) => {
      if (index < 0 || index >= paragraphs.length) {
        // 讀完了
        stopActiveUtterance();
        setIsPlaying(false);
        onPlayingChange(false);
        onParagraphChange(null);
        return;
      }

      // 為了防呆清空狀態
      stopActiveUtterance();

      const text = paragraphs[index].trim();
      if (!text) {
        // 空段落跳過
        speakParagraph(index + 1);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.lang = "zh-TW";

      // 設定選擇的語音
      if (selectedVoiceURI) {
        const voice = voices.find((v) => v.voiceURI === selectedVoiceURI);
        if (voice) utterance.voice = voice;
      }

      utterance.onstart = () => {
        setCurrentIndex(index);
        onParagraphChange(index);
      };

      utterance.onend = () => {
        // 自動讀下一段
        speakParagraph(index + 1);
      };

      utterance.onerror = (e) => {
        if (e.error !== "canceled") {
          console.warn("TTS error:", e.error);
          // 嘗試下一段
          speakParagraph(index + 1);
        }
      };

      utteranceRef.current = utterance;
      // 關鍵修復：cancel() 之後必須要有短暫延遲再 speak()，否則某些瀏覽器會把新的 speak 也吃掉導致沒聲音
      setTimeout(() => {
        speechSynthesis.speak(utterance);
      }, 50);
    },
    [paragraphs, rate, selectedVoiceURI, voices, onParagraphChange, onPlayingChange, stopActiveUtterance]
  );

  // 找尋目前畫面上第一個出現的段落（使用二元搜尋，因為 DOM 順序與 Index 對應且呈線性疊加）
  const getFirstVisibleIndex = useCallback(() => {
    let low = 0;
    let high = paragraphs.length - 1;
    let firstVisible = -1;

    // header 加上些許緩衝，大約 90px
    const HEADER_OFFSET = 90;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const el = document.getElementById(`tts-node-${mid}`);
      
      if (el) {
        const rect = el.getBoundingClientRect();
        // 如果這個段落的底部已經超過 Header，代表它在畫面內或畫面更下方
        if (rect.bottom > HEADER_OFFSET) {
          firstVisible = mid;
          high = mid - 1; // 繼續往上找看有沒有更前面的也符合
        } else {
          // 在 Header 上方（已被捲動過去）
          low = mid + 1;
        }
      } else {
        // 如果節點不存在，為了避免無窮迴圈或報錯，只能跳出（通常不會發生）
        break;
      }
    }
    
    return firstVisible;
  }, [paragraphs.length]);

  // 播放 / 暫停
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      stopActiveUtterance();
      setIsPlaying(false);
      onPlayingChange(false);
      // 暫停時保留高亮，讓使用者知道讀到哪裡
    } else {
      // 準備播放時，判斷目前畫面上是不是有更符合的段落
      let targetIndex = currentIndex;
      const visibleIdx = getFirstVisibleIndex();
      
      // 如果找到了可見段落，而且目前的高亮段落不在畫面上，就更新為畫面上的那個！
      if (visibleIdx !== -1) {
        const currentActiveEl = document.getElementById(`tts-node-${currentIndex}`);
        if (currentActiveEl) {
          const rect = currentActiveEl.getBoundingClientRect();
          // 如果原本的段落因為滾動已經離開畫面（太上面或太下面），就重新定位
          if (rect.bottom < 80 || rect.top > window.innerHeight) {
            targetIndex = visibleIdx;
            setCurrentIndex(visibleIdx);
          }
        } else {
          targetIndex = visibleIdx;
          setCurrentIndex(visibleIdx);
        }
      }

      setIsPlaying(true);
      onPlayingChange(true);
      speakParagraph(targetIndex);
    }
  }, [isPlaying, currentIndex, speakParagraph, onPlayingChange, stopActiveUtterance, getFirstVisibleIndex]);

  // 上一段
  const prevParagraph = useCallback(() => {
    const newIndex = Math.max(0, currentIndex - 1);
    setCurrentIndex(newIndex);
    if (isPlaying) {
      speakParagraph(newIndex);
    } else {
      stopActiveUtterance();
      onParagraphChange(newIndex);
    }
  }, [currentIndex, isPlaying, speakParagraph, onParagraphChange, stopActiveUtterance]);

  // 下一段
  const nextParagraph = useCallback(() => {
    const newIndex = Math.min(paragraphs.length - 1, currentIndex + 1);
    setCurrentIndex(newIndex);
    if (isPlaying) {
      speakParagraph(newIndex);
    } else {
      stopActiveUtterance();
      onParagraphChange(newIndex);
    }
  }, [currentIndex, paragraphs.length, isPlaying, speakParagraph, onParagraphChange, stopActiveUtterance]);

  // 切換語速
  const cycleRate = useCallback(() => {
    const currentRateIndex = rateOptions.indexOf(rate);
    const nextRateIndex = (currentRateIndex + 1) % rateOptions.length;
    const newRate = rateOptions[nextRateIndex];
    setRate(newRate);

    // 如果正在播放，用新速率重新讀當前段落
    if (isPlaying) {
      stopActiveUtterance();
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(paragraphs[currentIndex]?.trim() || "");
        utterance.rate = newRate;
        utterance.lang = "zh-TW";
        if (selectedVoiceURI) {
          const voice = voices.find((v) => v.voiceURI === selectedVoiceURI);
          if (voice) utterance.voice = voice;
        }
        utterance.onend = () => speakParagraph(currentIndex + 1);
        utterance.onerror = (e) => {
          if (e.error !== "canceled") speakParagraph(currentIndex + 1);
        };
        utteranceRef.current = utterance;
        speechSynthesis.speak(utterance);
      }, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, isPlaying, currentIndex, paragraphs, selectedVoiceURI, voices]);

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className={`${styles.menuOverlay} ${isOpen ? styles.menuOverlayVisible : ""}`}
        onClick={onClose}
      />

      {/* 底部彈窗 */}
      <div className={`${styles.ttsDrawer} ${isOpen ? styles.ttsDrawerOpen : ""}`}>
        {/* 拖曳提示條 */}
        <div className={styles.menuHandle} onClick={onClose}>
          <span className={styles.menuHandleBar} />
        </div>

        {/* 播放控制列 */}
        <div className={styles.ttsControls}>
          <button
            className={styles.ttsIconBtn}
            onClick={prevParagraph}
            aria-label="上一段"
            disabled={currentIndex <= 0}
          >
            <SkipBackwardFill />
          </button>

          <button
            className={`${styles.ttsIconBtn} ${styles.ttsPlayBtn}`}
            onClick={togglePlay}
            aria-label={isPlaying ? "暫停" : "播放"}
          >
            {isPlaying ? <PauseFill /> : <PlayFill style={{ marginLeft: "4px" }} />}
          </button>

          <button
            className={styles.ttsIconBtn}
            onClick={nextParagraph}
            aria-label="下一段"
            disabled={currentIndex >= paragraphs.length - 1}
          >
            <SkipForwardFill />
          </button>

          <button
            className={styles.ttsRateBtnPill}
            onClick={cycleRate}
            aria-label="調整語速"
          >
            {rate}x
          </button>
        </div>

        {/* 進度提示 */}
        <div className={styles.ttsProgress}>
          <span>
            段落 {currentIndex + 1} / {paragraphs.length}
          </span>
        </div>

        {/* 語音選擇（有多個中文語音時才顯示） */}
        {voices.length > 1 && (
          <div className={styles.ttsVoiceSection}>
            <span className={styles.ttsVoiceLabel}>語音</span>
            <select
              className={styles.ttsVoiceSelect}
              value={selectedVoiceURI}
              onChange={(e) => setSelectedVoiceURI(e.target.value)}
            >
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </>
  );
}
