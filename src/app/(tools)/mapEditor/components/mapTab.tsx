"use client";
import React, { useState, useCallback, useRef } from "react";
import Image from "next/image";
import styles from "../styles/mapEditor.module.css";
import {
  CellType,
  GridCell,
  TileTextures,
  MapJson,
  WaveEnemy,
  WaveRow,
} from "../types";
import { SHENMA_SANGUO_GAS_URL } from "@/app/(games)/shenmaSanguo/api/gameApi";

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

const DEFAULT_TILE_IMAGE_OPTIONS = [
  "tile_stone.webp",
  "tile_grass.webp",
  "tile_dirt.webp",
  "tile_empty.webp",
  "tile_fortress.webp",
  "tile_gate.webp",
  "tile_tree.webp",
];

// ── 格子工具函式 ──────────────────────────────────────────────

function makeGrid(cols: number, rows: number): GridCell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ type: "empty" as CellType }))
  );
}

function cellClass(cell: GridCell, s: Record<string, string>): string {
  if (cell.type === "obstacle") return `${s.cell} ${s.cellObstacle}`;
  if (cell.type === "build") return `${s.cell} ${s.cellBuild}`;
  if (cell.type === "road") {
    if (cell.waypointIndex === 0) return `${s.cell} ${s.cellSpawn}`;
    const pathClass = cell.pathId ? s[`cellPath_${cell.pathId}`] || "" : "";
    return `${s.cell} ${s.cellWaypoint} ${pathClass}`;
  }
  return `${s.cell} ${s.cellEmpty}`;
}

function getCellTexture(
  cell: GridCell,
  paths: Record<string, [number, number][]>,
  textures: TileTextures
): string {
  if (cell.type === "obstacle") return textures.obstacle;
  if (cell.type === "build") return textures.build;
  if (cell.type === "road" && cell.pathId) {
    const pts = paths[cell.pathId] || [];
    if (cell.waypointIndex === 0) return textures.spawn;
    if (cell.waypointIndex === pts.length - 1 && pts.length > 1) {
      return textures.base; // 所有路徑最後一點都給 base 圖示（如果需要）
    }
    return textures.road;
  }
  return textures.empty;
}

function cellLabel(
  cell: GridCell,
  paths: Record<string, [number, number][]>,
  col: number,
  row: number
): string {
  // 檢查所有路徑看此座標出現在哪些路徑中
  const labels: string[] = [];
  Object.entries(paths).forEach(([pid, pts]) => {
    // 找出此座標在該路徑中的所有索引
    pts.forEach((pt, i) => {
      if (pt[0] === col && pt[1] === row) {
        const shortName = pid.replace("path_", "").toUpperCase();
        if (i === 0) labels.push("S");
        else if (i === pts.length - 1) labels.push("E");
        else labels.push(`${shortName}${i}`);
      }
    });
  });

  // 去重並回傳（例如 A+B 或 A10）
  const uniqueLabels = Array.from(new Set(labels));
  if (uniqueLabels.length > 1) {
    // 優先保留 S/E，如果有多個則顯示 A+B
    if (uniqueLabels.includes("S")) return "S";
    if (uniqueLabels.includes("E")) return "E";
    return uniqueLabels.slice(0, 2).join("+");
  }
  return uniqueLabels[0] || "";
}

// ── Tile 圖片選擇器 ───────────────────────────────────────────

function TextureSelector({
  label,
  value,
  onChange,
  imageOptions,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  imageOptions: string[];
}) {
  return (
    <div className={styles.textureRow}>
      <span className={styles.textureLabel}>{label}</span>
      <div className={styles.textureOptions}>
        {imageOptions.map((img) => (
          <button
            key={img}
            className={`${styles.textureOption} ${value === img ? styles.textureOptionSelected : ""}`}
            onClick={() => onChange(img)}
            title={img}
            type="button"
          >
            <Image
              src={`/images/shenmaSanguo/${img}`}
              alt={img}
              width={26}
              height={26}
              style={{ imageRendering: "pixelated", objectFit: "cover" }}
              unoptimized
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── GAS 呼叫 ─────────────────────────────────────────────────

async function gasCall(action: string, payload: object) {
  const res = await fetch(SHENMA_SANGUO_GAS_URL, {
    method: "POST",
    body: JSON.stringify({ action, payload }),
  });
  return res.json();
}

// ── 主元件 ───────────────────────────────────────────────────

export default function MapTab({ tileImages = [] }: { tileImages?: string[] }) {
  const imageOptions =
    tileImages.length > 0 ? tileImages : DEFAULT_TILE_IMAGE_OPTIONS;
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [colsInput, setColsInput] = useState(String(DEFAULT_COLS));
  const [rowsInput, setRowsInput] = useState(String(DEFAULT_ROWS));
  const [grid, setGrid] = useState<GridCell[][]>(() =>
    makeGrid(DEFAULT_COLS, DEFAULT_ROWS)
  );
  // NEW: 多路徑支援
  const [paths, setPaths] = useState<Record<string, [number, number][]>>({
    path_a: [],
  });
  const [activePathId, setActivePathId] = useState<string>("path_a");
  const [tool, setTool] = useState<Tool>("waypoint");
  const [textures, setTextures] = useState<TileTextures>(DEFAULT_TEXTURES);
  const [mapId, setMapId] = useState("chapter1_1");
  const [mapName, setMapName] = useState("第一關");
  const [chapter, setChapter] = useState("1");
  const [unlockStage, setUnlockStage] = useState("chapter1_1");
  const [outputTab, setOutputTab] = useState<"standard" | "sheets">("standard");
  const [copied, setCopied] = useState(false);
  const [loadMapId, setLoadMapId] = useState("chapter1_1");
  const [mapList, setMapList] = useState<
    { map_id: string; name: string; chapter: number }[]
  >([]);
  const [listLoading, setListLoading] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newMapId, setNewMapId] = useState("");
  const [newMapName, setNewMapName] = useState("");
  const [newChapter, setNewChapter] = useState("1");
  const [newUnlockStage, setNewUnlockStage] = useState("");
  const [newCols, setNewCols] = useState(String(DEFAULT_COLS));
  const [newRows, setNewRows] = useState(String(DEFAULT_ROWS));
  const [sheetStatus, setSheetStatus] = useState<
    "idle" | "loading" | "saving" | "ok" | "error"
  >("idle");
  const [sheetMsg, setSheetMsg] = useState("");
  const [waves, setWaves] = useState<WaveRow[]>([]);
  const [enemyOptions, setEnemyOptions] = useState<string[]>([]);
  const [waveStatus, setWaveStatus] = useState<
    "idle" | "saving" | "ok" | "error"
  >("idle");
  const [waveMsg, setWaveMsg] = useState("");
  const [importJson, setImportJson] = useState("");
  const isPainting = useRef(false);

  // ── 尺寸 ──
  const applySize = (c?: number, r?: number) => {
    const nc = c ?? Math.max(1, Math.min(40, parseInt(colsInput) || cols));
    const nr = r ?? Math.max(1, Math.min(40, parseInt(rowsInput) || rows));
    setCols(nc);
    setRows(nr);
    setColsInput(String(nc));
    setRowsInput(String(nr));
    setGrid((prev) => {
      const next = makeGrid(nc, nr);
      for (let row = 0; row < Math.min(nr, prev.length); row++)
        for (let col = 0; col < Math.min(nc, (prev[row] ?? []).length); col++)
          next[row][col] = prev[row][col];
      return next;
    });
    setPaths((prev) => {
      const next: Record<string, [number, number][]> = {};
      for (const pid in prev) {
        next[pid] = prev[pid].filter(([col, row]) => col < nc && row < nr);
      }
      return next;
    });
  };

  // ── 格子塗色 ──
  const applyCell = useCallback(
    (col: number, row: number) => {
      setGrid((prev) => {
        const next = prev.map((r) => r.map((c) => ({ ...c })));
        const cell = next[row][col];

        if (tool === "erase") {
          let wasRoad = false;
          // Check if it's a road in ANY path and erase it from paths
          setPaths((p) => {
            let changed = false;
            const nextP = { ...p };
            for (const pid in nextP) {
              const prevLen = nextP[pid].length;
              nextP[pid] = nextP[pid].filter(
                ([c, r]) => !(c === col && r === row)
              );
              if (nextP[pid].length !== prevLen) {
                wasRoad = true;
                changed = true;
              }
            }
            if (changed) {
              // Updates grid sequentially
              setGrid((g) => {
                const g2 = g.map((r) => r.map((c) => ({ ...c })));
                g2[row][col] = { type: "empty" }; // Clear this block
                // Re-apply remaining paths to restore overlaps if any
                for (const pid in nextP) {
                  nextP[pid].forEach(([c, r], index) => {
                    g2[r][c] = {
                      type: "road",
                      waypointIndex: index,
                      pathId: pid,
                    };
                  });
                }
                return g2;
              });
            }
            return changed ? nextP : p;
          });

          // If it wasn't a road, it might be a build or obstacle, just clear it.
          next[row][col] = { type: "empty" };
          return wasRoad ? prev : next;
        }
        if (tool === "build") {
          if (cell.type === "road") return prev;
          next[row][col] = { type: "build" };
          return next;
        }
        if (tool === "obstacle") {
          if (cell.type === "road") return prev;
          next[row][col] = { type: "obstacle" };
          return next;
        }
        if (tool === "waypoint") {
          // Allow overlapping! Ignore only if it's build or obstacle.
          if (cell.type === "build" || cell.type === "obstacle") return prev;

          setPaths((p) => {
            const currentPath = p[activePathId] || [];
            // Prevent consecutive duplicate points on the exact same cell
            if (currentPath.length > 0) {
              const last = currentPath[currentPath.length - 1];
              if (last[0] === col && last[1] === row) return p;
            }

            const newPath = [...currentPath, [col, row] as [number, number]];
            setGrid((g) => {
              const g2 = g.map((r) => r.map((c) => ({ ...c })));
              g2[row][col] = {
                type: "road",
                waypointIndex: newPath.length - 1,
                pathId: activePathId,
              };
              return g2;
            });
            return { ...p, [activePathId]: newPath };
          });
          return prev;
        }
        return next;
      });
    },
    [tool, activePathId]
  );

  const handleMouseDown = (col: number, row: number) => {
    isPainting.current = true;
    applyCell(col, row);
  };
  const handleMouseEnter = (col: number, row: number) => {
    if (!isPainting.current) return;
    if (tool !== "waypoint") applyCell(col, row);
  };
  const handleMouseUp = () => {
    isPainting.current = false;
  };
  const handleClear = () => {
    setGrid(makeGrid(cols, rows));
    setPaths({ path_a: [] });
    setActivePathId("path_a");
  };

  // ── JSON → Grid（從 Sheet 載入時使用）──
  const loadFromJson = useCallback(
    (json: MapJson) => {
      const {
        cols: c,
        rows: r,
        waypoints: wps,
        paths: pths,
        build_zones,
        obstacles,
        tile_textures,
        map_id,
        name,
        chapter: ch,
        unlock_stage,
      } = json;

      setMapId(map_id || "");
      setMapName(name || "");
      setChapter(String(ch || 1));
      setUnlockStage(unlock_stage || "");
      if (tile_textures) setTextures({ ...DEFAULT_TEXTURES, ...tile_textures });

      const nc = c || DEFAULT_COLS;
      const nr = r || DEFAULT_ROWS;
      setCols(nc);
      setRows(nr);
      setColsInput(String(nc));
      setRowsInput(String(nr));

      // 處理路徑（相容舊版 waypoints）
      let loadedPaths: Record<string, [number, number][]> = {};
      if (pths && Object.keys(pths).length > 0) {
        loadedPaths = { ...pths } as Record<string, [number, number][]>;
      } else if (wps && wps.length > 0) {
        loadedPaths = { path_a: wps as [number, number][] };
      } else {
        loadedPaths = { path_a: [] };
      }

      setPaths(loadedPaths);
      setActivePathId(Object.keys(loadedPaths)[0] || "path_a");

      // 先把 Grid 刷成 EMPTY
      const finalGrid = makeGrid(nc, nr);

      // 套用 Path (不論重疊與否，只要是路徑就標記成 road)
      Object.entries(loadedPaths).forEach(([pid, pts]) => {
        pts.forEach(([col, row], i) => {
          if (col >= 0 && col < nc && row >= 0 && row < nr) {
            finalGrid[row][col] = {
              type: "road",
              waypointIndex: i,
              pathId: pid,
            };
          }
        });
      });

      // 套用建築區 (只覆蓋 empty)
      (build_zones || []).forEach(([col, row]) => {
        if (col >= 0 && col < nc && row >= 0 && row < nr) {
          if (finalGrid[row][col].type === "empty") {
            finalGrid[row][col] = { type: "build" };
          }
        }
      });

      // 套用障礙物 (覆蓋所有)
      (obstacles || []).forEach(([col, row]) => {
        if (col >= 0 && col < nc && row >= 0 && row < nr) {
          finalGrid[row][col] = { type: "obstacle" };
        }
      });

      setGrid(finalGrid);
    },
    [
      setPaths,
      setActivePathId,
      setTextures,
      setCols,
      setRows,
      setGrid,
      setMapId,
      setMapName,
      setChapter,
      setUnlockStage,
    ]
  );

  // ── 波次操作 ──
  const handleLoadEnemies = async () => {
    if (enemyOptions.length > 0) return;
    try {
      const data = await gasCall("get_enemies_config", {});
      if (data.status !== 200) return;
      const ids: string[] = (data.enemies as Record<string, string>[]).map(
        (e) => String(e.enemy_id || e.id || "")
      );
      setEnemyOptions(ids.filter(Boolean));
    } catch {}
  };

  const addWave = () =>
    setWaves((prev) => [
      ...prev,
      {
        wave: prev.length + 1,
        enemies: [{ enemy_id: "", count: 5, interval: 1.5, path: "path_a" }],
      },
    ]);

  const removeWave = (wi: number) =>
    setWaves((prev) =>
      prev.filter((_, i) => i !== wi).map((w, i) => ({ ...w, wave: i + 1 }))
    );

  const addEnemy = (wi: number) =>
    setWaves((prev) =>
      prev.map((w, i) =>
        i !== wi
          ? w
          : {
              ...w,
              enemies: [
                ...w.enemies,
                {
                  enemy_id: enemyOptions[0] ?? "",
                  count: 5,
                  interval: 1.5,
                  path: "path_a",
                },
              ],
            }
      )
    );

  const removeEnemy = (wi: number, ei: number) =>
    setWaves((prev) =>
      prev.map((w, i) =>
        i !== wi ? w : { ...w, enemies: w.enemies.filter((_, j) => j !== ei) }
      )
    );

  const updateEnemy = (wi: number, ei: number, patch: Partial<WaveEnemy>) =>
    setWaves((prev) =>
      prev.map((w, i) =>
        i !== wi
          ? w
          : {
              ...w,
              enemies: w.enemies.map((e, j) =>
                j !== ei ? e : { ...e, ...patch }
              ),
            }
      )
    );

  const handleSaveWaves = async () => {
    setWaveStatus("saving");
    setWaveMsg("儲存中...");
    try {
      const data = await gasCall("save_waves_config", {
        map_id: mapId,
        waves,
      });
      if (data.status !== 200) throw new Error(data.error || "儲存失敗");
      setWaveStatus("ok");
      setWaveMsg("✓ 波次儲存成功");
    } catch (e) {
      setWaveStatus("error");
      setWaveMsg(`✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // ── 新增地圖（modal 確認後）──
  const handleNewMapConfirm = () => {
    const nc = parseInt(newCols) || 14;
    const nr = parseInt(newRows) || 11;
    setCols(nc);
    setRows(nr);
    setColsInput(String(nc));
    setRowsInput(String(nr));
    setMapId(newMapId.trim());
    setMapName(newMapName.trim());
    setChapter(newChapter.trim() || "1");
    setUnlockStage(newUnlockStage.trim());
    setGrid(makeGrid(nc, nr));
    setPaths({ path_a: [] });
    setActivePathId("path_a");
    setShowNewModal(false);
  };

  const openNewModal = () => {
    setNewMapId("");
    setNewMapName("");
    setNewChapter("1");
    setNewUnlockStage("");
    setNewCols(String(DEFAULT_COLS));
    setNewRows(String(DEFAULT_ROWS));
    setShowNewModal(true);
  };

  // ── Sheet 操作 ──
  const handleLoadMapList = async () => {
    setListLoading(true);
    try {
      const data = await gasCall("get_all_maps", {});
      if (data.status !== 200) throw new Error(data.error || "載入失敗");
      const list =
        (data.maps as { map_id: string; name: string; chapter: number }[]) ||
        [];
      setMapList(list);
      if (list.length > 0) setLoadMapId(list[0].map_id);
    } catch (e) {
      setSheetStatus("error");
      setSheetMsg(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setListLoading(false);
    }
  };

  const handleLoadFromSheet = async () => {
    setSheetStatus("loading");
    setSheetMsg("載入中...");
    try {
      const data = await gasCall("get_map_config", { map_id: loadMapId });
      if (data.status !== 200) throw new Error(data.error || "載入失敗");
      const {
        path_json,
        name,
        chapter: ch,
        unlock_stage,
        waves: loadedWaves,
      } = data.map;
      loadFromJson({
        ...path_json,
        map_id: loadMapId,
        name,
        chapter: ch,
        unlock_stage,
      });
      if (Array.isArray(loadedWaves)) setWaves(loadedWaves as WaveRow[]);
      setSheetStatus("ok");
      setSheetMsg("✓ 載入成功");
    } catch (e) {
      setSheetStatus("error");
      setSheetMsg(`✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleUpdateSheet = async () => {
    setSheetStatus("saving");
    setSheetMsg("更新中...");
    try {
      const data = await gasCall("update_map_config", {
        map_id: mapId,
        path_json: buildMapJson(),
      });
      if (data.status !== 200) throw new Error(data.error || "更新失敗");
      setSheetStatus("ok");
      setSheetMsg("✓ 更新成功");
    } catch (e) {
      setSheetStatus("error");
      setSheetMsg(`✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleCreateSheet = async () => {
    setSheetStatus("saving");
    setSheetMsg("新增中...");
    try {
      const data = await gasCall("create_map_config", {
        map_id: mapId,
        chapter: parseInt(chapter) || 1,
        name: mapName,
        unlock_stage: unlockStage,
        path_json: buildMapJson(),
      });
      if (data.status !== 200) throw new Error(data.error || "新增失敗");
      setSheetStatus("ok");
      setSheetMsg("✓ 新增成功");
    } catch (e) {
      setSheetStatus("error");
      setSheetMsg(`✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // ── 輸出 JSON ──
  const buildMapJson = (): MapJson => {
    const buildZones: number[][] = [];
    const obstacles: number[][] = [];
    grid.forEach((rowArr, rowIdx) =>
      rowArr.forEach((cell, colIdx) => {
        if (cell.type === "build") buildZones.push([colIdx, rowIdx]);
        if (cell.type === "obstacle") obstacles.push([colIdx, rowIdx]);
      })
    );
    // 向後相容（若只有 path_a 就提取給 waypoints）
    const legacyWaypoints = paths["path_a"]
      ? paths["path_a"].map(([c, r]) => [c, r])
      : [];
    const spawn = legacyWaypoints[0] ? [...legacyWaypoints[0]] : [];
    const base =
      legacyWaypoints.length > 1
        ? [...legacyWaypoints[legacyWaypoints.length - 1]]
        : [];

    // 過濾掉空的路徑
    const cleanPaths: Record<string, number[][]> = {};
    for (const [pid, pts] of Object.entries(paths)) {
      if (pts.length > 0) {
        cleanPaths[pid] = pts.map(([c, r]) => [c, r]);
      }
    }

    return {
      map_id: mapId,
      name: mapName,
      chapter: parseInt(chapter) || 1,
      unlock_stage: unlockStage,
      cols,
      rows,
      paths: cleanPaths,
      waypoints: legacyWaypoints,
      spawn,
      base,
      build_zones: buildZones,
      obstacles,
      tile_textures: textures,
    };
  };

  const standardJson = () => JSON.stringify(buildMapJson(), null, 2);
  const sheetsJson = () => JSON.stringify(buildMapJson()).replace(/"/g, '""');
  const outputText = outputTab === "standard" ? standardJson() : sheetsJson();

  const handleCopy = () => {
    navigator.clipboard.writeText(outputText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const handleImport = () => {
    try {
      const json = JSON.parse(importJson) as MapJson;
      // 硬核相容：有些匯出的 JSON 欄位在頂層，有些在 path_json
      const targetJson = (json as any).path_json
        ? (json as any).path_json
        : json;
      loadFromJson(targetJson);
      setSheetStatus("ok");
      setSheetMsg("✓ 匯入成功");
      setImportJson("");
    } catch (e) {
      alert("JSON 格式錯誤：" + e);
    }
  };

  const cleanPaths = () => {
    setPaths((prev) => {
      const next: Record<string, [number, number][]> = {};
      Object.entries(prev).forEach(([pid, pts]) => {
        const cleaned: [number, number][] = [];
        pts.forEach((pt, i) => {
          if (i === 0) {
            cleaned.push(pt);
          } else {
            const last = cleaned[cleaned.length - 1];
            if (last[0] !== pt[0] || last[1] !== pt[1]) {
              cleaned.push(pt);
            }
          }
        });
        next[pid] = cleaned;
      });
      return next;
    });
    setSheetStatus("ok");
    setSheetMsg("✓ 路徑重複點已清理 (標籤應恢復連號)");
  };

  const statusClass =
    sheetStatus === "ok"
      ? styles.sheetStatusOk
      : sheetStatus === "error"
        ? styles.sheetStatusErr
        : styles.sheetStatusBusy;

  // 給波次的選項（包含目前存在的 path_x）
  const wavePathOptions = Object.keys(paths).filter(
    (pid) => paths[pid].length > 0
  );
  if (wavePathOptions.length === 0) wavePathOptions.push("path_a"); // fall back

  return (
    <>
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

        {/* NEW: 路徑切換 */}
        <div className={styles.toolSep} />
        <span className={styles.toolLabel}>路徑：</span>
        <select
          className={styles.sizeInput}
          style={{ width: "90px" }}
          value={activePathId}
          onChange={(e) => setActivePathId(e.target.value)}
        >
          {Object.keys(paths).map((pid) => (
            <option key={pid} value={pid}>
              {pid}
            </option>
          ))}
        </select>
        <button
          className={styles.toolBtn}
          onClick={() => {
            const nextIdx = Object.keys(paths).length;
            const newPid = `path_${String.fromCharCode(97 + nextIdx)}`; // path_c, path_d...
            setPaths((p) => ({ ...p, [newPid]: [] }));
            setActivePathId(newPid);
          }}
          title="新增路徑"
        >
          +
        </button>

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
          <button className={styles.toolBtn} onClick={() => applySize()}>
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
        <button
          className={`${styles.toolBtn}`}
          onClick={cleanPaths}
          title="移除路徑中連續重複的座標，修正 A2, A4 跳號問題"
        >
          🧹 清理路徑
        </button>
        <div className={styles.toolbarRight}>
          <button className={styles.toolBtn} onClick={openNewModal}>
            ＋ 新增地圖
          </button>
        </div>
      </div>

      {/* ── 主體 ── */}
      <div className={styles.editorBody}>
        {/* 格子 + 波次（左欄） */}
        <div className={styles.gridCol}>
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
                rowArr.map((cell, colIdx) => {
                  // 如果該格子是 road，標示它是目前選中的路徑嗎？
                  const isActivePath =
                    cell.type === "road" && cell.pathId === activePathId;
                  const dynamicOpacity =
                    cell.type === "road" && !isActivePath ? 0.6 : 1;

                  return (
                    <div
                      key={`${colIdx}-${rowIdx}`}
                      className={cellClass(
                        {
                          ...cell,
                          pathId:
                            cell.pathId ||
                            (isActivePath ? activePathId : undefined),
                        },
                        styles
                      )}
                      style={{
                        backgroundImage: `url(/images/shenmaSanguo/${getCellTexture(cell, paths, textures)})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        opacity: dynamicOpacity,
                        outline: isActivePath ? "2px solid #ff7b00" : "none",
                        outlineOffset: "-2px",
                        zIndex: isActivePath ? 2 : 1,
                      }}
                      onMouseDown={() => handleMouseDown(colIdx, rowIdx)}
                      onMouseEnter={() => handleMouseEnter(colIdx, rowIdx)}
                      title={`[${colIdx},${rowIdx}]`}
                    >
                      {cellLabel(cell, paths, colIdx, rowIdx)}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          {/* ── 波次編輯器（地圖正下方）── */}
          <div className={styles.waveCard}>
            <div className={styles.wavePanelHeader}>
              <span className={styles.panelTitle}>波次設定</span>
              <div className={styles.wavePanelActions}>
                <button
                  className={styles.toolBtn}
                  onClick={() => {
                    handleLoadEnemies();
                    addWave();
                  }}
                >
                  ＋ 新增波次
                </button>
                <button
                  className={styles.waveSaveBtn}
                  onClick={handleSaveWaves}
                  disabled={waveStatus === "saving"}
                >
                  儲存波次至 Sheet
                </button>
              </div>
            </div>

            {waveMsg && (
              <div
                className={
                  waveStatus === "ok"
                    ? styles.waveStatusOk
                    : waveStatus === "error"
                      ? styles.waveStatusErr
                      : styles.waveStatusBusy
                }
                style={{ marginBottom: "0.5rem" }}
              >
                {waveMsg}
              </div>
            )}

            {waves.length === 0 && (
              <div style={{ fontSize: "0.78rem", color: "#9ca3af" }}>
                尚無波次，點擊「＋ 新增波次」開始設定。
              </div>
            )}

            {waves.map((wave, wi) => (
              <div key={wi} className={styles.waveItem}>
                <div className={styles.waveItemHeader}>
                  <span className={styles.waveItemTitle}>波次 {wave.wave}</span>
                  <button
                    className={`${styles.toolBtn} ${styles.toolBtnDanger}`}
                    style={{ padding: "0.15rem 0.5rem", fontSize: "0.72rem" }}
                    onClick={() => removeWave(wi)}
                  >
                    刪除波次
                  </button>
                </div>

                <table className={styles.waveTable}>
                  <thead>
                    <tr>
                      <th>敵人</th>
                      <th>數量</th>
                      <th>間隔(s)</th>
                      <th>路徑</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {wave.enemies.map((enemy, ei) => (
                      <tr key={ei}>
                        <td>
                          {enemyOptions.length > 0 ? (
                            <select
                              className={styles.waveSelect}
                              value={enemy.enemy_id}
                              onChange={(e) =>
                                updateEnemy(wi, ei, {
                                  enemy_id: e.target.value,
                                })
                              }
                            >
                              {enemyOptions.map((id) => (
                                <option key={id} value={id}>
                                  {id}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className={styles.waveSelect}
                              value={enemy.enemy_id}
                              onChange={(e) =>
                                updateEnemy(wi, ei, {
                                  enemy_id: e.target.value,
                                })
                              }
                              placeholder="enemy_id"
                            />
                          )}
                        </td>
                        <td>
                          <input
                            className={styles.waveNumInput}
                            type="number"
                            min={1}
                            value={enemy.count}
                            onChange={(e) =>
                              updateEnemy(wi, ei, {
                                count: Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            className={styles.waveIntervalInput}
                            type="number"
                            min={0.1}
                            step={0.5}
                            value={enemy.interval}
                            onChange={(e) =>
                              updateEnemy(wi, ei, {
                                interval: Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td>
                          <select
                            className={styles.waveSelect}
                            value={enemy.path}
                            onChange={(e) =>
                              updateEnemy(wi, ei, { path: e.target.value })
                            }
                            style={{ minWidth: "80px" }}
                          >
                            {wavePathOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            className={styles.toolBtn}
                            style={{
                              padding: "0.15rem 0.45rem",
                              fontSize: "0.7rem",
                            }}
                            onClick={() => removeEnemy(wi, ei)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <button
                  className={styles.toolBtn}
                  style={{ fontSize: "0.75rem" }}
                  onClick={() => addEnemy(wi)}
                >
                  ＋ 新增敵人
                </button>
              </div>
            ))}
          </div>
        </div>
        {/* end gridCol */}

        {/* 側邊面板 */}
        <div className={styles.sidePanel}>
          {/* 地圖資訊 */}
          <div className={styles.panelCard}>
            <div className={styles.panelTitle}>地圖資訊</div>
            {(
              [
                { label: "map_id", val: mapId, set: setMapId },
                { label: "名稱", val: mapName, set: setMapName },
                { label: "章節", val: chapter, set: setChapter },
                { label: "解鎖條件", val: unlockStage, set: setUnlockStage },
              ] as { label: string; val: string; set: (v: string) => void }[]
            ).map(({ label, val, set }) => (
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

          {/* Sheet 連動 */}
          <div className={styles.panelCard}>
            <div className={styles.panelTitle}>Sheet 連動</div>
            <div className={styles.sheetPanel}>
              <div className={styles.sheetRow}>
                <button
                  className={styles.toolBtn}
                  onClick={handleLoadMapList}
                  disabled={listLoading}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {listLoading ? "載入中..." : "載入清單"}
                </button>
              </div>
              <div className={styles.sheetRow}>
                {mapList.length > 0 ? (
                  <select
                    className={styles.sheetInput}
                    value={loadMapId}
                    onChange={(e) => setLoadMapId(e.target.value)}
                  >
                    {mapList.map((m) => (
                      <option key={m.map_id} value={m.map_id}>
                        {m.map_id} — {m.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={styles.sheetInput}
                    placeholder="map_id"
                    value={loadMapId}
                    onChange={(e) => setLoadMapId(e.target.value)}
                  />
                )}
                <button
                  className={styles.toolBtn}
                  onClick={handleLoadFromSheet}
                  disabled={sheetStatus === "loading"}
                >
                  載入
                </button>
              </div>
              <div className={styles.sheetBtnRow}>
                <button
                  className={styles.toolBtn}
                  onClick={handleUpdateSheet}
                  disabled={sheetStatus === "saving"}
                  style={{ flex: 1 }}
                >
                  更新至 Sheet
                </button>
                <button
                  className={styles.toolBtn}
                  onClick={handleCreateSheet}
                  disabled={sheetStatus === "saving"}
                  style={{ flex: 1 }}
                >
                  新增至 Sheet
                </button>
              </div>
              {sheetMsg && (
                <div className={`${styles.sheetStatus} ${statusClass}`}>
                  {sheetMsg}
                </div>
              )}
            </div>
          </div>

          {/* 航點清單 */}
          <div className={styles.panelCard}>
            <div className={styles.panelTitle}>
              目前路徑 ({activePathId}) 航點（
              {(paths[activePathId] || []).length} 個）
            </div>
            {(paths[activePathId] || []).length === 0 ? (
              <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                點擊格子新增航點，第一個為出生點，最後一個為終點。
              </div>
            ) : (
              <div className={styles.waypointList}>
                {(paths[activePathId] || []).map(([c, r], i, arr) => (
                  <div key={i} className={styles.waypointItem}>
                    <span
                      className={`${styles.waypointBadge} ${i === 0 ? styles.waypointBadgeSpawn : i === arr.length - 1 ? styles.waypointBadgeBase : ""}`}
                    >
                      {i === 0 ? "S" : i === arr.length - 1 ? "E" : i}
                    </span>
                    [{c}, {r}]
                    {i === 0 && (
                      <span style={{ fontSize: "0.65rem", color: "#10b981" }}>
                        &nbsp;出生點
                      </span>
                    )}
                    {i === arr.length - 1 && arr.length > 1 && (
                      <span style={{ fontSize: "0.65rem", color: "#ef4444" }}>
                        &nbsp;終點
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tile Textures（全寬，editorBody 下方）── */}
      <div className={styles.textureCard}>
        <div className={styles.panelTitle}>Tile Textures</div>
        <div className={styles.textureGrid}>
          {(Object.keys(textures) as (keyof TileTextures)[]).map((key) => (
            <TextureSelector
              key={key}
              label={key}
              value={textures[key]}
              onChange={(v) => setTextures((t) => ({ ...t, [key]: v }))}
              imageOptions={imageOptions}
            />
          ))}
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
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <button
            className={`${styles.copyBtn} ${copied ? styles.copyBtnOk : ""}`}
            onClick={handleCopy}
            style={{ width: "auto", flex: 1 }}
          >
            {copied ? "✓ 已複製" : "複製 JSON"}
          </button>

          <div style={{ flex: 2, display: "flex", gap: "4px" }}>
            <input
              className={styles.modalInput}
              style={{ margin: 0, height: "36px", fontSize: "12px" }}
              placeholder="貼上 JSON 進行匯入..."
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
            />
            <button
              className={styles.toolBtn}
              onClick={handleImport}
              style={{ whiteSpace: "nowrap" }}
            >
              匯入
            </button>
          </div>
        </div>
      </div>

      {/* ── 新增地圖 Modal ── */}
      {showNewModal && (
        <div
          className={styles.modalOverlay}
          onMouseDown={() => setShowNewModal(false)}
        >
          <div
            className={styles.modal}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className={styles.modalTitle}>新增地圖</div>

            {(
              [
                { label: "map_id", val: newMapId, set: setNewMapId },
                { label: "名稱", val: newMapName, set: setNewMapName },
                { label: "章節", val: newChapter, set: setNewChapter },
                {
                  label: "解鎖條件",
                  val: newUnlockStage,
                  set: setNewUnlockStage,
                },
                { label: "寬 (Cols)", val: newCols, set: setNewCols },
                { label: "高 (Rows)", val: newRows, set: setNewRows },
              ] as { label: string; val: string; set: (v: string) => void }[]
            ).map(({ label, val, set }) => (
              <div key={label} className={styles.modalField}>
                <label className={styles.modalLabel}>{label}</label>
                <input
                  className={styles.modalInput}
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  placeholder={label}
                />
              </div>
            ))}

            <div className={styles.modalFooter}>
              <button
                className={styles.toolBtn}
                onClick={() => setShowNewModal(false)}
              >
                取消
              </button>
              <button
                className={`${styles.toolBtn} ${styles.toolBtnActive}`}
                onClick={handleNewMapConfirm}
                disabled={!newMapId.trim() || !newMapName.trim()}
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
