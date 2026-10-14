"use client";

import { useId, useMemo, useState } from "react";
import { Row, Col } from "react-bootstrap";
import { MapConfig } from "../types";
import { StagePreview } from "../utils/stagePreview";
import {
  Cell,
  RouteLine,
  flyingRouteIds,
  routeProblems,
  routeSummary,
  stageRouteMap,
} from "../utils/stageRouteMap";
import styles from "../styles/shenmaSanguo.module.css";

// 路線的顏色與線型一起換（不能只靠顏色分辨）；圖例另外寫路線 ID
const COLORS = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#9333ea",
  "#d97706",
  "#0891b2",
];
const DASHES = ["", "0.5 0.25", "0.14 0.22", "0.6 0.2 0.14 0.2"];
const lineStyle = (i: number) => ({
  color: COLORS[i % COLORS.length],
  dash: DASHES[i % DASHES.length],
});
const center = (p: Cell) => `${p[0] + 0.5},${p[1] + 0.5}`;

/**
 * 敵軍預覽的「路線預覽」（唯讀，預設收起）：依關卡設定的地圖尺寸畫格子與每條路線的路點折線，標出路線起點「起」與終點「終」。
 * 規則見 utils/stageRouteMap：路點只用 stagePathPoints、不補造尺寸或路點、無法判讀與超出地圖的路點會切斷折線。
 * 多條路線時可以選「全部」或單一路線（預設全部、順序和設定相同）。選的路線由敵軍預覽持有（selected／onSelect），
 * 和「敵軍組成」依路線查看是同一個選擇；設定更新後選的路線不在了，由敵軍預覽改回全部。
 * 只讀設定：不能拖曳或編輯、不送任何請求、不改戰場；有飛行敵人的路線另外說明飛行是直線飛到終點
 */
export default function StageRoutePreview({
  map,
  preview,
  selected,
  onSelect,
}: {
  map: MapConfig;
  preview: StagePreview;
  /** 選的路線（null＝全部）；必須是 preview.pathIds 裡的路線 */
  selected: string | null;
  onSelect: (route: string | null) => void;
}) {
  const routeMap = useMemo(() => stageRouteMap(map.path_json), [map.path_json]);
  const flying = useMemo(() => new Set(flyingRouteIds(preview)), [preview]);
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const selectId = useId();
  const routes = routeMap.routes;
  const picked =
    selected === null ? [] : routes.filter((r) => r.id === selected);
  // 選的路線不在這份設定裡（設定剛更新、敵軍預覽還沒改回全部）時照全部顯示
  const shown = picked.length > 0 ? picked : routes;
  const flyingShown = shown.filter((r) => flying.has(r.id)).map((r) => r.id);

  return (
    <div
      className={styles.previewWave}
      data-testid="preview-route"
      data-drawable={String(routes.length > 0 && !routeMap.sizeProblem)}
    >
      <button
        type="button"
        className={styles.previewWaveHeader}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        data-testid="preview-route-toggle"
      >
        <span>{open ? "▾" : "▸"} 路線預覽</span>
        <span>
          {routes.length === 0 ? "無法預覽" : `${routes.length} 條路線`}
        </span>
      </button>
      {open && (
        <div id={bodyId} className={styles.previewWaveBody}>
          {routes.length === 0 ? (
            <div
              className={styles.previewNote}
              data-testid="preview-route-empty"
            >
              關卡設定沒有可用的路線，無法預覽路線。這不代表這一關沒有敵軍，也不代表可以出征。
            </div>
          ) : (
            <>
              {routes.length > 1 && (
                <Row className="g-2 mb-2">
                  <Col xs={12} sm={7}>
                    <label
                      htmlFor={selectId}
                      className={styles.heroFilterLabel}
                    >
                      顯示路線
                    </label>
                    <select
                      id={selectId}
                      className={`form-select form-select-sm ${styles.heroSortField}`}
                      value={picked.length > 0 ? `route:${selected}` : ""}
                      onChange={(e) =>
                        onSelect(
                          e.target.value === ""
                            ? null
                            : e.target.value.slice("route:".length)
                        )
                      }
                      data-testid="preview-route-select"
                    >
                      <option value="">全部路線（{routes.length} 條）</option>
                      {routes.map((r) => (
                        <option key={r.id} value={`route:${r.id}`}>
                          {r.id}
                        </option>
                      ))}
                    </select>
                  </Col>
                </Row>
              )}
              {routeMap.sizeProblem ||
              routeMap.cols === null ||
              routeMap.rows === null ? (
                <div
                  className={styles.previewNote}
                  data-testid="preview-route-size"
                >
                  {routeMap.sizeProblem}：以下只列路線的文字說明。
                </div>
              ) : (
                <RouteSvg
                  cols={routeMap.cols}
                  rows={routeMap.rows}
                  routes={routes}
                  shown={shown}
                />
              )}
              <ul
                className={styles.routeLegend}
                aria-label="路線說明"
                data-testid="preview-route-legend"
              >
                {shown.map((r) => (
                  <RouteLegendItem
                    key={r.id}
                    route={r}
                    index={routes.indexOf(r)}
                    problems={routeProblems(r, routeMap)}
                    flying={flying.has(r.id)}
                  />
                ))}
              </ul>
              <div className={styles.previewHint}>
                格子座標是（欄, 列），左上角是 (0,
                0)。「起」「終」是這條路線的第一個／最後一個路點，不代表所有敵人共同的出生點或城池位置。只讀關卡設定，不能在這裡編輯路線。
              </div>
              {flyingShown.length > 0 && (
                <div
                  className={styles.previewFlyingNote}
                  data-testid="preview-route-flying"
                >
                  {flyingShown.join("、")}{" "}
                  有飛行敵人：飛行敵人從路線起點直線飛到終點，不沿折線；地面敵人沿折線走。
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RouteSvg({
  cols,
  rows,
  routes,
  shown,
}: {
  cols: number;
  rows: number;
  routes: RouteLine[];
  shown: RouteLine[];
}) {
  const titleId = useId();
  const descId = useId();
  return (
    <svg
      className={styles.routeMapSvg}
      viewBox={`0 0 ${cols} ${rows}`}
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      data-testid="preview-route-svg"
      data-cols={cols}
      data-rows={rows}
    >
      <title id={titleId}>
        路線圖：{cols}×{rows} 格
      </title>
      <desc id={descId}>
        顯示 {shown.map((r) => r.id).join("、")}
        ；「起」是路線起點、「終」是路線終點。
      </desc>
      <rect
        x={0}
        y={0}
        width={cols}
        height={rows}
        className={styles.routeMapGround}
      />
      <g className={styles.routeMapGrid}>
        {Array.from({ length: cols + 1 }, (_, i) => (
          <line key={`c${i}`} x1={i} y1={0} x2={i} y2={rows} />
        ))}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <line key={`r${i}`} x1={0} y1={i} x2={cols} y2={i} />
        ))}
      </g>
      {shown.map((r) => {
        const { color, dash } = lineStyle(routes.indexOf(r));
        return (
          <g key={r.id} data-route-id={r.id} data-testid="preview-route-line">
            <title>{r.id}</title>
            {r.segments.map((s, k) =>
              s.length === 1 ? (
                <circle
                  key={k}
                  cx={s[0][0] + 0.5}
                  cy={s[0][1] + 0.5}
                  r={0.18}
                  fill={color}
                />
              ) : (
                <polyline
                  key={k}
                  points={s.map(center).join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth={0.22}
                  strokeDasharray={dash || undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )
            )}
            {r.start && (
              <Marker cell={r.start} label="起" color={color} round />
            )}
            {r.end && r.points > 1 && (
              <Marker cell={r.end} label="終" color={color} round={false} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Marker({
  cell,
  label,
  color,
  round,
}: {
  cell: Cell;
  label: string;
  color: string;
  round: boolean;
}) {
  const [x, y] = [cell[0] + 0.5, cell[1] + 0.5];
  return (
    <g data-testid={`preview-route-${round ? "start" : "end"}`}>
      {round ? (
        <circle cx={x} cy={y} r={0.42} fill={color} />
      ) : (
        <rect
          x={x - 0.42}
          y={y - 0.42}
          width={0.84}
          height={0.84}
          fill={color}
        />
      )}
      <text
        x={x}
        y={y}
        fontSize={0.56}
        textAnchor="middle"
        dominantBaseline="central"
        className={styles.routeMapMarkerText}
      >
        {label}
      </text>
    </g>
  );
}

function RouteLegendItem({
  route: r,
  index,
  problems,
  flying,
}: {
  route: RouteLine;
  index: number;
  problems: string[];
  flying: boolean;
}) {
  const { color, dash } = lineStyle(index);
  return (
    <li
      className={styles.routeLegendItem}
      data-testid="preview-route-item"
      data-route-id={r.id}
    >
      <svg
        className={styles.routeSwatch}
        viewBox="0 0 3 1"
        aria-hidden="true"
        focusable="false"
      >
        <line
          x1={0.1}
          y1={0.5}
          x2={2.9}
          y2={0.5}
          stroke={color}
          strokeWidth={0.3}
          strokeDasharray={dash || undefined}
        />
      </svg>
      <strong>{r.id}</strong>：{routeSummary(r)}
      {flying && (
        <>
          {" "}
          <span className={styles.previewFlying}>✈ 有飛行敵人</span>
        </>
      )}
      {problems.map((p) => (
        <div
          key={p}
          className={styles.previewNote}
          data-testid="preview-route-problem"
        >
          資料問題：{p}
        </div>
      ))}
    </li>
  );
}
