import React, { useState, useEffect, useRef } from "react";
import { CanvasList } from "../types";

const PreviewCanvas = ({
  canvasList,
  pixelSizeInput,
}: {
  canvasList: CanvasList;
  pixelSizeInput: number;
}) => {
  // 🔢 當前播放的 frame index
  const [previewIndex, setPreviewIndex] = useState(0);

  // ▶️ 是否正在播放
  const [isPlaying, setIsPlaying] = useState(true);

  // 🎨 canvas 參考
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 🖼️ 預覽畫布大小固定為 240x240 像素
  const canvasSize = 240;

  // 📏 每格像素的大小（依據畫布解析度決定）
  const pixel = canvasSize / pixelSizeInput;

  // 🔄 播放動畫（每 500ms 換一張 frame）
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setPreviewIndex((prev) => (prev + 1) % canvasList.length);
    }, 500);

    return () => clearInterval(interval);
  }, [canvasList.length, isPlaying]);

  // 🖌️ 每當 frame index 變更，就重新繪製當前畫布內容
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const currentCanvas = canvasList[previewIndex];
    if (!currentCanvas) return; // 💡 加這行防止 undefined

    // 清除畫布內容
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 根據色碼一格一格畫上去
    for (const [i, color] of currentCanvas.entries()) {
      const x = (i % pixelSizeInput) * pixel;
      const y = Math.floor(i / pixelSizeInput) * pixel;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, pixel, pixel);
    }
  }, [canvasList, previewIndex, pixelSizeInput]);

  return (
    <>
      <h5>預覽</h5>

      {/* 畫布顯示預覽動畫 */}
      <canvas
        ref={canvasRef}
        width={canvasSize}
        height={canvasSize}
        style={{ border: "1px solid black", backgroundColor: "#fff" }}
      />
      {/* <div
        className="border border-dark"
        style={{
          width: "120px",
          height: "120px",
          display: "grid",
          gridTemplateColumns: `repeat(${pixelSizeInput}, 1fr)`,
          gridTemplateRows: `repeat(${pixelSizeInput}, 1fr)`,
          gap: "1px",
          backgroundColor: "#ffffff",
        }}
      >
        {canvasList[previewIndex]?.map((color, index) => (
          <div key={index} style={{ backgroundColor: color }} />
        ))}
      </div> */}

      {/* 播放/暫停按鈕 */}
      <button
        className="btn btn-primary mt-2"
        onClick={() => setIsPlaying(!isPlaying)}
      >
        {isPlaying ? "暫停" : "播放"}
      </button>
    </>
  );
};

export default PreviewCanvas;
