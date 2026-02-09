/**
 * 數學工具函數
 */

import { Point } from "../types";

/**
 * 計算兩點之間的距離
 */
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 計算兩點之間的距離平方 (性能優化)
 */
export function distanceSquared(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return dx * dx + dy * dy;
}

/**
 * 線性插值
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * 點的線性插值
 */
export function lerpPoint(p1: Point, p2: Point, t: number): Point {
  return {
    x: lerp(p1.x, p2.x, t),
    y: lerp(p1.y, p2.y, t),
  };
}

/**
 * 限制數值在範圍內
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 計算從 p1 指向 p2 的單位向量
 */
export function normalize(p1: Point, p2: Point): Point {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist === 0) return { x: 0, y: 0 };

  return {
    x: dx / dist,
    y: dy / dist,
  };
}

/**
 * 生成唯一 ID
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
