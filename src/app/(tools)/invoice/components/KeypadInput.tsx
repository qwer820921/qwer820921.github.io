import React, { useState, useEffect } from "react";
import styles from "../styles/invoice.module.css";
import { LotteryPeriod } from "../types";
import { getAllWinningLists } from "../api/invoiceApi";
import { quickCheckLastThree } from "../utils";
import { useToast } from "@/components/common/Toast";

/**
 * 快速對獎鍵盤元件
 * 大型數字鍵盤，輸入後三碼自動比對
 */
const KeypadInput: React.FC = () => {
  const [inputValue, setInputValue] = useState<string>("");
  const [allPeriods, setAllPeriods] = useState<LotteryPeriod[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [checkResult, setCheckResult] = useState<{
    checked: boolean;
    possible: boolean;
    matches: string[];
  } | null>(null);
  const [displayState, setDisplayState] = useState<"normal" | "win" | "lose">(
    "normal"
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 載入所有期別中獎號碼
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const periods = await getAllWinningLists();
      setAllPeriods(periods);
    } catch (err) {
      console.error("Failed to load lottery data:", err);
      setError("無法載入中獎號碼");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const lotteryData = allPeriods[selectedIndex] || null;

  const toast = useToast();

  // 當輸入3碼時自動檢查
  useEffect(() => {
    if (inputValue.length === 3 && lotteryData) {
      const result = quickCheckLastThree(inputValue, lotteryData);
      setCheckResult({
        checked: true,
        possible: result.possible,
        matches: result.matches,
      });
      setDisplayState(result.possible ? "win" : "lose");

      // 顯示 Toast 通知
      if (result.possible) {
        toast.success(`🎉 可能中獎！${result.matches.join("、")}`);
      } else {
        toast.info(`末三碼 ${inputValue} 未中獎，再試一張！`);
      }

      // 動畫結束後自動清除（若未中獎）
      if (!result.possible) {
        setTimeout(() => {
          setInputValue("");
          setCheckResult(null);
          setDisplayState("normal");
        }, 800);
      }
    } else {
      setCheckResult(null);
      setDisplayState("normal");
    }
  }, [inputValue, lotteryData]);

  const handleKeyPress = (key: string) => {
    if (key === "C") {
      setInputValue("");
      setCheckResult(null);
      setDisplayState("normal");
    } else if (inputValue.length < 3) {
      setInputValue((prev) => prev + key);
    }
  };

  const getDisplayClass = () => {
    switch (displayState) {
      case "win":
        return styles.inputDisplayWin;
      case "lose":
        return styles.inputDisplayLose;
      default:
        return styles.inputDisplay;
    }
  };

  return (
    <div className={styles.glassCard}>
      <div className={styles.keypadContainer}>
        {/* 錯誤提示 */}
        {error && (
          <div className="alert alert-danger d-flex align-items-center justify-content-between mb-3">
            <span>⚠️ {error}</span>
            <button className="btn btn-sm btn-warning" onClick={loadData}>
              🔄 重試
            </button>
          </div>
        )}

        {/* 期別選擇器 */}
        <div className={styles.periodSelector}>
          <label className={styles.periodLabel}>對獎期別</label>
          <select
            className={styles.periodSelect}
            value={selectedIndex}
            onChange={(e) => {
              setSelectedIndex(parseInt(e.target.value));
              setInputValue("");
              setCheckResult(null);
              setDisplayState("normal");
            }}
            disabled={loading || allPeriods.length === 0}
          >
            {allPeriods.map((period, idx) => (
              <option key={idx} value={idx}>
                {period.period}
              </option>
            ))}
          </select>
        </div>

        {/* 輸入顯示區 */}
        <div className={getDisplayClass()}>
          <div className={styles.inputLabel}>請輸入發票末三碼</div>
          <div className={styles.inputValue}>
            {inputValue || (
              <span className={styles.inputPlaceholder}>_ _ _</span>
            )}
          </div>
        </div>

        {/* 結果顯示 */}
        {checkResult?.checked && (
          <div
            className={
              checkResult.possible ? styles.resultWin : styles.resultLose
            }
          >
            <div
              className={`${styles.resultTitle} ${
                checkResult.possible
                  ? styles.resultTitleWin
                  : styles.resultTitleLose
              }`}
            >
              {checkResult.possible ? "🎉 有機會中獎！" : "😢 沒有中獎"}
            </div>
            {checkResult.possible && (
              <div className={styles.resultDetail}>
                {checkResult.matches.map((match, idx) => (
                  <div key={idx}>{match}</div>
                ))}
                <div className="mt-2 text-white-50">
                  請確認完整8碼以確定中獎金額
                </div>
              </div>
            )}
          </div>
        )}

        {/* 數字鍵盤 */}
        <div className={styles.keypadGrid}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0"].map(
            (key) => (
              <button
                key={key}
                className={
                  key === "C" ? styles.keypadButtonClear : styles.keypadButton
                }
                onClick={() => handleKeyPress(key)}
              >
                {key === "C" ? "清除" : key}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default KeypadInput;
