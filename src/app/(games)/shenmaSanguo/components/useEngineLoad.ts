"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import {
  ENGINE_FEATURE_CHECK_MS,
  ENGINE_START_STALL_SEC,
  ENGINE_STALL_SEC,
  EngineShellState,
  missingEngineFeatures,
  readEngineShell,
} from "../utils/engineLoad";

export interface EngineLoad extends EngineShellState {
  /** 已經多久沒有進展（秒；超過 ENGINE_STALL_SEC，啟動中是 ENGINE_START_STALL_SEC，才是停住了） */
  idleSec: number;
  /** 停住了：沒有收到資料、引擎也沒有啟動（只在下載前、下載中與啟動中判斷） */
  stalled: boolean;
}

const INITIAL: EngineLoad = {
  phase: "page",
  loaded: 0,
  total: 0,
  notice: "",
  idleSec: 0,
  stalled: false,
};

/**
 * 遊戲引擎的載入進度（見 utils/engineLoad）：active 時每半秒讀一次遊戲 iframe 外殼頁的狀態。
 * 階段或已下載的位元組改變就算有進展；外殼頁一直沒有開始下載時，檢查一次瀏覽器缺少的功能。
 * frameKey 改變（換了新的遊戲 iframe）時從頭計算
 */
export function useEngineLoad(
  frameRef: RefObject<HTMLIFrameElement | null>,
  active: boolean,
  frameKey: number
): EngineLoad {
  const [load, setLoad] = useState<EngineLoad>(INITIAL);

  useEffect(() => {
    if (!active) return;
    let lastKey = "";
    let lastAt = performance.now();
    let missing: string[] | null = null;
    const poll = () => {
      const now = performance.now();
      let s = readEngineShell(frameRef.current);
      const key = `${s.phase}:${s.loaded}`;
      if (key !== lastKey) {
        lastKey = key;
        lastAt = now;
      }
      if (s.phase === "waiting" && now - lastAt >= ENGINE_FEATURE_CHECK_MS) {
        missing ??= missingEngineFeatures();
        if (missing.length > 0) {
          s = { ...s, phase: "unsupported", notice: missing.join("、") };
        }
      }
      const idleSec = Math.floor((now - lastAt) / 1000);
      const limit =
        s.phase === "starting" ? ENGINE_START_STALL_SEC : ENGINE_STALL_SEC;
      const stalled =
        s.phase !== "failed" && s.phase !== "unsupported" && idleSec >= limit;
      setLoad((prev) =>
        prev.phase === s.phase &&
        prev.loaded === s.loaded &&
        prev.total === s.total &&
        prev.notice === s.notice &&
        prev.idleSec === idleSec &&
        prev.stalled === stalled
          ? prev
          : { ...s, idleSec, stalled }
      );
    };
    const first = setTimeout(poll, 0);
    const timer = setInterval(poll, 500);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [frameRef, active, frameKey]);

  return load;
}
