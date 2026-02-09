import React, { useState, useEffect } from "react";
import styles from "../invoice.module.css";
import { LotteryPeriod } from "../types";
import { PRIZE_TABLE } from "../constants/lotteryData";
import { getAllWinningLists } from "../api/invoiceApi";

/**
 * 中獎號碼展示元件
 * 以精緻的邀請函風格展示本期中獎號碼
 */
const LotteryDisplay: React.FC = () => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [allPeriods, setAllPeriods] = useState<LotteryPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 初始載入所有期別
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const periods = await getAllWinningLists();
      setAllPeriods(periods);
      if (periods.length > 0) {
        setSelectedIndex(0);
      }
    } catch (err) {
      setError("無法載入中獎號碼，請稍後再試");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const lotteryData = allPeriods[selectedIndex] || null;

  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat("zh-TW").format(amount);
  };

  if (loading) {
    return (
      <div className={styles.glassCard}>
        <div className="text-center py-5">
          <div className="spinner-border text-warning" role="status">
            <span className="visually-hidden">載入中...</span>
          </div>
          <p className="mt-3 text-white-50">正在載入中獎號碼...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.glassCard}>
        <div className="text-center py-5">
          <div className="text-danger mb-3" style={{ fontSize: "3rem" }}>
            ⚠️
          </div>
          <p className="text-danger mb-4">{error}</p>
          <button className="btn btn-warning px-4 py-2" onClick={loadData}>
            🔄 重新載入
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.glassCardGold}>
      {/* 期別選擇器 */}
      <div className={styles.periodSelector}>
        <label className={styles.periodLabel}>開獎期別</label>
        <select
          className={styles.periodSelect}
          value={selectedIndex}
          onChange={(e) => setSelectedIndex(parseInt(e.target.value))}
        >
          {allPeriods.map((period, idx) => (
            <option key={idx} value={idx}>
              {period.period}
            </option>
          ))}
        </select>
      </div>

      {lotteryData && (
        <>
          {/* 特別獎 */}
          <div className={styles.prizeSection}>
            <div className={styles.prizeHeader}>
              <div className={styles.prizeIconSpecial}>🏆</div>
              <div className={styles.prizeTitle}>
                <div className={styles.prizeName}>特別獎</div>
                <div className={styles.prizeAmount}>8位數號碼完全相同</div>
              </div>
              <div className={styles.prizeBadge}>
                ${formatAmount(PRIZE_TABLE.specialPrize.amount)}
              </div>
            </div>
            <div className={styles.numberDisplay}>
              <div className={styles.numberCard}>
                {lotteryData.specialPrize || "尚未開獎"}
              </div>
            </div>
          </div>

          {/* 特獎 */}
          <div className={styles.prizeSection}>
            <div className={styles.prizeHeader}>
              <div className={styles.prizeIconGrand}>💎</div>
              <div className={styles.prizeTitle}>
                <div className={styles.prizeName}>特獎</div>
                <div className={styles.prizeAmount}>8位數號碼完全相同</div>
              </div>
              <div className={styles.prizeBadge}>
                ${formatAmount(PRIZE_TABLE.grandPrize.amount)}
              </div>
            </div>
            <div className={styles.numberDisplay}>
              <div className={styles.numberCard}>{lotteryData.grandPrize}</div>
            </div>
          </div>

          {/* 頭獎 */}
          <div className={styles.prizeSection}>
            <div className={styles.prizeHeader}>
              <div className={styles.prizeIconFirst}>🥇</div>
              <div className={styles.prizeTitle}>
                <div className={styles.prizeName}>頭獎</div>
                <div className={styles.prizeAmount}>
                  後3碼 $200 → 後8碼 ${formatAmount(PRIZE_TABLE.first.amount)}
                </div>
              </div>
            </div>
            <div className={styles.numberDisplay}>
              {lotteryData.firstPrize.map((num, idx) => (
                <div key={idx} className={styles.numberCard}>
                  {num}
                </div>
              ))}
            </div>
          </div>

          {/* 增開六獎 */}
          {lotteryData.additionalSixth.length > 0 && (
            <div className={styles.prizeSection}>
              <div className={styles.prizeHeader}>
                <div className={styles.prizeIconSixth}>🎯</div>
                <div className={styles.prizeTitle}>
                  <div className={styles.prizeName}>增開六獎</div>
                  <div className={styles.prizeAmount}>末3碼相同</div>
                </div>
                <div className={styles.prizeBadge}>
                  ${formatAmount(PRIZE_TABLE.sixth.amount)}
                </div>
              </div>
              <div className={styles.numberDisplay}>
                {lotteryData.additionalSixth.map((num, idx) => (
                  <div key={idx} className={styles.numberCardSmall}>
                    {num}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LotteryDisplay;
