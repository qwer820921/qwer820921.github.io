"use client";
import React, { useEffect, useRef, useState } from "react";
import styles from "../styles/clockOut.module.css";
import { useClockOutStore } from "../store/useClockOutStore";
import { computeEndTime, todayStr } from "../utils/timeUtils";

const SettingsControl: React.FC = () => {
  const {
    workMinutes,
    lunchMinutes,
    clockInTime,
    overrideEndTime,
    overrideDate,
    configured,
    showClockIn,
    showClockOut,
    setWorkMinutes,
    setLunchMinutes,
    setClockIn,
    setEndOverride,
    resetEnd,
    setShowClockIn,
    setShowClockOut,
    reset,
  } = useClockOutStore();

  const [open, setOpen] = useState(false);
  const didInit = useRef(false);

  // 首次（尚未設定過）自動展開
  useEffect(() => {
    if (!didInit.current) {
      didInit.current = true;
      if (!configured) setOpen(true);
    }
  }, [configured]);

  const autoEnd = computeEndTime(clockInTime, workMinutes, lunchMinutes);
  const isOverride = overrideDate === todayStr() && !!overrideEndTime;
  const effectiveEnd = isOverride ? (overrideEndTime as string) : autoEnd;
  const workHours = workMinutes / 60;

  return (
    // .clockInCorner 只負責 position:relative（給內部彈窗定位用）；
    // 實際的絕對定位/置中由父層 clockOutPage.tsx 的 .topControls 容器決定，
    // 必須渲染在該容器內才會正確定位。
    <div className={styles.clockInCorner}>
      <button
        type="button"
        className={styles.pixelBtn}
        aria-label="上班時間設定"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        🕘 上班 {clockInTime}
      </button>

      {open && (
        <>
          <div className={styles.clickCatcher} onClick={() => setOpen(false)} />
          <div
            className={styles.clockInPop}
            role="dialog"
            aria-label="上班時間設定"
          >
            <div className={styles.settingsTitle}>🕘 上班時間設定</div>

            {/* 每日：上班時間（主要） */}
            <div className={styles.field}>
              <div className={styles.fieldHead}>
                <span>
                  <span className={styles.dot}>▸</span> 上班時間
                </span>
                <label className={styles.showToggle}>
                  <input
                    type="checkbox"
                    className={styles.toggleInput}
                    checked={showClockIn}
                    onChange={(e) => setShowClockIn(e.target.checked)}
                  />
                  顯示
                </label>
              </div>
              <input
                type="time"
                className={styles.timeInput}
                value={clockInTime}
                onChange={(e) => setClockIn(e.target.value)}
                autoFocus
              />
            </div>

            {/* 下班時間：自動算出，可手動調整（加班） */}
            <div className={styles.field}>
              <div className={styles.fieldHead}>
                <span>
                  <span className={styles.dot}>▸</span> 下班時間
                  {isOverride && (
                    <span className={styles.overrideTag}>（今日手動）</span>
                  )}
                </span>
                <label className={styles.showToggle}>
                  <input
                    type="checkbox"
                    className={styles.toggleInput}
                    checked={showClockOut}
                    onChange={(e) => setShowClockOut(e.target.checked)}
                  />
                  顯示
                </label>
              </div>
              <div className={styles.inlineRow}>
                <input
                  type="time"
                  className={styles.timeInput}
                  value={effectiveEnd}
                  onChange={(e) => setEndOverride(e.target.value)}
                />
                {isOverride && (
                  <button
                    type="button"
                    className={styles.rowBtn}
                    onClick={resetEnd}
                  >
                    ↺ 自動
                  </button>
                )}
              </div>
            </div>

            {/* 固定設定：設定一次即可 */}
            <div className={styles.fixedBlock}>
              <div className={styles.fixedLabel}>
                🔒 固定設定（設定一次即可）
              </div>
              <div className={styles.times}>
                <div className={styles.field}>
                  <label>
                    <span className={styles.dot}>▸</span> 工時（小時）
                  </label>
                  <input
                    type="number"
                    className={styles.numInput}
                    min={0}
                    step={0.5}
                    value={workHours}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!Number.isNaN(v)) setWorkMinutes(Math.round(v * 60));
                    }}
                  />
                </div>
                <div className={styles.field}>
                  <label>
                    <span className={styles.dot}>▸</span> 午休（分鐘）
                  </label>
                  <input
                    type="number"
                    className={styles.numInput}
                    min={0}
                    step={5}
                    value={lunchMinutes}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isNaN(v)) setLunchMinutes(v);
                    }}
                  />
                </div>
              </div>
            </div>

            <div className={styles.settingsActions}>
              <button
                type="button"
                className={styles.saveBtn}
                onClick={() => setOpen(false)}
              >
                ✓ 儲存並收合
              </button>
              <button
                type="button"
                className={styles.resetBtn}
                onClick={() => reset()}
              >
                清除設定
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SettingsControl;
