"use client";

import { useId } from "react";
import { COMPARE_MAX } from "../utils/heroCompare";

/**
 * 兩位武將比較的入口（主頁武將視窗、獨立武將頁共用）：「比較武將」切換比較模式；比較模式中點卡片是選取或取消
 * （不開升級），選好兩位不同的武將後「比較這兩位」開啟比較視窗。已經選滿時再點第三位不會替換，說明要先取消一位
 */
export default function HeroCompareBar({
  active,
  names,
  refused,
  onToggle,
  onStart,
  onClear,
}: {
  active: boolean;
  /** 已選武將的名稱（選取的順序） */
  names: string[];
  /** 剛才選滿時又點了第三位 */
  refused: boolean;
  onToggle: () => void;
  onStart: () => void;
  onClear: () => void;
}) {
  const hintId = useId();
  return (
    <div className="mb-2" data-testid="hero-compare-bar">
      <div className="d-flex flex-wrap align-items-center gap-2">
        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          aria-pressed={active}
          aria-describedby={active ? hintId : undefined}
          onClick={onToggle}
          data-testid="hero-compare-toggle"
        >
          {active ? "結束比較" : "比較武將"}
        </button>
        {active && (
          <>
            <span className="small" data-testid="hero-compare-picked">
              已選 {names.length}／{COMPARE_MAX}
              {names.length > 0 ? `：${names.join("、")}` : ""}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={names.length !== COMPARE_MAX}
              onClick={onStart}
              data-testid="hero-compare-start"
            >
              比較這兩位
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={names.length === 0}
              onClick={onClear}
              data-testid="hero-compare-clear"
            >
              清除選取
            </button>
          </>
        )}
      </div>
      {active && (
        <div id={hintId} className="small text-muted mt-1">
          點選武將卡片加入比較（兩位不同的武將），再點一次取消；比較模式中點卡片不會開啟升級。
        </div>
      )}
      <div
        role="status"
        aria-live="polite"
        className="small text-danger"
        data-testid="hero-compare-notice"
      >
        {active && refused
          ? `最多比較 ${COMPARE_MAX} 位：請先取消其中一位再選。`
          : ""}
      </div>
    </div>
  );
}
