"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useGameStore } from "../store/useGameStore";
import { canPour } from "../utils/gameLogic";
import {
  ArrowCounterclockwise,
  PlusCircle,
  Lightbulb,
  Arrow90degLeft,
} from "react-bootstrap-icons";
import Tube from "./Tube";
import "../styles.css";

export default function WaterColorSortPage() {
  const {
    tubes,
    level,
    gameState,
    history,
    extraTubesEnabled,
    _hasHydrated,
    initLevel,
    pour,
    addExtraTube,
    undo,
    resetLevel,
    nextLevel,
  } = useGameStore();

  const [selectedTubeId, setSelectedTubeId] = useState<string | null>(null);
  const [hint, setHint] = useState<{ from: string; to: string } | null>(null);
  const [isIdle, setIsIdle] = useState(false);
  const [lastActionTime, setLastActionTime] = useState(Date.now());

  // 初始化關卡
  useEffect(() => {
    if (!_hasHydrated) return;
    if (tubes.length === 0) {
      initLevel(level || 1);
    }
  }, [_hasHydrated, level, tubes.length, initLevel]);

  // 閒置檢測 (被動提示)
  useEffect(() => {
    if (gameState !== "playing") return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastActionTime > 30000) {
        // 30 秒閒置
        setIsIdle(true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [gameState, lastActionTime]);

  const handleTubeClick = useCallback(
    (id: string) => {
      setLastActionTime(Date.now());
      setIsIdle(false);

      // 清除提示
      setHint(null);
      if (hintTimeoutId) {
        clearTimeout(hintTimeoutId);
        setHintTimeoutId(null);
      }

      if (selectedTubeId === null) {
        // 選取起始瓶
        const tube = tubes.find((t) => t.id === id);
        if (tube && tube.colors.length > 0) {
          setSelectedTubeId(id);
        }
      } else if (selectedTubeId === id) {
        // 取消選取
        setSelectedTubeId(null);
      } else {
        // 嘗試傾倒
        const success = pour(selectedTubeId, id);
        setSelectedTubeId(null);
      }
    },
    [selectedTubeId, tubes, pour]
  );

  const [hintTimeoutId, setHintTimeoutId] = useState<NodeJS.Timeout | null>(
    null
  );

  // 搜尋提示動作
  const findHint = useCallback(() => {
    if (gameState !== "playing") return null;

    let bestMove = null;
    let fallbackMove = null;

    for (let i = 0; i < tubes.length; i++) {
      const fromTube = tubes[i];
      if (fromTube.colors.length === 0) continue;

      for (let j = 0; j < tubes.length; j++) {
        if (i === j) continue;
        const toTube = tubes[j];

        if (canPour(fromTube, toTube)) {
          const fromTopColor = fromTube.colors[fromTube.colors.length - 1];

          // 規則：如果目標瓶非空且頂部顏色相同，這是高品質動作
          if (toTube.colors.length > 0) {
            // 如果這一步能清空出發瓶，或者是去塞滿目標瓶，那是更好的
            return { from: fromTube.id, to: toTube.id };
          }

          // 規則：如果目標瓶是空的，我們檢查出發瓶。
          // 如果出發瓶底部有不同顏色，那搬移是有意義的（為了露出下面的顏色）
          const allSameInFrom = fromTube.colors.every(
            (c) => c === fromTopColor
          );
          if (!allSameInFrom) {
            bestMove = { from: fromTube.id, to: toTube.id };
          } else {
            // 如果出發瓶已經都是同一種顏色，搬到空瓶子意義不大，除非它是為了騰出空間
            // 這裡把它當作 fallback
            fallbackMove = { from: fromTube.id, to: toTube.id };
          }
        }
      }
    }
    return bestMove || fallbackMove;
  }, [tubes, gameState]);

  const triggerHint = useCallback(() => {
    // 清除之前的計時器
    if (hintTimeoutId) {
      clearTimeout(hintTimeoutId);
    }

    const nextMove = findHint();
    if (nextMove) {
      setHint(nextMove);
      // 3 秒後自動取消提示視覺
      const timer = setTimeout(() => setHint(null), 3000);
      setHintTimeoutId(timer);
    } else {
      console.log("No valid moves found for hint");
    }
  }, [findHint, hintTimeoutId]);

  // 跳轉關卡
  useEffect(() => {
    return () => {
      if (hintTimeoutId) clearTimeout(hintTimeoutId);
    };
  }, [hintTimeoutId]);

  if (!_hasHydrated) return null;

  return (
    <div className="watercolor-container">
      <div className="game-header">
        <h1 className="level-title">LEVEL {level}</h1>
      </div>

      <div className="game-board">
        {tubes.map((tube) => (
          <Tube
            key={tube.id}
            tube={tube}
            isSelected={selectedTubeId === tube.id}
            isHintSource={hint?.from === tube.id}
            isHintTarget={hint?.to === tube.id}
            onClick={() => handleTubeClick(tube.id)}
          />
        ))}
      </div>

      <div className="controls-container">
        <button
          className="btn-round-icon undo"
          onClick={undo}
          disabled={history.length === 0}
          title="撤銷 (Undo)"
        >
          <Arrow90degLeft size={24} />
        </button>

        <button
          className="btn-round-icon reset"
          onClick={resetLevel}
          title="重新開始 (Reset)"
        >
          <ArrowCounterclockwise size={26} strokeWidth={2.5} />
        </button>

        <button
          className="btn-round-icon extra-tube"
          onClick={addExtraTube}
          disabled={extraTubesEnabled}
          title={extraTubesEnabled ? "已達上限" : "新增試管 (Add Tube)"}
        >
          <PlusCircle size={24} />
        </button>

        <button
          className={`btn-round-icon hint ${isIdle ? "active-hint" : ""}`}
          onClick={triggerHint}
          title="獲得提示 (Hint)"
        >
          <Lightbulb size={24} />
        </button>
      </div>

      {/* 成功彈窗 */}
      {gameState === "won" && (
        <div className="won-overlay">
          <div className="won-modal">
            <span className="won-icon">🏆</span>
            <h2 className="won-title">完美分類！</h2>
            <button className="btn-next" onClick={nextLevel}>
              進入下一關
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
