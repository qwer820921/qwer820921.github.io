"use client";
import React, { useState } from "react";
import { Food } from "../types";

type Props = {
  foods: Food[];
};

const SlotMachine: React.FC<Props> = ({ foods }) => {
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);

  const spin = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setSelectedFood(null);

    const duration = 3000; // 3秒
    const interval = 100; // 每100ms更新一次
    let elapsed = 0;

    const spinner = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * foods.length);
      setSelectedFood(foods[randomIndex]);
      elapsed += interval;
      if (elapsed >= duration) {
        clearInterval(spinner);
        setIsSpinning(false);
      }
    }, interval);
  };

  return (
    <div className="text-center">
      <div className="slot-machine-display">
        <h2>{selectedFood?.name || "準備中..."}</h2>
        {selectedFood?.address && <p>地址：{selectedFood.address}</p>}
        {selectedFood?.distance && <p>距離：{selectedFood.distance}</p>}
      </div>
      <button
        onClick={spin}
        disabled={isSpinning}
        className="btn btn-primary mt-3"
      >
        {isSpinning ? "抽獎中..." : "開始抽獎"}
      </button>
    </div>
  );
};

export default SlotMachine;
