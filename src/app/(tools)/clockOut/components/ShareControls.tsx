"use client";
import React, { useEffect, useRef, useState } from "react";
import styles from "../styles/clockOut.module.css";
import { copyScreenAsImage } from "../utils/shareImage";

interface Props {
  screenRef: React.RefObject<HTMLDivElement | null>;
  shareText: string;
}

const SUCCESS_MS = 2000;
const ERROR_MS = 3000;

type Timer = ReturnType<typeof setTimeout> | null;

const ShareControls: React.FC<Props> = ({ screenRef, shareText }) => {
  const [imageMsg, setImageMsg] = useState<string | null>(null);
  const [textMsg, setTextMsg] = useState<string | null>(null);
  const imageTimer = useRef<Timer>(null);
  const textTimer = useRef<Timer>(null);

  useEffect(() => {
    return () => {
      if (imageTimer.current) clearTimeout(imageTimer.current);
      if (textTimer.current) clearTimeout(textTimer.current);
    };
  }, []);

  const flash = (
    timerRef: React.RefObject<Timer>,
    setMsg: React.Dispatch<React.SetStateAction<string | null>>,
    msg: string,
    duration: number
  ) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMsg(msg);
    timerRef.current = setTimeout(() => setMsg(null), duration);
  };

  const handleCopyImage = async () => {
    if (!screenRef.current) return;
    try {
      const result = await copyScreenAsImage(screenRef.current);
      flash(
        imageTimer,
        setImageMsg,
        result === "clipboard" ? "✓ 已複製" : "已下載圖片",
        SUCCESS_MS
      );
    } catch {
      flash(imageTimer, setImageMsg, "截圖失敗", ERROR_MS);
    }
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      flash(textTimer, setTextMsg, "✓ 已複製", SUCCESS_MS);
    } catch {
      flash(textTimer, setTextMsg, "複製失敗，請手動選取", ERROR_MS);
    }
  };

  return (
    <div className={styles.shareCorner}>
      <button
        type="button"
        className={styles.pixelBtn}
        aria-label="複製圖片"
        onClick={handleCopyImage}
      >
        {imageMsg ?? "📷 複製圖片"}
      </button>
      <button
        type="button"
        className={styles.pixelBtn}
        aria-label="複製文案"
        onClick={handleCopyText}
      >
        {textMsg ?? "📝 複製文案"}
      </button>
    </div>
  );
};

export default ShareControls;
