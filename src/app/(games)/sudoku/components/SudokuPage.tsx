"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useSudokuStore } from "../store/useSudokuStore";
import {
  Arrow90degLeft,
  Eraser,
  Pencil,
  Lightbulb,
  ArrowLeft,
  ArrowCounterclockwise,
  Trophy,
  EmojiFrown,
} from "react-bootstrap-icons";
import "../styles.css";
import { Difficulty } from "../types";

const SudokuPage = () => {
  const {
    grid,
    difficulty,
    mistakes,
    maxMistakes,
    notesMode,
    selectedCell,
    gameState,
    elapsedTime,
    _hasHydrated,
    initGame,
    selectCell,
    setCellValue,
    toggleNotesMode,
    eraseCell,
    useHint,
    tickTimer,
    setHasHydrated,
  } = useSudokuStore();

  const [showDifficultySelector, setShowDifficultySelector] = useState(true);

  // Timer effect
  useEffect(() => {
    if (gameState !== "playing") return;
    const interval = setInterval(() => tickTimer(), 1000);
    return () => clearInterval(interval);
  }, [gameState, tickTimer]);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== "playing") return;
      if (e.key >= "1" && e.key <= "9") {
        setCellValue(parseInt(e.key));
      } else if (e.key === "Backspace" || e.key === "Delete") {
        eraseCell();
      } else if (e.key === "n" || e.key === "N") {
        toggleNotesMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, setCellValue, eraseCell, toggleNotesMode]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleDifficultyChoice = (diff: Difficulty) => {
    initGame(diff);
    setShowDifficultySelector(false);
  };

  if (!_hasHydrated) return null;

  return (
    <div className="sudoku-container">
      {/* 遊戲頂部導航 */}
      <div className="sudoku-header">
        <div className="stats-row">
          <div className="stats-item">
            <span>{formatTime(elapsedTime)}</span>
          </div>

          <div className="stats-item">
            <span className="mistakes-count">
              ERROR: {mistakes}/{maxMistakes}
            </span>
          </div>

          <button
            className="sudoku-top-btn"
            onClick={() => initGame(difficulty)}
          >
            <ArrowCounterclockwise size={20} />
          </button>
        </div>

        <div
          style={{
            textAlign: "center",
            textTransform: "uppercase",
            fontSize: "0.8rem",
            letterSpacing: "1px",
            opacity: 0.8,
          }}
        >
          難度:{" "}
          {
            {
              easy: "簡單",
              medium: "普通",
              hard: "困難",
              expert: "專家",
            }[difficulty]
          }
        </div>
      </div>

      {/* 9x9 網格 */}
      <div className="sudoku-grid">
        {grid.map((row, rIdx) =>
          row.map((cell, cIdx) => {
            const isSelected =
              selectedCell?.[0] === rIdx && selectedCell?.[1] === cIdx;
            const isHighlightRelated =
              selectedCell &&
              (selectedCell[0] === rIdx || selectedCell[1] === cIdx);
            const isHighlightSame =
              selectedCell &&
              grid[selectedCell[0]][selectedCell[1]].value === cell.value &&
              cell.value !== null;

            return (
              <div
                key={`${rIdx}-${cIdx}`}
                className={`sudoku-cell 
                  ${isSelected ? "selected" : ""} 
                  ${isHighlightRelated ? "highlight-related" : ""} 
                  ${isHighlightSame ? "highlight-same" : ""}
                  ${cell.initialValue !== null ? "initial" : "user-input"}
                  ${!cell.isCorrect ? "incorrect" : ""}
                `}
                onClick={() => selectCell(rIdx, cIdx)}
              >
                {cell.value !== null ? (
                  cell.value
                ) : (
                  <div className="notes-grid">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <div key={n} className="note-num">
                        {cell.notes.includes(n) ? n : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 控制面板 */}
      <div className="controls-layout">
        <div className="sudoku-controls">
          <button className="control-btn" onClick={() => {}}>
            <div className="icon-circle">
              <Arrow90degLeft size={20} />
            </div>
            <span>Undo</span>
          </button>
          <button className="control-btn" onClick={eraseCell}>
            <div className="icon-circle">
              <Eraser size={20} />
            </div>
            <span>Erase</span>
          </button>
          <button
            className={`control-btn ${notesMode ? "active" : ""}`}
            onClick={toggleNotesMode}
          >
            <div className="icon-circle">
              <Pencil size={20} />
            </div>
            <span>Notes {notesMode ? "ON" : "OFF"}</span>
          </button>
          <button className="control-btn" onClick={useHint}>
            <div className="icon-circle">
              <Lightbulb size={20} />
            </div>
            <span>Hint</span>
          </button>
        </div>

        {/* 數字鍵盤 */}
        <div className="num-pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} className="num-btn" onClick={() => setCellValue(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* 難度選擇 Modal */}
      {showDifficultySelector && (
        <div className="sudoku-overlay">
          <div className="sudoku-modal">
            <h2 style={{ marginBottom: "10px", color: "#1e293b" }}>選擇難度</h2>
            <p style={{ opacity: 0.7, marginBottom: "20px", color: "#64748b" }}>
              挑戰您的邏輯極限
            </p>
            <div className="difficulty-options">
              <button
                className="diff-btn"
                onClick={() => handleDifficultyChoice("easy")}
              >
                簡單 (Easy)
              </button>
              <button
                className="diff-btn"
                onClick={() => handleDifficultyChoice("medium")}
              >
                普通 (Medium)
              </button>
              <button
                className="diff-btn"
                onClick={() => handleDifficultyChoice("hard")}
              >
                困難 (Hard)
              </button>
              <button
                className="diff-btn"
                onClick={() => handleDifficultyChoice("expert")}
              >
                專家 (Expert)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 勝負結算 Modal */}
      {(gameState === "won" || gameState === "lost") &&
        !showDifficultySelector && (
          <div className="sudoku-overlay">
            <div className="sudoku-modal">
              {gameState === "won" ? (
                <>
                  <div
                    style={{
                      color: "#facc15",
                      fontSize: "4rem",
                      marginBottom: "20px",
                    }}
                  >
                    <Trophy />
                  </div>
                  <h2 style={{ color: "#1e293b" }}>恭喜過關！</h2>
                  <p style={{ margin: "15px 0", color: "#64748b" }}>
                    用時：{formatTime(elapsedTime)}
                  </p>
                </>
              ) : (
                <>
                  <div
                    style={{
                      color: "#ef4444",
                      fontSize: "4rem",
                      marginBottom: "20px",
                    }}
                  >
                    <EmojiFrown />
                  </div>
                  <h2 style={{ color: "#1e293b" }}>挑戰失敗</h2>
                  <p style={{ margin: "15px 0", color: "#64748b" }}>
                    累積錯誤已達 3 次
                  </p>
                </>
              )}
              <button
                className="diff-btn"
                style={{
                  width: "100%",
                  background: "#0ea5e9",
                  color: "white",
                  marginTop: "10px",
                }}
                onClick={() => setShowDifficultySelector(true)}
              >
                再試一次
              </button>
            </div>
          </div>
        )}
    </div>
  );
};

export default SudokuPage;
