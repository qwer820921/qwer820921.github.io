import React, { useState, useEffect } from "react";

const PreviewCanvas = ({
  canvasList,
  pixelSizeInput,
}: {
  canvasList: string[][];
  pixelSizeInput: number;
}) => {
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setPreviewIndex((prev) => (prev + 1) % canvasList.length);
    }, 500);
    return () => clearInterval(interval);
  }, [canvasList.length, isPlaying]);

  return (
    <div className="d-flex flex-column align-items-center mt-5">
      <h5>預覽</h5>
      <div
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
      </div>
      <button
        className="btn btn-primary mt-2"
        onClick={() => setIsPlaying(!isPlaying)}
      >
        {isPlaying ? "暫停" : "播放"}
      </button>
    </div>
  );
};

export default PreviewCanvas;
