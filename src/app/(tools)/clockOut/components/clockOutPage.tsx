"use client";
import React, { useEffect, useRef, useState } from "react";
import { Container } from "react-bootstrap";
import styles from "../styles/clockOut.module.css";
import PageWrapper from "@/components/common/PageWrapper";
import { useClockOutStore } from "../store/useClockOutStore";
import {
  computeClockState,
  computeEndTime,
  fmtHM,
  todayStr,
} from "../utils/timeUtils";
import { cheerFor, BEFORE_CHEER } from "../utils/cheers";
import ExpBar from "./ExpBar";
import SettingsControl from "./SettingsControl";
import ClockOutCelebration from "./ClockOutCelebration";

const ClockOutPage: React.FC = () => {
  const [isMounted, setIsMounted] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [celebrate, setCelebrate] = useState(false);
  const prevDone = useRef(false);

  const {
    workMinutes,
    lunchMinutes,
    clockInTime,
    overrideEndTime,
    overrideDate,
  } = useClockOutStore();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 每秒更新現在時間；分頁切回/喚醒時重新校時
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 1000);
    const onVis = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const autoEnd = computeEndTime(clockInTime, workMinutes, lunchMinutes);
  const isOverride = overrideDate === todayStr() && !!overrideEndTime;
  const effectiveEnd = isOverride ? (overrideEndTime as string) : autoEnd;

  const state = computeClockState(nowMin, clockInTime, effectiveEnd);

  const cheer = state.status === "before" ? BEFORE_CHEER : cheerFor(state.pct);

  // 進度首次達到 100% 時觸發慶祝
  useEffect(() => {
    const done = state.status === "done";
    if (done && !prevDone.current) setCelebrate(true);
    if (!done) setCelebrate(false);
    prevDone.current = done;
  }, [state.status]);

  if (!isMounted) return null; // 避免 Zustand persist 造成的 hydration mismatch

  const h = Math.floor(state.remainingMin / 60);
  const m = Math.round(state.remainingMin % 60);

  return (
    <PageWrapper>
      <Container className={styles.container}>
        <SettingsControl />

        <div className={styles.console}>
          {/* SCREEN */}
          <div className={styles.screen}>
            <div className={styles.screenTop}>
              <div className={styles.nowWrap}>
                <div className={styles.nowLabel}>現在時間</div>
                <div className={styles.nowClock}>{fmtHM(nowMin)}</div>
              </div>
              <div className={styles.statusPill}>
                {state.status === "before"
                  ? "尚未開工"
                  : state.status === "done"
                    ? "已下班"
                    : "上班中"}
              </div>
            </div>

            <div className={styles.countBlock}>
              <div className={styles.countCap}>{state.cap}</div>
              <div className={styles.countMain}>
                {state.status === "done" ? (
                  <span className={`${styles.n} ${styles.doneText}`}>
                    自由了！
                  </span>
                ) : (
                  <>
                    {h > 0 && (
                      <>
                        <span className={styles.n}>{h}</span>
                        <span className={styles.u}>小時</span>
                      </>
                    )}
                    <span className={styles.n}>{m}</span>
                    <span className={styles.u}>分</span>
                  </>
                )}
              </div>
            </div>

            <ExpBar pct={state.pct} exp={state.exp} />

            <div className={styles.cheerRow}>
              <div className={styles.cheer}>{cheer}</div>
            </div>

            {state.status === "done" && (
              <div className={styles.doneInline}>
                {}
                <img
                  src="/images/clockOut/clockout_done.png"
                  alt="下班啦水豚君"
                />
                <div>
                  <b>下班啦！</b>
                  <br />
                  <span className={styles.doneSub}>今天也辛苦了，快跑 🏃</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.legend}>
          下班 = 上班 + 工時 + 午休；可手動調整下班（加班），隔天自動歸位 🦫
        </div>
      </Container>

      <ClockOutCelebration
        show={celebrate}
        cheer={cheer}
        onClose={() => setCelebrate(false)}
      />
    </PageWrapper>
  );
};

export default ClockOutPage;
