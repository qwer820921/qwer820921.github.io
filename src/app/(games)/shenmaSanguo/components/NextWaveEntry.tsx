"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Binoculars } from "react-bootstrap-icons";
import { HeroConfig, TeamSlot } from "../types";
import {
  NextWaveBattle,
  NextWaveStats,
  NextWaveView,
  nextWaveView,
} from "../utils/nextWave";
import { previewAirReadiness } from "../utils/stageAirReadiness";
import StageAirReadinessNote from "./StageAirReadinessNote";
import { PreviewWaveBody, previewWaveStatus } from "./PreviewWaveDetail";
import { useDialogFocus } from "./useDialogFocus";
import styles from "../styles/shenmaSanguo.module.css";

interface Props {
  /** 這一場已採用的 Godot 戰況（update_stats） */
  stats: NextWaveStats | null;
  /** 這一場送進遊戲的關卡與敵人設定 */
  battle: NextWaveBattle | null;
  /** 目前上陣的隊伍與武將設定：這一波的對空準備用 */
  team: TeamSlot[] | null | undefined;
  heroesConfig: HeroConfig[] | null | undefined;
  /** 已收到結算：關閉視窗 */
  ended: boolean;
  /** 入口按鈕的樣式（兩個戰鬥入口的按鈕外觀不同） */
  buttonClassName: string;
}

/**
 * 戰場內的「下一波」（規則見 utils/nextWave）：兩個戰鬥入口共用的入口按鈕與唯讀視窗。
 * 視窗跟著這一場的戰況更新（開著時換波，標題與內容一起換成新的下一波）；換一場（battle_id 不同）或結算時關閉。
 * 只是查看：不送任何命令給遊戲，不暫停／恢復、不開始下一波、不改自動與倍率，也不發 API、不寫存檔
 */
export default function NextWaveEntry({
  stats,
  battle,
  team,
  heroesConfig,
  ended,
  buttonClassName,
}: Props) {
  // 視窗屬於哪一場：換一場（包括換關、帳號切換後重新載入）時自然關閉，舊場的狀態不會帶到新場
  const [openFor, setOpenFor] = useState<string | null>(null);
  const view = useMemo(() => nextWaveView(stats, battle), [stats, battle]);
  const open =
    !ended &&
    openFor !== null &&
    !!battle &&
    openFor === battle.battleId &&
    view.status !== "ended";

  return (
    <>
      {/* 很窄的畫面只留圖示（按鈕的名稱仍是「下一波」），不擠掉迎戰、自動、速度與暫停 */}
      <button
        type="button"
        className={`${buttonClassName} ${styles.nextWaveBtn}`}
        onClick={() => battle && setOpenFor(battle.battleId)}
        disabled={!battle || ended}
        aria-haspopup="dialog"
        aria-label="下一波"
        title="查看下一波的敵軍（只是查看，戰鬥不會暫停）"
        data-testid="next-wave-open"
      >
        <Binoculars aria-hidden />
        <span className={styles.nextWaveLabel}>下一波</span>
      </button>
      {open && (
        <NextWaveModal
          view={view}
          team={team}
          heroesConfig={heroesConfig}
          onClose={() => setOpenFor(null)}
        />
      )}
    </>
  );
}

function positionText(v: NextWaveView): string {
  if (v.status === "waiting" || v.status === "ended") return "";
  if (v.phase === "battle") {
    return v.autoPending
      ? `第 ${v.current} 波已清完，自動模式即將開始下一波。`
      : `目前第 ${v.current} 波戰鬥中。`;
  }
  return v.current === 0
    ? "備戰中，第 1 波還沒開始。"
    : `備戰中，第 ${v.current} 波已結束。`;
}

function NextWaveModal({
  view: v,
  team,
  heroesConfig,
  onClose,
}: {
  view: NextWaveView;
  team: TeamSlot[] | null | undefined;
  heroesConfig: HeroConfig[] | null | undefined;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // 開啟時焦點移到右上的關閉鈕，關閉時還給「下一波」按鈕；Esc 只關閉這個視窗、Tab 只在視窗內循環
  const onKeyDown = useDialogFocus(panelRef, closeRef, onClose);
  const air = useMemo(
    () =>
      v.status === "wave" && !v.wave.rejected
        ? previewAirReadiness(v.scoped, team, heroesConfig)
        : null,
    [v, team, heroesConfig]
  );

  const next = v.status === "wave" || v.status === "unknown" ? v.next : null;
  const title =
    v.status === "wave" || v.status === "unknown"
      ? `下一波：第 ${v.next} 波（共 ${v.total} 波）`
      : "下一波";

  return createPortal(
    <div
      className={`${styles.modalBackdrop} ${styles.nextWaveBackdrop}`}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      data-testid="next-wave"
      data-status={v.status}
      data-next={next ?? ""}
      data-current={
        v.status === "waiting" || v.status === "ended" ? "" : v.current
      }
      data-total={v.status === "waiting" || v.status === "ended" ? "" : v.total}
      data-phase={v.status === "waiting" || v.status === "ended" ? "" : v.phase}
    >
      <div
        ref={panelRef}
        className={styles.modalPanel}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle} data-testid="next-wave-title">
            {title}
          </span>
          <button
            ref={closeRef}
            className={styles.modalClose}
            onClick={onClose}
            aria-label="關閉下一波"
            data-testid="next-wave-close"
          >
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.previewSummary}>
            {positionText(v) && (
              <div data-testid="next-wave-position">{positionText(v)}</div>
            )}
            {v.status === "waiting" && (
              <div data-testid="next-wave-summary">
                等待這一場的戰況：收到後才會顯示下一波。
              </div>
            )}
            {v.status === "last" && (
              <div data-testid="next-wave-summary">
                {v.total === 0
                  ? "遊戲沒有可以打的波次，沒有下一波。"
                  : `已是最後一波：第 ${v.total} 波之後沒有下一波。`}
              </div>
            )}
            {v.status === "unknown" && (
              <div
                className={styles.previewNote}
                data-testid="next-wave-summary"
              >
                {v.reason}。
              </div>
            )}
            {v.status === "wave" && (
              <>
                <div data-testid="next-wave-summary">
                  {v.wave.missing
                    ? `關卡資料沒有第 ${v.next} 波：遊戲打到這一波會拒絕開始（不是沒有下一波）。`
                    : v.wave.rejected
                      ? "這一波沒有可以出兵的敵人組：遊戲會拒絕開始這一波（仍在備戰、城池不扣血），原因見下方各組。"
                      : `第 ${v.next} 波：${previewWaveStatus(v.wave)}${v.wave.total === null ? "（有資料不完整的組）" : "敵人"}`}
                </div>
                {v.dataWaves !== v.total && (
                  <div className={styles.previewNote}>
                    關卡資料有 {v.dataWaves} 波，遊戲共 {v.total}{" "}
                    波：這一波的資料可能和戰場不一致。
                  </div>
                )}
                {v.scoped.problems.map((p) => (
                  <div key={p} className={styles.previewNote}>
                    資料不完整：{p}
                  </div>
                ))}
              </>
            )}
            <div className={styles.previewHint} data-testid="next-wave-hint">
              只是查看：戰鬥會照目前的狀態繼續，不會暫停、不會開始下一波，也不改變自動與倍率。需要暫停請先關閉這個視窗，再按暫停。
            </div>
          </div>

          {v.status === "wave" && (
            <div className={styles.previewWave} data-testid="next-wave-detail">
              <PreviewWaveBody wave={v.wave} showGround />
            </div>
          )}

          {air && (
            <>
              <StageAirReadinessNote
                readiness={air}
                variant="panel"
                scope="wave"
              />
              {air.kind === "ground" && air.invalidFlying.length === 0 && (
                <div
                  className={styles.previewHint}
                  data-testid="next-wave-no-air"
                >
                  這一波沒有飛行敵人。
                </div>
              )}
            </>
          )}

          <button
            className={`${styles.btnOutline} w-100 mt-2`}
            onClick={onClose}
            data-testid="next-wave-close-bottom"
          >
            關閉
          </button>
        </div>
      </div>
    </div>,
    document.getElementsByClassName(styles.gameBody)[0] ?? document.body
  );
}
