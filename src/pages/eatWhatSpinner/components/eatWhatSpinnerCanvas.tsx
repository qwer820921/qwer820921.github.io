import React, { useRef, useEffect, useState } from "react";
import { Food } from "../types";

type Props = {
  foods: Food[];
};

const EatWhatSpinnerCanvas: React.FC<Props> = ({ foods = [] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [selectedFood, setSelectedFood] = useState<string | null>(null);
  const [hoverAddress, setHoverAddress] = useState<string | null>(null);
  const [rotateAngleInDegrees, setRotateAngleInDegrees] = useState(0); // 狀態變數儲存角度
  const [tooltipPosition, setTooltipPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const size = 300;
  const center = size / 2;
  const numSegments = foods.length;
  const anglePerSegment = (2 * Math.PI) / numSegments;

  const textBounds = useRef<
    { x: number; y: number; width: number; height: number; index: number }[]
  >([]);

  useEffect(() => {
    drawWheel(0); // Initialize the wheel with no rotation
  }, [foods]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hover = textBounds.current.find(
        (b) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height
      );
      if (hover) {
        setHoverAddress(foods[hover.index].address ?? null);
        setTooltipPosition({ x: e.clientX, y: e.clientY });
      } else {
        setHoverAddress(null);
        setTooltipPosition(null);
      }
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
    };
  }, [foods]);

  const drawWheel = (angle: number) => {
    const angleInDegrees = angle * (180 / Math.PI); // 轉換為角度
    setRotateAngleInDegrees(angleInDegrees); // 儲存角度到狀態

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(center, center);

    // Adjust the starting angle to make the first food (三鍋臭媽媽) on the right side
    const startAngle = -Math.PI / 2; // -90 degrees to make the first food align with the pointer (12 o'clock)

    // Rotate the wheel by the given angle
    ctx.rotate(angle * (Math.PI / 180)); // Convert degrees to radians

    textBounds.current = [];

    // Draw each food segment
    for (let i = 0; i < numSegments; i++) {
      const segmentAngle = (2 * Math.PI) / numSegments;
      const foodStartAngle = startAngle + i * segmentAngle;

      // Draw the food segments
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, center - 10, foodStartAngle, foodStartAngle + segmentAngle);
      ctx.fillStyle = `hsl(${(i * 360) / numSegments}, 80%, 70%)`;
      ctx.fill();
      ctx.stroke();

      // Draw the food name
      ctx.save();
      ctx.rotate(foodStartAngle + segmentAngle / 2);
      ctx.translate(center - 60, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = "#000";
      ctx.font = "14px sans-serif";
      const text = foods[i].name;
      const textWidth = ctx.measureText(text).width;
      ctx.fillText(text, -textWidth / 2, 0);

      const x =
        center +
        Math.cos(foodStartAngle + segmentAngle / 2) * (center - 60) -
        textWidth / 2;
      const y =
        center +
        Math.sin(foodStartAngle + segmentAngle / 2) * (center - 60) -
        7;
      textBounds.current.push({ x, y, width: textWidth, height: 14, index: i });

      ctx.restore();
    }

    ctx.restore();

    // Draw the pointer
    ctx.beginPath();
    ctx.moveTo(center, 10);
    ctx.lineTo(center - 10, 30);
    ctx.lineTo(center + 10, 30);
    ctx.closePath();
    ctx.fillStyle = "red";
    ctx.fill();
  };

  const spin = () => {
    if (isSpinning) return; // 如果已經在旋轉，則不執行

    setIsSpinning(true);
    setSelectedFood(null); // 清空選中的食物
    setHoverAddress(null); // 清空 hover 地址

    const duration = 3000; // 旋轉時間 3 秒
    const start = performance.now(); // 記錄動畫開始時間
    const totalRotation = 10 * 360 + Math.random() * 360; // 旋轉 10 圈加隨機的角度，這裡是度數

    const animate = (now: number) => {
      const elapsed = now - start; // 計算已過時間
      const progress = Math.min(elapsed / duration, 1); // 計算進度
      const easing = 1 - Math.pow(1 - progress, 3); // easeOutCubic 調整

      const newAngle = totalRotation * easing; // 根據進度計算新角度
      drawWheel(newAngle); // 重新繪製轉盤

      if (progress < 1) {
        requestAnimationFrame(animate); // 若動畫未結束，繼續執行動畫
      } else {
        // 動畫結束後處理：
        // Normalize the final angle to [0, 360)
        const normalizedAngle = rotateAngleInDegrees % 360;

        // 旋轉的偏移角度是指針相對於 12 點鐘方向的偏移
        const pointerAngle = (normalizedAngle + 90) % 360; // 12 點鐘為 90 度偏移

        // 根據 12 點鐘方向的角度計算所選區塊
        const selectedIndex =
          Math.floor(pointerAngle / (360 / numSegments)) % numSegments;

        setSelectedFood(foods[selectedIndex].name);
        setIsSpinning(false);
      }
    };

    requestAnimationFrame(animate); // 啟動動畫循環
  };

  return (
    <div className="container-fluid p-3">
      <div className="row">
        <div className="col-12">
          <h1 className="text-3xl font-bold">吃什麼轉盤</h1>
        </div>
        <div className="col-12 position-relative">
          <canvas
            ref={canvasRef}
            width={size}
            height={size}
            className="border rounded-full"
          />
          {hoverAddress && tooltipPosition && (
            <div
              style={{
                position: "fixed",
                top: tooltipPosition.y + 10,
                left: tooltipPosition.x + 10,
                background: "rgba(0,0,0,0.75)",
                color: "#fff",
                padding: "4px 8px",
                borderRadius: "4px",
                pointerEvents: "none",
                fontSize: "0.8rem",
                zIndex: 9999,
              }}
            >
              {hoverAddress}
            </div>
          )}
        </div>
        <div className="col-12 mt-3">
          <button
            onClick={spin}
            disabled={isSpinning}
            className={`px-6 py-2 text-white rounded 
            ${isSpinning ? "bg-secondary" : "bg-info"}`}
          >
            {isSpinning ? "旋轉中..." : "開始旋轉"}
          </button>
        </div>
        {/* {selectedFood && (
          <div className="col-12 mt-2 text-xl text-green-700 fw-bold">
            🎉 選中：{selectedFood}
          </div>
        )} */}
      </div>
    </div>
  );
};

export default EatWhatSpinnerCanvas;
