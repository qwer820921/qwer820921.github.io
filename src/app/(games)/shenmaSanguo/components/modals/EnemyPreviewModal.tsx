"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Row, Col } from "react-bootstrap";
import { EnemyConfig, HeroConfig, MapConfig, TeamSlot } from "../../types";
import { buildStagePreview, PreviewWave } from "../../utils/stagePreview";
import {
  CompositionRow,
  CompositionSort,
  RouteComposition,
  StageComposition,
  WaveRouteView,
  filterCompositionRows,
  routeComposition,
  sortCompositionRows,
  stageComposition,
  waveListText,
  waveRouteView,
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
 * 多條路線時組成可以依路線查看（routeComposition）：選的路線是這裡持有的同一個狀態，「路線預覽」的「顯示路線」也是它，
 * 兩邊不會各選各的；設定更新後選的路線不在了就回到全部。組成可以改依已確認隻數或已確認出兵的波數由多到少排列（sortCompositionRows，預設是首次出現），
 * 只是這個視窗暫時的顯示：換路線保留、每次都用最新的列重新排，關閉預覽後回到預設。
 * 組成的每一列可以前往它在目前範圍（全關或選的路線）首次已確認出兵的波次（列的 firstWave），沿用波次導覽的前往：
 * 只展開那一波、同步導覽的選擇與說明、捲到並聚焦那一波的標題；不換關、不改路線與排列。
 * 每一列也可以展開這個範圍逐波已確認的隻數（列的 perWave，預設收合）：只是顯示，不改列的合計、首次出兵、排列、路線與波次的展開；
 * 換路線或設定更新後不在的列關掉，關閉預覽後全部收合。組成可以搜尋敵人名稱或 ID：只篩選顯示的列並另寫小計，
 * 換路線、排列、收起都保留，關閉預覽後回到空白；被搜尋藏起的列也關掉逐波隻數。逐波內容也跟著選的路線（waveRouteView）：選了路線時每一波只列那條路線的組
 * （原本的組序）並寫明那條路線已確認的隻數與組數，其他路線的資料問題另列「全波資料提醒」；波次標題、波次導覽與出兵節奏仍是整波。
 * 戰場內的「下一波」不帶這個選擇。
 * 「路線預覽」畫關卡設定的路線格子（StageRoutePreview，預設收起）；逐波內容另列「設定出兵節奏」（utils/spawnRhythm）；
 * 逐波區上方的波次導覽（PreviewWaveNav）
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
  // 依路線查看組成與路線預覽共用的選擇（null＝全部）；只能是這份設定的路線，設定更新後不在了就回到全部
  const [route, setRoute] = useState<string | null>(null);
  const routeValid = route !== null && preview.pathIds.includes(route);
  if (route !== null && !routeValid) setRoute(null);
  const routeComp = useMemo(
    () =>
      routeValid && route !== null
        ? routeComposition(preview, route, composition)
        : null,
    [preview, route, routeValid, composition]
  );
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

          <CompositionBlock
            composition={composition}
            routeIds={preview.pathIds}
            route={routeComp ? route : null}
            routeComp={routeComp}
            onRouteChange={setRoute}
            onGotoWave={(n, label) =>
              gotoWave(n, `已前往第 ${n} 波（${label}）`)
            }
          />

          <StageRoutePreview
            map={map}
            preview={preview}
            selected={routeComp ? route : null}
            onSelect={setRoute}
          />

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

          {routeComp && route !== null && preview.waves.length > 0 && (
            <div
              className={styles.previewHint}
              data-testid="preview-wave-route-scope"
            >
              逐波內容只列路線 {route}{" "}
              的組（和「敵軍組成」「路線預覽」是同一個選擇）；波次標題、波次導覽與設定出兵節奏仍是全波。
            </div>
          )}

          {preview.waves.map((w) => (
            <WaveBlock
              key={w.wave}
              wave={w}
              open={open.includes(w.wave)}
              onToggle={() => toggle(w.wave)}
              route={
                routeComp && route !== null ? waveRouteView(w, route) : null
              }
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

/**
 * 敵軍組成：依敵人合計已確認會出兵的組（預設展開，可以收起）。
 * 多條路線時可以選一條路線，只看那條路線上的組成（和路線預覽共用同一個選擇）；全部路線時是原本的全關總覽。
 * 排列：首次出現（預設，原本的順序）、已確認隻數由多到少（同數量維持首次出現的順序）或已確認出兵的波數由多到少（同波數維持首次出現的順序）；
 * 只改顯示順序，數量、說明與資料問題不變。
 * 每一列可以展開目前範圍逐波已確認的隻數（預設收合）：沒有已確認出兵的波次不列、不補 0。
 * 搜尋敵人名稱或 ID（filterCompositionRows）：只篩選目前範圍已排列的列，另寫符合的種數與已確認隻數的小計；
 * 組成的標題、說明、資料問題與每一列的內容都不變，沒有符合時只說目前範圍沒有符合的已確認敵人
 */
function CompositionBlock({
  composition: c,
  routeIds,
  route,
  routeComp: rc,
  onRouteChange,
  onGotoWave,
}: {
  composition: StageComposition;
  routeIds: string[];
  /** 選的路線（null＝全部） */
  route: string | null;
  routeComp: RouteComposition | null;
  onRouteChange: (route: string | null) => void;
  /** 前往某一波（第二個參數是狀態說明裡的說明） */
  onGotoWave: (wave: number, label: string) => void;
}) {
  const [open, setOpen] = useState(true);
  // 排列方式：收起再展開、換路線都保留；關閉預覽（卸載）後回到首次出現
  const [sort, setSort] = useState<CompositionSort>("first");
  // 展開逐波隻數的列（enemy_id，預設收合）：關閉預覽（卸載）後全部收合
  const [detailOpen, setDetailOpen] = useState<string[]>([]);
  // 搜尋敵人名稱或 ID：換路線、排列、收起再展開都保留，關閉預覽（卸載）後回到空白；只篩選顯示的列
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyId = useId();
  const selectId = useId();
  const sortId = useId();
  const searchId = useId();
  const detailBaseId = useId();
  // 組成只有一種敵人時不顯示排列與搜尋，這時照首次出現、也不篩選：看不到的選擇不影響顯示（選擇本身保留）
  const searchable = c.rows.length > 1;
  const shownSort: CompositionSort = searchable ? sort : "first";
  const q = searchable ? query.trim() : "";
  // 名稱相同但 enemy_id 不同的敵人分開列，並附上 id 才分得出來
  // 依路線查看時每一列另有出兵的波次（waves）；全部路線時沒有
  const rows: (CompositionRow & { waves?: number[] })[] = sortCompositionRows(
    rc ? rc.rows : c.rows,
    shownSort
  );
  // 目前範圍（已排列）裡符合搜尋的列：不重算，合計、首次與逐波都是原本的列
  const shown = filterCompositionRows(rows, q);
  const orderText =
    shownSort === "count"
      ? "依已確認隻數由多到少，同數量依第一次出現"
      : shownSort === "waves"
        ? "依已確認出兵的波數由多到少（這個範圍裡已確認出兵的波），同波數依第一次出現"
        : "依第一次出現的順序";
  // 資料不完整的說明原本沒有寫順序：改依隻數或波數排列時另外註明
  const sortNote =
    shownSort === "count"
      ? "依已確認隻數由多到少排列。"
      : shownSort === "waves"
        ? "依已確認出兵的波數由多到少排列（只算已確認的波）。"
        : "";
  const names = rows.map((r) => r.name);
  const sameName = (n: string) => names.indexOf(n) !== names.lastIndexOf(n);
  // 換路線、搜尋或設定更新後不在畫面上的列：關掉它的逐波隻數（之後再出現也是收合）
  const keptDetail = detailOpen.filter((id) =>
    shown.some((r) => r.enemyId === id)
  );
  if (keptDetail.length !== detailOpen.length) setDetailOpen(keptDetail);
  const toggleDetail = (id: string) =>
    setDetailOpen((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  const confirmed = rc ? rc.confirmed : c.confirmed;
  const complete = rc ? rc.complete : c.complete;
  const count =
    rows.length === 0
      ? "沒有可確認的出兵"
      : complete
        ? `共 ${confirmed} 隻`
        : `已確認 ${confirmed} 隻`;
  const headline = rc ? `${rc.pathId}：${count}` : count;
  const gaps = rc ? rc.gaps : c.gaps;
  const unknownIds = rc ? rc.unknownIds : c.unknownIds;
  return (
    <div
      className={styles.previewWave}
      data-testid="preview-composition"
      data-complete={String(complete)}
      data-route={rc ? rc.pathId : ""}
      data-sort={shownSort}
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
          {(routeIds.length > 1 || c.rows.length > 1) && (
            <Row className="g-2 mb-2">
              {routeIds.length > 1 && (
                <Col xs={12} sm={7}>
                  <label htmlFor={selectId} className={styles.heroFilterLabel}>
                    依路線查看
                  </label>
                  <select
                    id={selectId}
                    className={`form-select form-select-sm ${styles.heroSortField}`}
                    value={route === null ? "" : `route:${route}`}
                    onChange={(e) =>
                      onRouteChange(
                        e.target.value === ""
                          ? null
                          : e.target.value.slice("route:".length)
                      )
                    }
                    data-testid="preview-composition-route"
                  >
                    <option value="">全部路線（{routeIds.length} 條）</option>
                    {routeIds.map((id) => (
                      <option key={id} value={`route:${id}`}>
                        {id}
                      </option>
                    ))}
                  </select>
                </Col>
              )}
              {c.rows.length > 1 && (
                <Col xs={12} sm={5}>
                  <label htmlFor={sortId} className={styles.heroFilterLabel}>
                    排列
                  </label>
                  <select
                    id={sortId}
                    className={`form-select form-select-sm ${styles.heroSortField}`}
                    value={sort}
                    onChange={(e) => setSort(e.target.value as CompositionSort)}
                    data-testid="preview-composition-sort"
                  >
                    <option value="first">首次出現</option>
                    <option value="count">已確認隻數（多→少）</option>
                    <option value="waves">已確認出現波數（多→少）</option>
                  </select>
                </Col>
              )}
              {routeIds.length > 1 && (
                <Col xs={12} className={styles.previewHint}>
                  和路線預覽的「顯示路線」是同一個選擇。
                </Col>
              )}
              {searchable && (
                <Col xs={12}>
                  <label htmlFor={searchId} className={styles.heroFilterLabel}>
                    搜尋敵人名稱或 ID
                  </label>
                  <Row className="g-1">
                    <Col>
                      <input
                        id={searchId}
                        ref={searchRef}
                        type="text"
                        className={`form-control form-control-sm ${styles.heroSearchInput}`}
                        placeholder="名稱或 id"
                        autoComplete="off"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        data-testid="preview-composition-search"
                      />
                    </Col>
                    <Col xs="auto">
                      <button
                        type="button"
                        className={`btn btn-sm ${styles.heroClearBtn}`}
                        onClick={() => {
                          setQuery("");
                          // 清除鈕會變成停用，焦點交回搜尋框
                          searchRef.current?.focus();
                        }}
                        disabled={query === ""}
                        data-testid="preview-composition-search-clear"
                      >
                        清除
                      </button>
                    </Col>
                  </Row>
                </Col>
              )}
            </Row>
          )}
          <div
            className={styles.previewHint}
            data-testid="preview-composition-summary"
          >
            {rc
              ? rows.length === 0
                ? `路線 ${rc.pathId} 沒有可以確認會出兵的組：不代表這條路線沒有敵軍。`
                : rc.complete
                  ? `路線 ${rc.pathId} 共 ${rc.confirmed} 隻、${rows.length} 種敵人（全關 ${c.confirmed} 隻中的這條路線；${orderText}），出兵在${waveListText(rc.waves)}。`
                  : `路線 ${rc.pathId} 僅已確認組：${rc.confirmed} 隻、${rows.length} 種敵人，出兵在${waveListText(rc.waves)}；尚有資料問題，非這條路線的全部。${sortNote}`
              : rows.length === 0
                ? "沒有可以確認會出兵的組：不代表這一關沒有敵軍，也不代表可以開戰。"
                : c.complete
                  ? `全關共 ${c.confirmed} 隻、${c.rows.length} 種敵人（${orderText}）。`
                  : `僅已確認組：共 ${c.confirmed} 隻、${c.rows.length} 種敵人；尚有資料問題，非全關總數。${sortNote}`}
          </div>
          {gaps.map((g) => (
            <div
              key={g}
              className={styles.previewNote}
              data-testid="preview-composition-gap"
            >
              資料問題：{g}
            </div>
          ))}
          {unknownIds.length > 0 && (
            <div
              className={styles.previewNote}
              data-testid="preview-composition-unknown"
            >
              資料問題：找不到敵人設定「{unknownIds.join("」、「")}
              」，遊戲會略過，不列入組成。
            </div>
          )}
          {rc && rc.skipped > 0 && (
            <div
              className={styles.previewHint}
              data-testid="preview-composition-route-skipped"
            >
              這條路線另有 {rc.skipped} 組遊戲會略過、不列入（原因見逐波內容）。
            </div>
          )}
          {q !== "" && (
            <div
              className={styles.previewHint}
              aria-live="polite"
              data-testid="preview-composition-search-summary"
            >
              {shown.length > 0
                ? `符合搜尋「${q}」${shown.length} 種，已確認 ${shown.reduce((s, r) => s + r.count, 0)} 隻（只是下面列出的列的小計，不是${rc ? `路線 ${rc.pathId} ` : "全關"}的總數）。`
                : `${rc ? `路線 ${rc.pathId} ` : "全關"}沒有符合搜尋「${q}」的已確認敵人${complete ? "" : "（只比對已確認的出兵；有資料問題的部分可能還有）"}。`}
            </div>
          )}
          {shown.map((r) => (
            <div
              key={r.enemyId}
              className={styles.previewGroup}
              data-testid="preview-composition-row"
              data-enemy-id={r.enemyId}
              data-count={r.count}
              data-movement={r.movement?.value ?? ""}
              data-waves={r.waves ? r.waves.join(",") : ""}
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
                {r.waves && (
                  <Col xs={12} className={styles.previewStats}>
                    {waveListText(r.waves)}
                  </Col>
                )}
                <Col xs="auto">
                  <button
                    type="button"
                    className={`btn btn-sm ${styles.heroClearBtn}`}
                    onClick={() =>
                      onGotoWave(
                        r.firstWave,
                        `${r.name}${sameName(r.name) ? `（${r.enemyId}）` : ""}${complete ? "的首次出兵" : "已確認的首次出兵"}`
                      )
                    }
                    aria-label={`前往${r.name}${sameName(r.name) ? `（${r.enemyId}）` : ""}${rc ? `在路線 ${rc.pathId} ` : ""}${complete ? "首次出兵" : "已確認的首次出兵"}的第 ${r.firstWave} 波`}
                    data-testid="preview-composition-goto"
                    data-wave={r.firstWave}
                  >
                    {complete ? "前往首次出兵" : "前往已確認的首次出兵"}（第{" "}
                    {r.firstWave} 波）
                  </button>
                </Col>
                <Col xs="auto">
                  <button
                    type="button"
                    className={`btn btn-sm ${styles.heroClearBtn}`}
                    onClick={() => toggleDetail(r.enemyId)}
                    aria-expanded={detailOpen.includes(r.enemyId)}
                    aria-controls={`${detailBaseId}-${encodeURIComponent(r.enemyId)}`}
                    aria-label={`${r.name}${sameName(r.name) ? `（${r.enemyId}）` : ""}${rc ? `在路線 ${rc.pathId} ` : ""}的逐波已確認隻數（${r.perWave.length} 波）`}
                    data-testid="preview-composition-detail-toggle"
                  >
                    {detailOpen.includes(r.enemyId) ? "▾" : "▸"} 逐波隻數（
                    {r.perWave.length} 波）
                  </button>
                </Col>
                {detailOpen.includes(r.enemyId) && (
                  <Col
                    xs={12}
                    id={`${detailBaseId}-${encodeURIComponent(r.enemyId)}`}
                    className={styles.previewStats}
                    data-testid="preview-composition-detail"
                  >
                    <div>
                      {rc ? `路線 ${rc.pathId} ` : "全關"}逐波已確認隻數
                      {complete
                        ? "："
                        : "（只列已確認的出兵；有資料問題的波次可能還有這個敵人）："}
                    </div>
                    <Row className="g-1">
                      {r.perWave.map((x) => (
                        <Col
                          key={x.wave}
                          xs={6}
                          sm={4}
                          data-testid="preview-composition-detail-wave"
                          data-wave={x.wave}
                          data-count={x.count}
                        >
                          第 {x.wave} 波 ×{x.count}
                        </Col>
                      ))}
                    </Row>
                  </Col>
                )}
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
  route,
}: {
  wave: PreviewWave;
  open: boolean;
  onToggle: () => void;
  /** 依路線查看時這一波在那條路線的組（null＝全部路線） */
  route: WaveRouteView | null;
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
      {open && <PreviewWaveBody wave={w} showRhythm route={route} />}
    </div>
  );
}
