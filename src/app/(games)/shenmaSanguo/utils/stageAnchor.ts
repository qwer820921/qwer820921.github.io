"use client";

import { RefObject, useLayoutEffect } from "react";

/** Godot 遊戲畫面的基準大小（project.godot 的 viewport 540×720；戰場容器固定這個比例，見 shenmaSanguo.module.css 的 D22） */
export const GAME_VIEW_W = 540;
export const GAME_VIEW_H = 720;

/** 面板離可見範圍邊緣、離單位的距離（px） */
const EDGE = 10;
const GAP = 24;

/**
 * 戰場上的面板（選取面板、部署選單）共用的定位（Round 18，D22）：
 * - Godot 送來的是遊戲畫面的邏輯座標（以 540×720 為基準）。乘上縮放比例 min(寬/540, 高/720)
 *   就是在遊戲容器裡的位置；面板的 offsetParent 和 iframe 是同一個矩形（遊戲容器或部署選單的遮罩）
 * - 放在單位上方，放不下時放下方；限制在「戰場區域（data-game-stage）與視窗」的交集裡。
 *   可用高度不夠時限制面板的最大高度，由面板自己捲動
 * - 視窗大小、方向、遊戲容器或面板本身的大小改變時重新計算（不是只在第一次繪製時量一次）
 */
export function useStageAnchor(
  ref: RefObject<HTMLElement | null>,
  pos: { x: number; y: number }
) {
  const { x: px, y: py } = pos;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const parent = el.offsetParent;
      if (!(parent instanceof HTMLElement)) return;
      const pr = parent.getBoundingClientRect();
      const stageEl = parent.closest("[data-game-stage]");
      const sr = stageEl ? stageEl.getBoundingClientRect() : pr;
      // 看得到的範圍（視窗座標）：戰場區域與視窗的交集
      const minL = Math.max(sr.left, 0) + EDGE;
      const minT = Math.max(sr.top, 0) + EDGE;
      const maxR = Math.min(sr.right, window.innerWidth) - EDGE;
      const maxB = Math.min(sr.bottom, window.innerHeight) - EDGE;
      el.style.maxWidth = `${Math.max(0, maxR - minL)}px`;
      el.style.maxHeight = `${Math.max(0, maxB - minT)}px`;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const k = Math.min(pr.width / GAME_VIEW_W, pr.height / GAME_VIEW_H) || 1;
      const x = pr.left + px * k;
      const y = pr.top + py * k;
      const above = y - h - GAP;
      const top = Math.max(
        minT,
        Math.min(maxB - h, above >= minT ? above : y + GAP)
      );
      const left = Math.max(minL, Math.min(maxR - w, x - w / 2));
      el.style.left = `${left - pr.left}px`;
      el.style.top = `${top - pr.top}px`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    if (el.offsetParent) ro.observe(el.offsetParent);
    window.addEventListener("resize", place);
    window.addEventListener("orientationchange", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("orientationchange", place);
    };
  }, [ref, px, py]);
}
