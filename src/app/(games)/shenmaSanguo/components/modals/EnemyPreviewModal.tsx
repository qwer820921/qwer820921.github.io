"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Row, Col } from "react-bootstrap";
import { EnemyConfig, HeroConfig, MapConfig, TeamSlot } from "../../types";
import { buildStagePreview, PreviewWave } from "../../utils/stagePreview";
import {
  StageComposition,
  stageComposition,
} from "../../utils/stageComposition";
import {
  keepExistingWaves,
  nextProblemWave,
  problemWaves,
} from "../../utils/waveNav";
import { FLYING_RULE_TEXT } from "../../utils/antiAir";
import { stageAirReadiness } from "../../utils/stageAirReadiness";
import {
  stageDataProblem,
  stageDataProblemText,
} from "../../utils/stagePlayability";
import StageAirReadinessNote from "../StageAirReadinessNote";
import StageRoutePreview from "../StageRoutePreview";
import PreviewWaveNav from "../PreviewWaveNav";
import { PreviewWaveBody, previewWaveStatus } from "../PreviewWaveDetail";
import { useDialogFocus } from "../useDialogFocus";
import styles from "../../styles/shenmaSanguo.module.css";

interface Props {
  map: MapConfig;
  enemies: EnemyConfig[];
  /** 目前上陣的隊伍與武將設定：出征前的對空準備提醒用（不改隊伍、不寫入） */
  team: TeamSlot[] | null | undefined;
  heroesConfig: HeroConfig[] | null | undefined;
  /** 關卡尚未解鎖（只顯示資訊，不改變解鎖規則） */
  locked: boolean;
  onClose: () => void;
  /**
   * 關閉時開啟它的「敵軍預覽」按鈕已經不在畫面上（那張卡片被篩選藏起，或這一關已從設定移除）：焦點改交給這裡回傳的元素
   * （關卡的搜尋框）
   */
  fallbackFocus?: () => HTMLElement | null;
}

/**
 * 關卡敵軍預覽（唯讀）：主頁的「關卡」視窗與獨立的關卡頁共用。
 * 只讀已載入的靜態設定（utils/stagePreview），沒有出征、切換關卡或任何寫入；
 * 「敵軍組成」依敵人合計已確認會出兵的組（utils/stageComposition，可以收起），全關總數與逐波內容照舊；
 * 「路線預覽」畫關卡設定的路線格子（StageRoutePreview，預設收起）；逐波區上方的波次導覽（PreviewWaveNav）
 * 只改展開哪幾波與焦點（全部展開／收合、前往某一波、下一個資料問題），波次一律用編號識別，設定更新後不存在的波次移除；
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
  fallbackFocus,
}: Props) {
  const preview = useMemo(
    () => buildStagePreview(map, enemies),
    [map, enemies]
  );
  const composition = useMemo(() => stageComposition(preview), [preview]);
  const air = useMemo(
    () => stageAirReadiness(map, enemies, team, heroesConfig),
    [map, enemies, team, heroesConfig]
  );
  // 關卡資料未完成（沒有路線或沒有波次）：尚未開放，不能出征（規則見 utils/stagePlayability）
  const dataProblem = useMemo(() => stageDataProblem(map), [map]);
  const [open, setOpen] = useState<number[]>([1]);
  const toggle = (n: number) =>
    setOpen((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
    );
  // 波次導覽：選單選的波次（也是「下一個資料問題」的起點）與最後一次導覽的說明
  const [navWave, setNavWave] = useState<number | null>(null);
  const [navStatus, setNavStatus] = useState<string | null>(null);
  // 設定更新後只保留還存在的波次（依編號，不依索引）
  const keptOpen = keepExistingWaves(open, preview.waves);
  if (keptOpen !== open) setOpen(keptOpen);
  if (navWave !== null && !preview.waves.some((w) => w.wave === navWave)) {
    setNavWave(null);
    setNavStatus(null);
  }

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const navSelectRef = useRef<HTMLSelectElement>(null);
  // 前往某一波：等只展開那一波的畫面更新後，捲到它的標題並把焦點交給它的按鈕
  const pendingWaveRef = useRef<number | null>(null);
  useEffect(() => {
    const n = pendingWaveRef.current;
    if (n === null) return;
    pendingWaveRef.current = null;
    const btn = panelRef.current?.querySelector<HTMLButtonElement>(
      `[data-testid="preview-wave-toggle-${n}"]`
    );
    if (!btn) return;
    btn.scrollIntoView({ block: "start" });
    btn.focus({ preventScroll: true });
  });
  const gotoWave = (n: number, message: string) => {
    pendingWaveRef.current = n;
    setOpen([n]);
    setNavWave(n);
    setNavStatus(message);
  };
  const nextProblem = () => {
    const n = nextProblemWave(preview.waves, navWave);
    if (n === null) return;
    const list = problemWaves(preview.waves);
    gotoWave(
      n,
      `已前往第 ${n} 波（資料問題 ${list.indexOf(n) + 1}／${list.length}）`
    );
  };
  // 設定更新後焦點所在的波次（或導覽按鈕）消失、焦點掉到頁面本身時，交給波次選單
  useEffect(() => {
    const a = document.activeElement;
    if (!a || a === document.body) navSelectRef.current?.focus();
  }, [preview.waves]);
  // 開啟時焦點移到右上的關閉鈕，關閉時還給觸發的「敵軍預覽」按鈕（已不在畫面上時交給 fallbackFocus）；
  // Esc 只關閉這個預覽、Tab 只在視窗內循環
  const onKeyDown = useDialogFocus(panelRef, closeRef, onClose, {
    fallbackFocus: () => fallbackFocus?.() ?? null,
  });

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
          {dataProblem ? (
            <span className={styles.previewBadge}>尚未開放</span>
          ) : (
            locked && <span className={styles.previewBadge}>鎖定</span>
          )}
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
            {dataProblem && (
              <div
                className={styles.previewNote}
                data-testid="preview-stage-unavailable"
              >
                這一關尚未開放（{stageDataProblemText(dataProblem)}
                ）：只能查看，不能出征。
              </div>
            )}
            {locked && !dataProblem && (
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
              對武將攻擊力是被武將擋住時打武將的數值（再依防禦減少），不是城池傷害（抵達城池一律扣
              1）。
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

          <CompositionBlock composition={composition} />

          <StageRoutePreview map={map} preview={preview} />

          {preview.waves.length > 0 && (
            <PreviewWaveNav
              waves={preview.waves}
              target={navWave}
              onTargetChange={setNavWave}
              onGoto={(n) => gotoWave(n, `已前往第 ${n} 波`)}
              onNextProblem={nextProblem}
              onExpandAll={() => {
                setOpen(preview.waves.map((w) => w.wave));
                setNavStatus("已展開全部波次");
              }}
              onCollapseAll={() => {
                setOpen([]);
                setNavStatus("已收合全部波次");
              }}
              status={navStatus}
              selectRef={navSelectRef}
            />
          )}

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

/** 敵軍組成：依敵人合計已確認會出兵的組（預設展開，可以收起） */
function CompositionBlock({
  composition: c,
}: {
  composition: StageComposition;
}) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  // 名稱相同但 enemy_id 不同的敵人分開列，並附上 id 才分得出來
  const names = c.rows.map((r) => r.name);
  const sameName = (n: string) => names.indexOf(n) !== names.lastIndexOf(n);
  const headline =
    c.rows.length === 0
      ? "沒有可確認的出兵"
      : c.complete
        ? `共 ${c.confirmed} 隻`
        : `已確認 ${c.confirmed} 隻`;
  return (
    <div
      className={styles.previewWave}
      data-testid="preview-composition"
      data-complete={String(c.complete)}
    >
      <button
        className={styles.previewWaveHeader}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        data-testid="preview-composition-toggle"
      >
        <span>{open ? "▾" : "▸"} 敵軍組成</span>
        <span>{headline}</span>
      </button>
      {open && (
        <div id={bodyId} className={styles.previewWaveBody}>
          <div
            className={styles.previewHint}
            data-testid="preview-composition-summary"
          >
            {c.rows.length === 0
              ? "沒有可以確認會出兵的組：不代表這一關沒有敵軍，也不代表可以開戰。"
              : c.complete
                ? `全關共 ${c.confirmed} 隻、${c.rows.length} 種敵人（依第一次出現的順序）。`
                : `僅已確認組：共 ${c.confirmed} 隻、${c.rows.length} 種敵人；尚有資料問題，非全關總數。`}
          </div>
          {c.gaps.map((g) => (
            <div
              key={g}
              className={styles.previewNote}
              data-testid="preview-composition-gap"
            >
              資料問題：{g}
            </div>
          ))}
          {c.unknownIds.length > 0 && (
            <div
              className={styles.previewNote}
              data-testid="preview-composition-unknown"
            >
              資料問題：找不到敵人設定「{c.unknownIds.join("」、「")}
              」，遊戲會略過，不列入組成。
            </div>
          )}
          {c.rows.map((r) => (
            <div
              key={r.enemyId}
              className={styles.previewGroup}
              data-testid="preview-composition-row"
              data-enemy-id={r.enemyId}
              data-count={r.count}
              data-movement={r.movement?.value ?? ""}
            >
              <Row className="g-1 align-items-center">
                <Col xs={8} className={styles.previewGroupMain}>
                  <strong>{r.name}</strong>
                  {sameName(r.name) && (
                    <span className={styles.previewGroupIndex}>
                      （{r.enemyId}）
                    </span>
                  )}{" "}
                  {r.movement?.value === "flying" ? (
                    <span className={styles.previewFlying}>✈ 飛行</span>
                  ) : (
                    <span className={styles.previewGround}>地面</span>
                  )}
                </Col>
                <Col xs={4} className="text-end">
                  ×{r.count}
                </Col>
              </Row>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
          {previewWaveStatus(w)}
        </span>
      </button>
      {open && <PreviewWaveBody wave={w} />}
    </div>
  );
}
