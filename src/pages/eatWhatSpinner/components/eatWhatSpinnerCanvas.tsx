/* eslint-disable prettier/prettier */
import React, { useRef, useEffect, useState } from "react";

type Props = {
  foods: string[];
};

const EatWhatSpinnerCanvas: React.FC<Props> = ({ foods = [] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const [selectedFood, setSelectedFood] = useState<string | null>(null);

  const size = 300;
  const center = size / 2;
  const numSegments = foods.length;
  const anglePerSegment = (2 * Math.PI) / numSegments;

  useEffect(() => {
    drawWheel();
  }, [angle, foods]);

  const drawWheel = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(angle);

    for (let i = 0; i < numSegments; i++) {
      const startAngle = i * anglePerSegment;
      const endAngle = startAngle + anglePerSegment;

      // 每塊扇形
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, center - 10, startAngle, endAngle);
      ctx.fillStyle = `hsl(${(i * 360) / numSegments}, 80%, 70%)`;
      ctx.fill();
      ctx.stroke();

      // 文字
      ctx.save();
      ctx.rotate(startAngle + anglePerSegment / 2);
      ctx.translate(center - 60, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = "#000";
      ctx.font = "14px sans-serif";
      ctx.fillText(foods[i], -ctx.measureText(foods[i]).width / 2, 0);
      ctx.restore();
    }

    ctx.restore();

    // 指針
    ctx.beginPath();
    ctx.moveTo(center, 10);
    ctx.lineTo(center - 10, 30);
    ctx.lineTo(center + 10, 30);
    ctx.closePath();
    ctx.fillStyle = "red";
    ctx.fill();
  };

  const spin = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setSelectedFood(null);

    const duration = 3000;
    const start = performance.now();
    const totalRotation = 10 * Math.PI + Math.random() * 2 * Math.PI;

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const easing = 1 - Math.pow(1 - progress, 3); // easeOutCubic

      const newAngle = totalRotation * easing;
      setAngle(newAngle);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // 計算最終角度，並確定指針指向的區段
        const normalizedAngle =
          ((newAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); // 標準化角度到 [0, 2π]
        const pointerAngle = (2 * Math.PI - normalizedAngle) % (2 * Math.PI); // 指針相對角度（逆轉）
        const selectedIndex =
          Math.floor(pointerAngle / anglePerSegment) % numSegments;
        setSelectedFood(foods[numSegments - 1 - selectedIndex]); // 反轉索引以匹配順時針繪製
        setIsSpinning(false);
      }
    };

    requestAnimationFrame(animate);
  };

  return (
    <div className="container-fluid p-3">
      <div className="row">
        <div className="col-12">
          <h1 className="text-3xl font-bold">吃什麼轉盤</h1>
        </div>
        <div className="col-12">
          <canvas
            ref={canvasRef}
            width={size}
            height={size}
            className="border rounded-full"
          />
        </div>
        <div className="col-12">
          <button
            onClick={spin}
            disabled={isSpinning}
            className={`px-6 py-2 text-white rounded 
          ${isSpinning ? "bg-gray" : "bg-blue"}`}
          >
            {isSpinning ? "旋轉中..." : "開始旋轉"}
          </button>
          {/* {selectedFood && (
            <div className="text-xl text-green-700 font-semibold">
              🎉 選中：{selectedFood}
            </div>
          )} */}
        </div>
      </div>
    </div>
  );
};

export default EatWhatSpinnerCanvas;
