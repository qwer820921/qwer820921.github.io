"use client";
import React, { useState, useCallback, useRef } from "react";
import { Container } from "react-bootstrap";
import styles from "../styles/mapEditor.module.css";
import { CellType, GridCell, TileTextures, MapJson } from "../types";

type Tool = "waypoint" | "build" | "obstacle" | "erase";

const DEFAULT_COLS = 14;
const DEFAULT_ROWS = 11;
const DEFAULT_TEXTURES: TileTextures = {
  road: "tile_stone.webp",
  build: "tile_grass.webp",
  empty: "tile_empty.webp",
  base: "tile_fortress.webp",
  spawn: "tile_gate.webp",
  obstacle: "tile_dirt.webp",
};

function makeGrid(cols: number, rows: number): GridCell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ type: "empty" as CellType }))
  );
}

function cellClass(cell: GridCell, styles: Record<string, string>): string {
  if (cell.type === "obstacle") return `${styles.cell} ${styles.cellObstacle}`;
  if (cell.type === "build") return `${styles.cell} ${styles.cellBuild}`;
  if (cell.type === "road") {
    if (cell.waypointIndex === 0) return `${styles.cell} ${styles.cellSpawn}`;
    return `${styles.cell} ${styles.cellWaypoint}`;
  }
  return `${styles.cell} ${styles.cellEmpty}`;
}

function cellLabel(cell: GridCell, waypoints: [number, number][]): string {
  if (cell.type === "road" && cell.waypointIndex !== undefined) {
    if (cell.waypointIndex === 0) return "S";
    if (cell.waypointIndex === waypoints.length - 1) return "E";
    return String(cell.waypointIndex);
  }
  return "";
}

export default function MapEditorPage() {
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [colsInput, setColsInput] = useState(String(DEFAULT_COLS));
  const [rowsInput, setRowsInput] = useState(String(DEFAULT_ROWS));
  const [grid, setGrid] = useState<GridCell[][]>(() =>
    makeGrid(DEFAULT_COLS, DEFAULT_ROWS)
  );
  const [waypoints, setWaypoints] = useState<[number, number][]>([]);
  const [tool, setTool] = useState<Tool>("waypoint");
  const [textures, setTextures] = useState<TileTextures>(DEFAULT_TEXTURES);
  const [mapId, setMapId] = useState("chapter1_1");
  const [mapName, setMapName] = useState("第一關");
  const [chapter, setChapter] = useState("1");
  const [outputTab, setOutputTab] = useState<"standard" | "sheets">("standard");
  const [copied, setCopied] = useState(false);
  const isPainting = useRef(false);

  // ── 調整格子尺寸 ──
  const applySize = () => {
    const c = Math.max(1, Math.min(40, parseInt(colsInput) || cols));
    const r = Math.max(1, Math.min(40, parseInt(rowsInput) || rows));
    setCols(c);
    setRows(r);
    setGrid((prev) => {
      const next = makeGrid(c, r);
      for (let row = 0; row < Math.min(r, prev.length); row++) {
        for (let col = 0; col < Math.min(c, (prev[row] ?? []).length); col++) {
          next[row][col] = prev[row][col];
        }
      }
      return next;
    });
    setWaypoints((prev) => prev.filter(([col, row]) => col < c && row < r));
  };

  // ── 點擊格子 ──
  const applyCell = useCallback(
    (col: number, row: number) => {
      setGrid((prev) => {
        const next = prev.map((r) => r.map((c) => ({ ...c })));
        const cell = next[row][col];

        if (tool === "erase") {
          if (cell.type === "road" && cell.waypointIndex !== undefined) {
            const idx = cell.waypointIndex;
            setWaypoints((wp) => {
              const newWp = wp.filter((_, i) => i !== idx);
              // re-index remaining waypoints
              setGrid((g) => {
                const g2 = g.map((r) => r.map((c) => ({ ...c })));
                g2[row][col] = { type: "empty" };
                newWp.forEach(([wc, wr], i) => {
                  g2[wr][wc] = { type: "road", waypointIndex: i };
                });
                return g2;
              });
              return newWp;
            });
            return prev; // will be updated by nested setGrid
          }
          next[row][col] = { type: "empty" };
          return next;
        }

        if (tool === "build") {
          if (cell.type === "road") return prev; // don't overwrite road
          next[row][col] = { type: "build" };
          return next;
        }

        if (tool === "obstacle") {
          if (cell.type === "road") return prev;
          next[row][col] = { type: "obstacle" };
          return next;
        }

        if (tool === "waypoint") {
          if (cell.type === "road") return prev; // already a waypoint
          if (cell.type !== "empty") return prev; // only place on empty
          setWaypoints((wp) => {
            const newWp = [...wp, [col, row] as [number, number]];
            setGrid((g) => {
              const g2 = g.map((r) => r.map((c) => ({ ...c })));
              g2[row][col] = {
                type: "road",
                waypointIndex: newWp.length - 1,
              };
              return g2;
            });
            return newWp;
          });
          return prev; // updated in setWaypoints callback
        }

        return next;
      });
    },
    [tool]
  );

  const handleMouseDown = (col: number, row: number) => {
    isPainting.current = true;
    applyCell(col, row);
  };

  const handleMouseEnter = (col: number, row: number) => {
    if (!isPainting.current) return;
    if (tool === "build" || tool === "obstacle" || tool === "erase") {
      applyCell(col, row);
    }
  };

  const handleMouseUp = () => {
    isPainting.current = false;
  };

  // ── 清除 ──
  const handleClear = () => {
    setGrid(makeGrid(cols, rows));
    setWaypoints([]);
  };

  // ── 輸出 JSON ──
  const buildMapJson = (): MapJson => {
    const buildZones: number[][] = [];
    const obstacles: number[][] = [];
    grid.forEach((rowArr, rowIdx) => {
      rowArr.forEach((cell, colIdx) => {
        if (cell.type === "build") buildZones.push([colIdx, rowIdx]);
        if (cell.type === "obstacle") obstacles.push([colIdx, rowIdx]);
      });
    });
    const spawn = waypoints[0] ? [...waypoints[0]] : [];
    const base =
      waypoints.length > 1 ? [...waypoints[waypoints.length - 1]] : [];
    return {
      map_id: mapId,
      name: mapName,
      chapter: parseInt(chapter) || 1,
      cols,
      rows,
      waypoints: waypoints.map(([c, r]) => [c, r]),
      spawn,
      base,
      build_zones: buildZones,
      obstacles,
      tile_textures: textures,
    };
  };

  const standardJson = () => JSON.stringify(buildMapJson(), null, 2);

  const sheetsJson = () => {
    const obj = buildMapJson();
    return JSON.stringify(obj).replace(/"/g, '""');
  };

  const outputText = outputTab === "standard" ? standardJson() : sheetsJson();

  const handleCopy = () => {
    navigator.clipboard.writeText(outputText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <Container className={styles.container}>
      <div className={styles.pageTitle}>地圖編輯器</div>
      <div className={styles.pageSub}>
        繪製路徑航點 → 標記防禦區 / 障礙物 → 輸出 JSON
      </div>

      {/* ── 工具列 ── */}
      <div className={styles.toolbar}>
        <span className={styles.toolLabel}>工具：</span>
        {(
          [
            { id: "waypoint", label: "🚩 航點" },
            { id: "build", label: "🟩 防禦區" },
            { id: "obstacle", label: "⬛ 障礙物" },
            { id: "erase", label: "🧹 清除" },
          ] as { id: Tool; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            className={`${styles.toolBtn} ${tool === id ? styles.toolBtnActive : ""}`}
            onClick={() => setTool(id)}
          >
            {label}
          </button>
        ))}

        <div className={styles.toolSep} />

        <span className={styles.toolLabel}>尺寸：</span>
        <div className={styles.sizeControl}>
          <input
            className={styles.sizeInput}
            type="number"
            min={1}
            max={40}
            value={colsInput}
            onChange={(e) => setColsInput(e.target.value)}
          />
          <span className={styles.toolLabel}>×</span>
          <input
            className={styles.sizeInput}
            type="number"
            min={1}
            max={40}
            value={rowsInput}
            onChange={(e) => setRowsInput(e.target.value)}
          />
          <button className={styles.toolBtn} onClick={applySize}>
            套用
          </button>
        </div>

        <div className={styles.toolSep} />

        <button
          className={`${styles.toolBtn} ${styles.toolBtnDanger}`}
          onClick={handleClear}
        >
          全部清除
        </button>
      </div>

      {/* ── 主體 ── */}
      <div className={styles.editorBody}>
        {/* 格子 */}
        <div
          className={styles.gridWrap}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            className={styles.grid}
            style={{
              gridTemplateColumns: `repeat(${cols}, 36px)`,
              gridTemplateRows: `repeat(${rows}, 36px)`,
            }}
          >
            {grid.map((rowArr, rowIdx) =>
              rowArr.map((cell, colIdx) => (
                <div
                  key={`${colIdx}-${rowIdx}`}
                  className={cellClass(cell, styles)}
                  onMouseDown={() => handleMouseDown(colIdx, rowIdx)}
                  onMouseEnter={() => handleMouseEnter(colIdx, rowIdx)}
                  title={`[${colIdx},${rowIdx}]`}
                >
                  {cellLabel(cell, waypoints)}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 側邊面板 */}
        <div className={styles.sidePanel}>
          {/* 地圖資訊 */}
          <div className={styles.panelCard}>
            <div className={styles.panelTitle}>地圖資訊</div>
            {[
              { label: "map_id", val: mapId, set: setMapId },
              { label: "名稱", val: mapName, set: setMapName },
              { label: "章節", val: chapter, set: setChapter },
            ].map(({ label, val, set }) => (
              <div key={label} className={styles.metaRow}>
                <span className={styles.metaLabel}>{label}</span>
                <input
                  className={styles.metaInput}
                  value={val}
                  onChange={(e) => set(e.target.value)}
                />
              </div>
            ))}
          </div>

          {/* 航點清單 */}
          <div className={styles.panelCard}>
            <div className={styles.panelTitle}>
              航點（{waypoints.length} 個）
            </div>
            {waypoints.length === 0 ? (
              <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                點擊格子新增航點，第一個為出生點，最後一個為終點。
              </div>
            ) : (
              <div className={styles.waypointList}>
                {waypoints.map(([c, r], i) => (
                  <div key={i} className={styles.waypointItem}>
                    <span
                      className={`${styles.waypointBadge} ${i === 0 ? styles.waypointBadgeSpawn : i === waypoints.length - 1 ? styles.waypointBadgeBase : ""}`}
                    >
                      {i === 0 ? "S" : i === waypoints.length - 1 ? "E" : i}
                    </span>
                    [{c}, {r}]
                    {i === 0 && (
                      <span style={{ fontSize: "0.65rem", color: "#10b981" }}>
                        &nbsp;出生點
                      </span>
                    )}
                    {i === waypoints.length - 1 && waypoints.length > 1 && (
                      <span style={{ fontSize: "0.65rem", color: "#ef4444" }}>
                        &nbsp;終點
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tile Textures */}
          <div className={styles.panelCard}>
            <div className={styles.panelTitle}>Tile Textures</div>
            {(Object.keys(textures) as (keyof TileTextures)[]).map((key) => (
              <div key={key} className={styles.textureRow}>
                <span className={styles.textureLabel}>{key}</span>
                <input
                  className={styles.textureInput}
                  value={textures[key]}
                  onChange={(e) =>
                    setTextures((t) => ({ ...t, [key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 輸出區 ── */}
      <div className={styles.outputCard}>
        <div className={styles.outputTitle}>產生 JSON</div>
        <div className={styles.outputTabs}>
          <button
            className={`${styles.outputTab} ${outputTab === "standard" ? styles.outputTabActive : ""}`}
            onClick={() => setOutputTab("standard")}
          >
            標準 JSON
          </button>
          <button
            className={`${styles.outputTab} ${outputTab === "sheets" ? styles.outputTabActive : ""}`}
            onClick={() => setOutputTab("sheets")}
          >
            Google Sheets 格式
          </button>
        </div>
        <pre className={styles.outputPre}>{outputText}</pre>
        <button
          className={`${styles.copyBtn} ${copied ? styles.copyBtnOk : ""}`}
          onClick={handleCopy}
        >
          {copied ? "✓ 已複製" : "複製"}
        </button>
      </div>
    </Container>
  );
}
