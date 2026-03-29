"use client";
import { useEffect, useRef } from "react";
import { Direction } from "../types";

export function useSwipe(onSwipe: (direction: Direction) => void) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;

      const touchEnd = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
      };

      const dx = touchEnd.x - touchStartRef.current.x;
      const dy = touchEnd.y - touchStartRef.current.y;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // 閾值，避免輕微晃動誤觸
      if (Math.max(absDx, absDy) > 30) {
        if (absDx > absDy) {
          onSwipe(dx > 0 ? "RIGHT" : "LEFT");
        } else {
          onSwipe(dy > 0 ? "DOWN" : "UP");
        }
      }

      touchStartRef.current = null;
    };

    window.addEventListener("touchstart", handleTouchStart);
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onSwipe]);
}
