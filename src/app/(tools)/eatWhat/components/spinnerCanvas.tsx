"use client";
import React, { useRef, useEffect, useState } from "react";
import { Food } from "../types";

type Props = {
  foods: Food[];
};

const SpinnerCanvas: React.FC<Props> = ({ foods = [] }) => {
  // ====== 狀態管理 ======
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isSpinning, setIsSpinning] = useState(false); // 控制是否正在旋轉
  const [selectedFood, setSelectedFood] = useState<Food | null>(null); // 選中的食物
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

  // 動態旋轉角度記錄（用於 hover 計算）
  const currentRotationRef = useRef(0);

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

  // ====== 監聽滑鼠移動，處理 hover 地址提示 (極座標判定) ======
  useEffect(() => {
    setSelectedFood(null); // 清除選中食物
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const dx = x - center;
      const dy = y - center;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // 如果超出圓盤範圍，或者太靠近圓心
      if (distance > center || distance < 20) {
        setHoverAddress(null);
        setTooltipPosition(null);
        return;
      }

      // 計算游標與圓心的夾角 (加上旋轉補償)
      // 注意：y 軸在螢幕是向下的，所以原本的 angle 正確
      let angle = Math.atan2(dy, dx);

      // 減去轉盤當前的旋轉角度，換算回圖形繪製時的角度
      angle -= (currentRotationRef.current * Math.PI) / 180;

      // atan2 的範圍是 -PI ~ PI，將其統一轉為 0 ~ 2PI 區間
      if (angle < 0) angle += 2 * Math.PI;
      angle = angle % (2 * Math.PI);

      // 我們繪製時起始角度是 -Math.PI / 2 (也就是上方 12 點方向)
      // 把從 -PI/2 算起的角度，位移回從 0 算起，方便對齊陣列
      const startAngle = -Math.PI / 2;
      let shiftedAngle = angle - startAngle;
      if (shiftedAngle < 0) shiftedAngle += 2 * Math.PI;
      shiftedAngle = shiftedAngle % (2 * Math.PI);

      // 計算屬於哪個區塊
      const segmentAngle = (2 * Math.PI) / numSegments;
      const index = Math.floor(shiftedAngle / segmentAngle);

      if (index >= 0 && index < foods.length) {
        setHoverAddress(foods[index].address ?? null);
        setTooltipPosition({ x: e.clientX, y: e.clientY });
      }
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
    };
  }, [foods, center, numSegments]);

  // ====== 畫轉盤函式 ======
  const drawWheel = (angleInDegrees: number) => {
    currentRotationRef.current = angleInDegrees; // 記錄供 hover 計算

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((angleInDegrees * Math.PI) / 180); // 將整個轉盤旋轉指定角度

    const startAngle = -Math.PI / 2; // 讓第0個食物從上方（12點鐘方向）開始

    for (let i = 0; i < numSegments; i++) {
      const segmentAngle = (2 * Math.PI) / numSegments;
      const foodStartAngle = startAngle + i * segmentAngle;

      // 1. 畫每一個扇形區塊
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, center - 10, foodStartAngle, foodStartAngle + segmentAngle);
      ctx.fillStyle = `hsl(${(i * 360) / numSegments}, 80%, 70%)`;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.stroke();

      // 2. 畫放射狀文字
      ctx.save();
      // 旋轉畫布到這個扇形的中心線
      ctx.rotate(foodStartAngle + segmentAngle / 2);
      // 將文字起始點往外推，避免擠在圓心
      ctx.translate(35, 0);

      // 清理與截斷文字
      let text = foods[i].name;
      // 去除括號內的補充字樣 (例如 "雞腿王 (台中限定)" -> "雞腿王")
      text = text.replace(/\s*[\(（\[【].*?[\)）\]】]\s*/g, "").trim();
      // 如果文字還是太長則截斷
      if (text.length > 12) {
        text = text.substring(0, 11) + "…";
      }

      // 動態字體大小：項目越多字越小 (範圍 10px ~ 16px)
      const fontSize = Math.max(10, Math.min(16, 350 / numSegments));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = "#000";
      ctx.textAlign = "left"; // 由內往外排
      ctx.textBaseline = "middle";

      ctx.fillText(text, 0, 0);
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

        setSelectedFood(foods[selectedIndex]); // 設定選中結果
        setIsSpinning(false);
      }
    };

    requestAnimationFrame(animate);
  };

  // ====== 畫面渲染 ======
  return (
    <div className="container-fluid p-0 text-center">
      <div className="row">
        {/* 頂部旋轉按鈕 */}
        <div className="col-12 mb-4 mt-2 px-4">
          <button
            onClick={spin}
            disabled={isSpinning}
            className="btn btn-lg w-100 fw-bold text-white shadow"
            style={{
              background: isSpinning
                ? "#adb5bd"
                : "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
              border: "none",
              borderRadius: "50px",
              padding: "12px 24px",
              fontSize: "1.2rem",
              transition: "all 0.3s ease",
            }}
          >
            {isSpinning ? "轉動中..." : "開始旋轉"}
          </button>
        </div>

        <div className="col-12 position-relative text-center">
          <canvas ref={canvasRef} width={size} height={size} />

          {hoverAddress && tooltipPosition && (
            <div
              style={{
                position: "fixed",
                top: tooltipPosition.y + 10,
                left: tooltipPosition.x + 10,
                background: "rgba(0,0,0,0.75)",
                color: "#fff",
                padding: "6px 12px",
                borderRadius: "8px",
                pointerEvents: "none",
                fontSize: "0.85rem",
                zIndex: 9999,
                boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
              }}
            >
              📍 {hoverAddress}
            </div>
          )}
        </div>

        {selectedFood && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              backgroundColor: "rgba(0,0,0,0.6)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 10000,
              backdropFilter: "blur(4px)",
            }}
            onClick={() => setSelectedFood(null)}
          >
            <div
              style={{
                background: "white",
                padding: "2.5rem 2rem",
                borderRadius: "20px",
                boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
                maxWidth: "90%",
                width: "350px",
                textAlign: "center",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="fw-bold mb-4" style={{ color: "#ff6b6b" }}>
                🎉 抽中啦！
              </h2>
              <div
                className="alert alert-success py-3 fw-bold fs-4 mb-2"
                style={{ borderRadius: "10px" }}
              >
                {selectedFood.name}
              </div>

              {/* 新增：去看地圖按鈕 */}
              <button
                className="btn btn-outline-info w-100 fw-bold mb-3"
                style={{
                  borderRadius: "50px",
                  padding: "10px",
                  border: "2px solid #0dcaf0",
                  color: "#0dcaf0",
                  backgroundColor: "transparent",
                }}
                onClick={() => {
                  const query = encodeURIComponent(`${selectedFood.name} ${selectedFood.address || ""}`);
                  const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
                  window.open(url, "_blank");
                }}
              >
                去看地圖
              </button>

              <button
                className="btn btn-lg w-100 fw-bold text-white"
                style={{
                  background: "linear-gradient(135deg, #ff6b6b, #ff8e53)",
                  border: "none",
                  borderRadius: "50px",
                  boxShadow: "0 4px 15px rgba(255, 107, 107, 0.4)",
                }}
                onClick={() => setSelectedFood(null)}
              >
                就決定是你了！
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpinnerCanvas;
