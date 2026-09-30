"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Row, Col } from "react-bootstrap";
import { EnemyConfig, HeroConfig, MapConfig, TeamSlot } from "../../types";
import {
  buildStagePreview,
  PreviewGroup,
  PreviewWave,
} from "../../utils/stagePreview";
import { FLYING_RULE_TEXT } from "../../utils/antiAir";
import { stageAirReadiness } from "../../utils/stageAirReadiness";
import StageAirReadinessNote from "../StageAirReadinessNote";
import styles from "../../styles/shenmaSanguo.module.css";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  map: MapConfig;
  enemies: EnemyConfig[];
  /** 目前上陣的隊伍與武將設定：出征前的對空準備提醒用（不改隊伍、不寫入） */
  team: TeamSlot[] | null | undefined;
  heroesConfig: HeroConfig[] | null | undefined;
  /** 關卡尚未解鎖（只顯示資訊，不改變解鎖規則） */
  locked: boolean;
  onClose: () => void;
}

/**
 * 關卡敵軍預覽（唯讀）：主頁的「關卡」視窗與獨立的關卡頁共用。
 * 只讀已載入的靜態設定（utils/stagePreview），沒有出征、切換關卡或任何寫入；
 * 用 portal 放在神馬三國的 gameBody（主題變數 --sg-* 定義在那裡；放到 body 會變成透明、沒有文字顏色），
 * 不在關卡卡片裡面，點擊不會觸發卡片（卡片本身點下去就是出征／切換關卡）。
 * 鍵盤：開啟時焦點移到視窗裡、Tab 只在視窗內循環（不能操作背後的關卡卡片與出征按鈕），
 * Esc 只關閉這個預覽，關閉後焦點回到開啟它的按鈕
 */
export default function EnemyPreviewModal({
  map,
  enemies,
  team,
  heroesConfig,
  locked,
  onClose,
}: Props) {
  const preview = useMemo(
    () => buildStagePreview(map, enemies),
    [map, enemies]
  );
  const air = useMemo(
    () => stageAirReadiness(map, enemies, team, heroesConfig),
    [map, enemies, team, heroesConfig]
  );
  const [open, setOpen] = useState<number[]>([1]);
  const toggle = (n: number) =>
    setOpen((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
    );

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // 開啟時把焦點移到視窗裡（右上的關閉鈕），關閉時還給開啟前的元素（觸發的「敵軍預覽」按鈕）；
  // 焦點被移到視窗外時（例如輔助工具）拉回視窗裡
  useEffect(() => {
    const prev =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus();
    const onFocusIn = (e: FocusEvent) => {
      const panel = panelRef.current;
      if (panel && e.target instanceof Node && !panel.contains(e.target)) {
        closeRef.current?.focus();
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      if (prev && prev.isConnected) prev.focus();
    };
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      // 只關閉這個預覽：不讓 Esc 再傳到後面的視窗
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const inside = !!active && panelRef.current.contains(active);
    if (e.shiftKey && (active === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className={`${styles.modalBackdrop} ${styles.enemyPreviewBackdrop}`}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      data-testid="enemy-preview"
    >
      <div
        ref={panelRef}
        className={styles.modalPanel}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label={`敵軍預覽：${map.name}`}
        tabIndex={-1}
      >
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>敵軍預覽｜{map.name}</span>
          {locked && <span className={styles.previewBadge}>鎖定</span>}
          <button
            ref={closeRef}
            className={styles.modalClose}
            onClick={onClose}
            aria-label="關閉敵軍預覽"
            data-testid="enemy-preview-close"
          >
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.previewSummary} data-testid="preview-summary">
            <div>
              共 {preview.waves.length} 波
              {preview.waves.length > 0 &&
                (preview.total !== null
                  ? `，全關 ${preview.total} 隻敵人`
                  : "，全關數量無法確定（有資料不完整的波次）")}
            </div>
            <div>
              路線：
              {preview.pathIds.length > 0
                ? preview.pathIds.join("、")
                : "沒有可用的路線"}
            </div>
            {locked && (
              <div className={styles.previewNote}>
                這一關尚未解鎖：只能查看敵軍，不能出征。
              </div>
            )}
            {preview.problems.map((p) => (
              <div key={p} className={styles.previewNote}>
                資料不完整：{p}
              </div>
            ))}
            <div className={styles.previewHint}>
              只列出關卡設定裡有的資料；移動速度是設定值（數字越大越快）。
            </div>
            {preview.flying && (
              <div
                className={styles.previewFlyingNote}
                data-testid="preview-flying-note"
              >
                這一關有飛行敵人（標示 ✈ 飛行）。{FLYING_RULE_TEXT}
              </div>
            )}
            <StageAirReadinessNote readiness={air} variant="panel" />
          </div>

          {preview.waves.map((w) => (
            <WaveBlock
              key={w.wave}
              wave={w}
              open={open.includes(w.wave)}
              onToggle={() => toggle(w.wave)}
            />
          ))}

          <button
            className={`${styles.btnOutline} w-100 mt-2`}
            onClick={onClose}
            data-testid="enemy-preview-close-bottom"
          >
            關閉
          </button>
        </div>
      </div>
    </div>,
    document.getElementsByClassName(styles.gameBody)[0] ?? document.body
  );
}

function waveStatus(w: PreviewWave): string {
  if (w.missing) return "沒有資料";
  if (w.rejected) return "遊戲會拒絕這一波";
  if (w.total === null) return "數量無法確定";
  return `${w.total} 隻`;
}

function WaveBlock({
  wave: w,
  open,
  onToggle,
}: {
  wave: PreviewWave;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={styles.previewWave} data-testid={`preview-wave-${w.wave}`}>
      <button
        className={styles.previewWaveHeader}
        onClick={onToggle}
        aria-expanded={open}
        data-testid={`preview-wave-toggle-${w.wave}`}
      >
        <span>
          {open ? "▾" : "▸"} 第 {w.wave} 波
        </span>
        <span>
          {w.incomplete && (
            <span className={styles.previewBadge}>資料不完整</span>
          )}{" "}
          {waveStatus(w)}
        </span>
      </button>
      {open && (
        <div className={styles.previewWaveBody}>
          {w.missing && (
            <div className={styles.previewNote}>
              關卡資料沒有第 {w.wave} 波：遊戲打到這一波會拒絕開始。
            </div>
          )}
          {!w.missing && w.rejected && (
            <div className={styles.previewNote}>
              這一波沒有可以出兵的敵人組：遊戲會拒絕開始這一波。
            </div>
          )}
          {w.groups.map((g) => (
            <GroupRow key={g.index} group={g} />
          ))}
          {w.blankRows > 0 && (
            <div className={styles.previewHint}>
              另有 {w.blankRows} 列空白資料（遊戲略過，不是敵人）。
            </div>
          )}
          {w.duplicates > 0 && (
            <div className={styles.previewNote}>
              第 {w.wave} 波另有 {w.duplicates} 筆重複的資料，遊戲只使用第一筆。
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupRow({ group: g }: { group: PreviewGroup }) {
  const countText =
    g.outcome === "spawn"
      ? `×${g.count}`
      : g.outcome === "skip"
        ? "不會出兵"
        : "數量無法確定";
  return (
    <div
      className={styles.previewGroup}
      data-testid="preview-group"
      data-movement={g.movement?.value ?? ""}
    >
      <Row className="g-1 align-items-center">
        <Col xs={12} sm={7}>
          <span className={styles.previewGroupIndex}>第 {g.index} 組</span>{" "}
          <strong>{g.name ?? `未知敵人（${g.enemyId}）`}</strong> {countText}
          {g.movement?.value === "flying" && (
            <>
              {" "}
              <span
                className={styles.previewFlying}
                data-testid="preview-flying"
              >
                ✈ 飛行
              </span>
            </>
          )}
        </Col>
        <Col xs={12} sm={5} className="text-sm-end">
          路線 {g.path}
        </Col>
        <Col xs={12} className={styles.previewStats}>
          血量 {g.hp ?? "未提供"}｜移動速度 {g.speed ?? "未提供"}｜每隻間隔{" "}
          {g.interval === null ? "未提供" : `${g.interval} 秒`}
        </Col>
        {g.notes.map((n) => (
          <Col xs={12} key={n} className={styles.previewNote}>
            {n}
          </Col>
        ))}
      </Row>
    </div>
  );
}
