import React, { useRef, useEffect, useState } from "react";
import { Food } from "../types";

type Props = {
  foods: Food[];
};

const SpinnerCanvas: React.FC<Props> = ({ foods = [] }) => {
  // ====== 狀態管理 ======
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isSpinning, setIsSpinning] = useState(false); // 控制是否正在旋轉
  const [selectedFood, setSelectedFood] = useState<string | null>(null); // 選中的食物
  const [hoverAddress, setHoverAddress] = useState<string | null>(null); // 滑鼠懸停的地址
  const [tooltipPosition, setTooltipPosition] = useState<{
    x: number;
    y: number;
  } | null>(null); // Tooltip 位置

  // ====== 基本設定 ======
  // 轉盤大小：動態根據螢幕寬度調整
  const [size, setSize] = useState(300);
  const center = size / 2;
  const numSegments = foods.length;

  // 用來記錄文字區塊位置，用來做 hover 判定
  const textBounds = useRef<
    { x: number; y: number; width: number; height: number; index: number }[]
  >([]);

  // ====== 初始畫轉盤 ======
  useEffect(() => {
    drawWheel(0); // 畫初始不旋轉的轉盤
  }, [foods, size]);

  // ====== 監聽視窗大小變化，自適應設定 size ======
  useEffect(() => {
    const handleResize = () => {
      let screenWidth;
      if (window.innerWidth > 1200) {
        screenWidth = window.innerWidth * 0.35;
      } else if (window.innerWidth > 769) {
        screenWidth = window.innerWidth * 0.425;
      } else {
        screenWidth = window.innerWidth * 0.85;
      }
      setSize(screenWidth);
    };

    handleResize(); // 初始設定
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ====== 監聽滑鼠移動，處理 hover 地址提示 ======
  useEffect(() => {
    setSelectedFood(null); // 清除選中食物
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 找到滑鼠在哪個文字範圍內
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

  // ====== 畫轉盤函式 ======
  const drawWheel = (angleInDegrees: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((angleInDegrees * Math.PI) / 180); // 將整個轉盤旋轉指定角度

    const startAngle = -Math.PI / 2; // 讓第0個食物從上方（12點鐘方向）開始
    textBounds.current = [];

    for (let i = 0; i < numSegments; i++) {
      const segmentAngle = (2 * Math.PI) / numSegments;
      const foodStartAngle = startAngle + i * segmentAngle;

      // 畫每一個扇形區塊
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, center - 10, foodStartAngle, foodStartAngle + segmentAngle);
      ctx.fillStyle = `hsl(${(i * 360) / numSegments}, 80%, 70%)`;
      ctx.fill();
      ctx.stroke();

      // 畫文字
      ctx.save();
      ctx.rotate(foodStartAngle + segmentAngle / 2);
      ctx.translate(center - 60, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = "#000";
      ctx.font = "14px sans-serif";
      const text = foods[i].name;
      const textWidth = ctx.measureText(text).width;
      ctx.fillText(text, -textWidth / 2, 0);

      // 紀錄文字區域，方便 hover 判定
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

    // 畫紅色指針
    ctx.beginPath();
    ctx.moveTo(center, 10);
    ctx.lineTo(center - 10, 30);
    ctx.lineTo(center + 10, 30);
    ctx.closePath();
    ctx.fillStyle = "red";
    ctx.fill();
  };

  // ====== 啟動旋轉 ======
  const spin = () => {
    if (isSpinning) return; // 避免重複觸發旋轉

    setIsSpinning(true);
    setSelectedFood(null);
    setHoverAddress(null);

    const duration = 3000; // 動畫時間（毫秒）
    const start = performance.now();
    const totalRotation = 10 * 360 + Math.random() * 360; // 10圈 + 隨機角度

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1); // 正規化進度 0~1
      const easing = 1 - Math.pow(1 - progress, 3); // easeOutCubic 緩動曲線

      const currentAngle = totalRotation * easing;
      drawWheel(currentAngle);

      if (progress < 1) {
        requestAnimationFrame(animate); // 還沒轉完，持續動畫
      } else {
        // ====== 動畫結束後處理結果 ======

        const normalizedAngle = totalRotation % 360; // 取最後落點角度
        const anglePerSegment = 360 / numSegments;
        const shiftedAngle = (360 - normalizedAngle) % 360; // 逆向計算指針對應的區塊
        const selectedIndex =
          Math.floor(shiftedAngle / anglePerSegment) % numSegments;

        setSelectedFood(foods[selectedIndex].name); // 設定選中結果
        setIsSpinning(false);
      }
    };

    requestAnimationFrame(animate);
  };

  // ====== 畫面渲染 ======
  return (
    <div className="container-fluid p-0">
      <div className="row">
        <div className="col-12">
          <h1 className="text-3xl font-bold">吃什麼轉盤</h1>
        </div>

        <div className="col-12 position-relative text-center">
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

        {selectedFood && (
          <div className="col-12 mt-2 text-xl text-green-700 fw-bold">
            🎉 選中：{selectedFood}
          </div>
        )}
      </div>
    </div>
  );
};

export default SpinnerCanvas;
