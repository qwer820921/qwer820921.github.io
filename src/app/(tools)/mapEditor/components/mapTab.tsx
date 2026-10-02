"use client";
import React, { useState, useCallback, useRef, useEffect } from "react";
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
import type { EnemyConfig, MapConfig } from "@/app/(games)/shenmaSanguo/types";
import {
  ADMIN_TOKEN_MISSING,
  adminErrorText,
  forgetAdminToken,
  requireAdminToken,
} from "../utils/adminToken";
import {
  CHAPTER_INVALID,
  META_LABEL,
  MapMetaFields,
  MapMetaOriginal,
  mapMetaUpdate,
  metaReadbackDiff,
  metaText,
  parseChapter,
} from "../utils/mapMeta";
import {
  cleanWavesForSave,
  droppedGroupsText,
  expectedSavedWaves,
  normalizeWaves,
  wavesSig,
} from "../utils/waveSave";
import MapIntegrityPanel, { LoadState } from "./mapIntegrityPanel";

type Tool = "waypoint" | "build" | "obstacle" | "erase" | "texture";

// 素材的「加入開發素材」只在本機開發（npm run dev）提供：正式網站是靜態網站，沒有寫入 public 的服務
const IS_DEV = process.env.NODE_ENV === "development";

const DEFAULT_COLS = 14;
const DEFAULT_ROWS = 11;
const DEFAULT_TEXTURES: TileTextures = {
  road: "tiles/tile_stone.webp",
  build: "tiles/tile_grass1.webp",
  empty: "tiles/tile_empty.webp",
  base: "tiles/tile_fortress.webp",
  spawn: "tiles/tile_gate.webp",
  // 障礙物素材只有編號版（tile_dirt1～24），2 是岩石
  obstacle: "tiles/tile_dirt2.webp",
};

// 讀不到 public/images/shenmaSanguo/tiles 時的備援清單：只列實際存在的素材
const DEFAULT_TILE_IMAGE_OPTIONS = [
  "tiles/tile_stone.webp",
  "tiles/tile_grass1.webp",
  "tiles/tile_dirt2.webp",
  "tiles/tile_empty.webp",
  "tiles/tile_fortress.webp",
  "tiles/tile_gate.webp",
];

// ── 格子工具函式 ──────────────────────────────────────────────

// 舊格式路徑沒有子目錄前綴，統一補 tiles/
function normalizeTex(p: string): string {
  if (!p) return DEFAULT_TEXTURES.empty;
  return p.includes("/") ? p : `tiles/${p}`;
}

function makeGrid(
  cols: number,
  rows: number,
  defaultTex = DEFAULT_TEXTURES.empty
): GridCell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      type: "empty" as CellType,
      texture: defaultTex,
    }))
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

function getCellTexture(cell: GridCell): string {
  return cell.texture;
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

// ── 地圖 JSON → 編輯器內容（純函式：載入時也用來記下「已保存」的畫面內容）──

/** 編輯器裡一張地圖的內容（地圖資訊是輸入框的文字） */
interface EditorMap {
  mapId: string;
  name: string;
  chapter: string;
  unlockStage: string;
  textures: TileTextures;
  cols: number;
  rows: number;
  paths: Record<string, [number, number][]>;
  activePathId: string;
  bgTexture: string;
  grid: GridCell[][];
}

function editorMapFromJson(json: MapJson): EditorMap {
  const {
    cols: c,
    rows: r,
    waypoints: wps,
    paths: pths,
    build_zones,
    obstacles,
    tile_textures,
    cell_textures,
    background_texture,
    map_id,
    name,
    chapter: ch,
    unlock_stage,
  } = json;

  const rawTx = tile_textures || {};
  const normalizedTx = Object.fromEntries(
    Object.entries(rawTx).map(([k, v]) => [k, normalizeTex(String(v))])
  ) as Partial<TileTextures>;
  const tx: TileTextures = { ...DEFAULT_TEXTURES, ...normalizedTx };

  const nc = c || DEFAULT_COLS;
  const nr = r || DEFAULT_ROWS;

  let loadedPaths: Record<string, [number, number][]> = {};
  if (pths && Object.keys(pths).length > 0) {
    loadedPaths = { ...pths } as Record<string, [number, number][]>;
  } else if (wps && wps.length > 0) {
    loadedPaths = { path_a: wps as [number, number][] };
  } else {
    loadedPaths = { path_a: [] };
  }

  const bgTex =
    background_texture && background_texture.startsWith("maps/")
      ? background_texture
      : "maps/bg_forest.webp";
  const finalGrid = makeGrid(nc, nr, DEFAULT_TEXTURES.empty);

  // 路徑：texture 依位置推算（spawn/road/base）
  Object.entries(loadedPaths).forEach(([pid, pts]) => {
    pts.forEach(([col, row], i) => {
      if (col >= 0 && col < nc && row >= 0 && row < nr) {
        const isSpawn = i === 0;
        const isBase = i === pts.length - 1 && pts.length > 1;
        finalGrid[row][col] = {
          type: "road",
          waypointIndex: i,
          pathId: pid,
          texture: isSpawn ? tx.spawn : isBase ? tx.base : tx.road,
        };
      }
    });
  });

  (build_zones || []).forEach(([col, row]) => {
    if (col >= 0 && col < nc && row >= 0 && row < nr) {
      if (finalGrid[row][col].type === "empty")
        finalGrid[row][col] = { type: "build", texture: tx.build };
    }
  });

  (obstacles || []).forEach(([col, row]) => {
    if (col >= 0 && col < nc && row >= 0 && row < nr)
      finalGrid[row][col] = { type: "obstacle", texture: tx.obstacle };
  });

  // 新格式：cell_textures 直接覆蓋每格 texture
  if (cell_textures) {
    Object.entries(cell_textures).forEach(([key, tex]) => {
      const [colStr, rowStr] = key.split(",");
      const col = Number(colStr),
        row = Number(rowStr);
      if (finalGrid[row]?.[col])
        finalGrid[row][col].texture = normalizeTex(tex);
    });
  }

  return {
    mapId: map_id || "",
    // 照原值顯示，不補預設值（沒有修改的欄位保存時不送，後端保留原本的格子）
    name: metaText(name),
    chapter: metaText(ch),
    unlockStage: metaText(unlock_stage),
    textures: tx,
    cols: nc,
    rows: nr,
    paths: loadedPaths,
    activePathId: Object.keys(loadedPaths)[0] || "path_a",
    bgTexture: bgTex,
    grid: finalGrid,
  };
}

/** 輸出 JSON 用到的編輯器內容 */
type EditorMapContent = Pick<
  EditorMap,
  | "mapId"
  | "name"
  | "chapter"
  | "unlockStage"
  | "cols"
  | "rows"
  | "paths"
  | "bgTexture"
  | "grid"
>;

/** 編輯器內容 → 地圖 JSON（path_json）；chapter 是寫進 JSON 的章節 */
function mapJsonOf(m: EditorMapContent, chapter: number | string): MapJson {
  const buildZones: number[][] = [];
  const obstacles: number[][] = [];
  const cellTextures: Record<string, string> = {};
  m.grid.forEach((rowArr, rowIdx) =>
    rowArr.forEach((cell, colIdx) => {
      if (cell.type === "build") buildZones.push([colIdx, rowIdx]);
      if (cell.type === "obstacle") obstacles.push([colIdx, rowIdx]);
      cellTextures[`${colIdx},${rowIdx}`] = cell.texture;
    })
  );
  // 向後相容（若只有 path_a 就提取給 waypoints）
  const legacyWaypoints = m.paths["path_a"]
    ? m.paths["path_a"].map(([c, r]) => [c, r])
    : [];
  const spawn = legacyWaypoints[0] ? [...legacyWaypoints[0]] : [];
  const base =
    legacyWaypoints.length > 1
      ? [...legacyWaypoints[legacyWaypoints.length - 1]]
      : [];

  // 過濾掉空的路徑
  const cleanPaths: Record<string, number[][]> = {};
  for (const [pid, pts] of Object.entries(m.paths)) {
    if (pts.length > 0) {
      cleanPaths[pid] = pts.map(([c, r]) => [c, r]);
    }
  }

  return {
    map_id: m.mapId,
    name: m.name,
    chapter,
    unlock_stage: m.unlockStage,
    cols: m.cols,
    rows: m.rows,
    paths: cleanPaths,
    waypoints: legacyWaypoints,
    spawn,
    base,
    build_zones: buildZones,
    obstacles,
    background_texture: m.bgTexture,
    cell_textures: cellTextures,
  };
}

/** 畫面內容的比對字串（地圖與地圖資訊；章節用輸入框的文字）：判斷有沒有尚未保存的修改 */
function editorMapSig(m: EditorMapContent): string {
  return JSON.stringify(mapJsonOf(m, m.chapter));
}

/** get_map_config 的一張地圖 → 地圖 JSON（頂層的地圖資訊優先於 path_json 裡的同名欄位） */
function mapJsonFromConfig(map: Record<string, unknown>, id: string): MapJson {
  const pathJson =
    map.path_json && typeof map.path_json === "object"
      ? (map.path_json as Partial<MapJson>)
      : {};
  return {
    ...pathJson,
    map_id: id,
    name: map.name,
    chapter: map.chapter,
    unlock_stage: map.unlock_stage,
  } as MapJson;
}

// ── GAS 呼叫 ─────────────────────────────────────────────────

async function gasCall(action: string, payload: object) {
  const res = await fetch(SHENMA_SANGUO_GAS_URL, {
    method: "POST",
    body: JSON.stringify({ action, payload }),
  });
  return res.json();
}

/**
 * 設定寫入失敗：unknown 是結果不明（請求送出後連線失敗或回應看不懂，後端可能已經寫入），
 * 其他是確定沒有完成（沒有送出，或後端回了錯誤狀態）
 */
class AdminCallError extends Error {
  constructor(
    message: string,
    readonly unknown: boolean
  ) {
    super(message);
  }
}

/**
 * 設定寫入：帶管理密碼（只在 POST 內容裡，不放網址）。沒有輸入就不送出；
 * 後端拒絕密碼時清掉，下次儲存重新詢問。回傳和 gasCall 相同，錯誤代碼轉成說明文字（AdminCallError）
 */
async function gasAdminCall(action: string, payload: object) {
  const token = await requireAdminToken();
  if (!token) {
    throw new AdminCallError(adminErrorText(ADMIN_TOKEN_MISSING), false);
  }
  let data;
  try {
    data = await gasCall(action, { ...payload, admin_token: token });
  } catch (e) {
    throw new AdminCallError(e instanceof Error ? e.message : String(e), true);
  }
  if (data?.error === "ADMIN_REQUIRED") forgetAdminToken();
  if (data?.status !== 200) {
    throw new AdminCallError(
      adminErrorText(String(data?.error || "儲存失敗")),
      typeof data?.status !== "number"
    );
  }
  return data;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** get_all_maps 的地圖清單（只留有 map_id 的地圖） */
function mapsOf(data: { maps?: unknown }): MapConfig[] {
  return (Array.isArray(data.maps) ? data.maps : []).filter(
    (m): m is MapConfig =>
      !!m && typeof m === "object" && typeof m.map_id === "string"
  );
}

/** 保存後讀回：哪一張地圖、送出的地圖資訊、送出當下的畫面內容 */
interface ReadbackCtx {
  mapId: string;
  /** 送出當下的畫面意圖序號（之後載入、新地圖或匯入時，讀回不再改畫面） */
  intent: number;
  sent: MapMetaFields;
  sentSig: string;
  /** 送出的 path_json（JSON 字串，和讀回的比對） */
  sentPathJson: string;
  /** 後端回報保存成功；false 是寫入結果不明 */
  saved: boolean;
}

/** 波次保存後讀回：哪一張地圖、送出當下畫面上的波次、設定裡應該得到的波次 */
interface WavesReadbackCtx {
  mapId: string;
  intent: number;
  /** 送出當下畫面上的波次（含沒有選敵人、被濾掉的組） */
  sentSig: string;
  /** 送出後設定裡應該有的波次 */
  expectedSig: string;
  /** 被濾掉、沒有保存的組（說明文字） */
  dropped: string;
  /** 後端回報保存成功；false 是寫入結果不明 */
  saved: boolean;
}

type SheetStatus = "idle" | "loading" | "saving" | "ok" | "error";

/** 轉換好的 WebP 素材（只在這個頁面預覽與下載，不會加入素材選單） */
interface ConvertedAsset {
  url: string;
  fileName: string;
  type: "tile" | "map";
  width: number;
  height: number;
  blob: Blob;
}

// ── 主元件 ───────────────────────────────────────────────────

export default function MapTab({
  tileImages = [],
  mapImages = [],
}: {
  tileImages?: string[];
  mapImages?: string[];
}) {
  const [extraTileImages, setExtraTileImages] = useState<string[]>([]);
  const [extraMapImages, setExtraMapImages] = useState<string[]>([]);
  const imageOptions = [
    ...(tileImages.length > 0 ? tileImages : DEFAULT_TILE_IMAGE_OPTIONS),
    ...extraTileImages,
  ];
  const mapImageOptions = [...mapImages, ...extraMapImages];
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
  const [mapListState, setMapListState] = useState<LoadState<MapConfig[]>>({
    status: "idle",
  });
  const mapList = mapListState.status === "loaded" ? mapListState.data : [];
  const listLoading = mapListState.status === "loading";
  const [enemiesState, setEnemiesState] = useState<LoadState<EnemyConfig[]>>({
    status: "idle",
  });
  // 從設定載入的地圖資訊原值（含型別）：沒有修改的欄位不送，後端保留原本的格子
  const [metaOriginal, setMetaOriginal] = useState<MapMetaOriginal | null>(
    null
  );
  const [chapterError, setChapterError] = useState("");
  // 保存後讀回失敗、或寫入結果不明時，可以只讀地重新讀回（不重送寫入）
  const [readbackPending, setReadbackPending] = useState<ReadbackCtx | null>(
    null
  );
  const [wavesReadbackPending, setWavesReadbackPending] =
    useState<WavesReadbackCtx | null>(null);
  // 最後一次從設定載入（或保存後讀回）時的畫面內容：用來顯示「尚未保存的修改」
  const [savedMapSig, setSavedMapSig] = useState<string | null>(null);
  const [savedWavesSig, setSavedWavesSig] = useState<string | null>(null);
  // 畫面是新地圖或匯入的 JSON（設定裡還沒有這些內容）
  const [unsavedDraft, setUnsavedDraft] = useState(false);
  // 畫面意圖的序號：開始載入、套用載入、新地圖、匯入時加一。
  // 在這之前開始的載入或讀回，回來時不再改畫面（較新的選擇與之後的修改不會被舊回應蓋掉）
  const intentSeq = useRef(0);
  // 狀態列的操作序號：較新的操作開始後，較舊操作的結果顯示在「其他操作的結果」
  const statusSeq = useRef(0);
  const readbackSeq = useRef(0);
  const wavesReadSeq = useRef(0);
  const listSeq = useRef(0);
  const enemiesLoading = useRef(false);
  const draftSigRef = useRef("");
  const wavesSigRef = useRef("");
  const mapIdRef = useRef("");
  const [loadingMapId, setLoadingMapId] = useState<string | null>(null);
  const [savingMap, setSavingMap] = useState(false);
  const [readingBack, setReadingBack] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newMapId, setNewMapId] = useState("");
  const [newMapName, setNewMapName] = useState("");
  const [newChapter, setNewChapter] = useState("1");
  const [newUnlockStage, setNewUnlockStage] = useState("");
  const [newCols, setNewCols] = useState(String(DEFAULT_COLS));
  const [newRows, setNewRows] = useState(String(DEFAULT_ROWS));
  const [sheetStatus, setSheetStatus] = useState<SheetStatus>("idle");
  const [sheetMsg, setSheetMsg] = useState("");
  const [sheetAside, setSheetAside] = useState("");
  const [waves, setWaves] = useState<WaveRow[]>([]);
  const enemyOptions =
    enemiesState.status === "loaded"
      ? enemiesState.data
          .map((e) => String(e.enemy_id || e.id || ""))
          .filter(Boolean)
      : [];
  const [waveStatus, setWaveStatus] = useState<
    "idle" | "saving" | "ok" | "error"
  >("idle");
  const [waveMsg, setWaveMsg] = useState("");
  const [importJson, setImportJson] = useState("");
  const [activeCellTexture, setActiveCellTexture] = useState(
    DEFAULT_TEXTURES.road
  );
  const [bgTexture, setBgTexture] = useState("maps/bg_forest.webp");
  const [uploadType, setUploadType] = useState<"tile" | "map">("tile");
  const [pickerCell, setPickerCell] = useState<{
    col: number;
    row: number;
    x: number;
    y: number;
  } | null>(null);
  const [converted, setConverted] = useState<ConvertedAsset | null>(null);
  const [convertStatus, setConvertStatus] = useState<
    "idle" | "converting" | "error"
  >("idle");
  const [convertError, setConvertError] = useState("");
  const [devAddMsg, setDevAddMsg] = useState("");
  const convertedUrlRef = useRef<string | null>(null);
  // 點擊 split button 左側縮圖時彈出的材質選擇器
  const [texPicker, setTexPicker] = useState<{
    key: keyof TileTextures;
    x: number;
    y: number;
  } | null>(null);
  const uploadCanvasRef = useRef<HTMLCanvasElement>(null);
  const isPainting = useRef(false);
  // ref 讓 applyCell callback 永遠讀到最新 textures/activeCellTexture
  const texturesRef = useRef(textures);
  const activeCellTextureRef = useRef(activeCellTexture);
  useEffect(() => {
    texturesRef.current = textures;
  }, [textures]);
  useEffect(() => {
    activeCellTextureRef.current = activeCellTexture;
  }, [activeCellTexture]);
  useEffect(() => {
    if (!pickerCell) return;
    const close = () => setPickerCell(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [pickerCell]);

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

        const tx = texturesRef.current;

        if (tool === "texture") {
          next[row][col] = { ...cell, texture: activeCellTextureRef.current };
          return next;
        }
        if (tool === "erase") {
          let wasRoad = false;
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
              setGrid((g) => {
                const g2 = g.map((r) => r.map((c) => ({ ...c })));
                g2[row][col] = { type: "empty", texture: tx.empty };
                for (const pid in nextP) {
                  nextP[pid].forEach(([c, r], index) => {
                    g2[r][c] = {
                      ...g2[r][c],
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
          next[row][col] = { type: "empty", texture: tx.empty };
          return wasRoad ? prev : next;
        }
        if (tool === "build") {
          if (cell.type === "road") return prev;
          next[row][col] = { type: "build", texture: tx.build };
          return next;
        }
        if (tool === "obstacle") {
          if (cell.type === "road") return prev;
          next[row][col] = { type: "obstacle", texture: tx.obstacle };
          return next;
        }
        if (tool === "waypoint") {
          if (cell.type === "build" || cell.type === "obstacle") return prev;

          setPaths((p) => {
            const currentPath = p[activePathId] || [];
            if (currentPath.length > 0) {
              const last = currentPath[currentPath.length - 1];
              if (last[0] === col && last[1] === row) return p;
            }

            const newPath = [...currentPath, [col, row] as [number, number]];
            const isSpawn = newPath.length === 1;
            setGrid((g) => {
              const g2 = g.map((r) => r.map((c) => ({ ...c })));
              g2[row][col] = {
                type: "road",
                waypointIndex: newPath.length - 1,
                pathId: activePathId,
                texture: isSpawn ? tx.spawn : tx.road,
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

  const draggedCells = useRef(0);
  const mouseDownCell = useRef<{
    col: number;
    row: number;
    x: number;
    y: number;
  } | null>(null);

  const handleMouseDown = (col: number, row: number, e: React.MouseEvent) => {
    draggedCells.current = 0;
    mouseDownCell.current = { col, row, x: e.clientX, y: e.clientY };
    isPainting.current = true;
    // texture tool：先不 apply，等 mouseUp 判斷是點擊還是拖動
    if (tool !== "texture") applyCell(col, row);
  };
  const handleMouseEnter = (col: number, row: number) => {
    if (!isPainting.current) return;
    if (tool !== "waypoint") {
      draggedCells.current++;
      applyCell(col, row);
    }
  };
  const handleMouseUp = () => {
    if (
      tool === "texture" &&
      draggedCells.current === 0 &&
      mouseDownCell.current
    ) {
      setPickerCell(mouseDownCell.current);
    }
    isPainting.current = false;
    mouseDownCell.current = null;
  };
  // ── 素材轉換：在瀏覽器把圖片轉成 WebP，預覽並下載（不上傳；正式網站是靜態網站） ──
  const replaceConverted = (next: ConvertedAsset | null) => {
    if (convertedUrlRef.current) URL.revokeObjectURL(convertedUrlRef.current);
    convertedUrlRef.current = next ? next.url : null;
    setConverted(next);
  };
  useEffect(
    () => () => {
      if (convertedUrlRef.current) URL.revokeObjectURL(convertedUrlRef.current);
    },
    []
  );

  const handleConvertImage = async (file: File, type: "tile" | "map") => {
    const canvas = uploadCanvasRef.current;
    if (!canvas) return;
    replaceConverted(null);
    setDevAddMsg("");
    setConvertError("");
    setConvertStatus("converting");
    const src = URL.createObjectURL(file);
    try {
      const img = document.createElement("img");
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("load"));
        img.src = src;
      });
      if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/webp", 0.9)
      );
      // 不支援 WebP 的瀏覽器會改成 PNG：不能當成 WebP 下載
      if (!blob || blob.type !== "image/webp") throw new Error("webp");
      replaceConverted({
        url: URL.createObjectURL(blob),
        fileName: file.name.replace(/\.[^.]+$/, "") + ".webp",
        type,
        width: canvas.width,
        height: canvas.height,
        blob,
      });
      setConvertStatus("idle");
    } catch (e) {
      setConvertStatus("error");
      setConvertError(
        e instanceof Error && e.message === "webp"
          ? "這個瀏覽器無法轉成 WebP，請改用 Chrome、Edge 或 Firefox"
          : "無法讀取這個檔案（不是圖片，或瀏覽器不支援這種格式），沒有產生素材"
      );
    } finally {
      URL.revokeObjectURL(src);
    }
  };

  // 只在本機開發：把轉換好的素材寫進本機 public（Next 開發伺服器的 api/upload），加入這個頁面的素材選單。
  // 遊戲引擎讀的是 Godot 專案的素材，仍要另外加入並重新匯出
  const handleDevAddAsset = async () => {
    if (!IS_DEV || !converted) return;
    setDevAddMsg("加入中…");
    try {
      const fd = new FormData();
      fd.append("file", converted.blob, converted.fileName);
      fd.append("type", converted.type);
      fd.append("name", converted.fileName);
      const resp = await fetch("/mapEditor/api/upload", {
        method: "POST",
        body: fd,
      });
      const json = await resp.json();
      if (!resp.ok || json.error) throw new Error(json.error || "加入失敗");
      const savedPath: string = json.path; // e.g. "tiles/my_img.webp"
      if (converted.type === "tile") {
        setExtraTileImages((p) =>
          p.includes(savedPath) ? p : [...p, savedPath]
        );
      } else {
        setExtraMapImages((p) =>
          p.includes(savedPath) ? p : [...p, savedPath]
        );
      }
      setDevAddMsg(
        `✓ 已寫進本機 public/images/shenmaSanguo/${savedPath}；遊戲要使用還需加入 Godot 素材並重新匯出`
      );
    } catch (e) {
      setDevAddMsg(`✗ ${errText(e)}`);
    }
  };

  const handleClear = () => {
    setGrid(makeGrid(cols, rows, textures.empty));
    setPaths({ path_a: [] });
    setActivePathId("path_a");
  };

  // ── JSON → Grid（從 Sheet 載入、匯入 JSON 時使用）──
  const loadFromJson = (json: MapJson): EditorMap => {
    const m = editorMapFromJson(json);
    setMapId(m.mapId);
    setMapName(m.name);
    setChapter(m.chapter);
    setUnlockStage(m.unlockStage);
    setChapterError("");
    setTextures(m.textures);
    setCols(m.cols);
    setRows(m.rows);
    setColsInput(String(m.cols));
    setRowsInput(String(m.rows));
    setPaths(m.paths);
    setActivePathId(m.activePathId);
    setBgTexture(m.bgTexture);
    setGrid(m.grid);
    return m;
  };

  // ── 波次操作 ──
  // 敵人設定（波次的敵人選單、地圖資料檢查的每一組判讀）：讀過就不再讀；force 是讀取失敗後的重試
  const handleLoadEnemies = async (force = false) => {
    if (enemiesLoading.current) return;
    if (!force && enemiesState.status === "loaded") return;
    enemiesLoading.current = true;
    setEnemiesState({ status: "loading" });
    try {
      const data = await gasCall("get_enemies_config", {});
      if (data?.status !== 200 || !Array.isArray(data.enemies)) {
        throw new Error(String(data?.error || "讀取失敗"));
      }
      setEnemiesState({
        status: "loaded",
        data: data.enemies as EnemyConfig[],
      });
    } catch (e) {
      setEnemiesState({ status: "error", error: errText(e) });
    } finally {
      enemiesLoading.current = false;
    }
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

  // 回應回來時畫面還是同一張地圖（期間沒有載入、新地圖或匯入，map_id 也沒有改）
  const stillOn = (c: { intent: number; mapId: string }) =>
    intentSeq.current === c.intent && mapIdRef.current === c.mapId;

  // 儲存波次：沒有選敵人的組（與濾完沒有組的波次）不送出；成功後只讀地重新讀回，以讀回的波次為「已保存」的基準
  const handleSaveWaves = async () => {
    const cleanWaves = cleanWavesForSave(waves);
    const ctx: WavesReadbackCtx = {
      mapId,
      intent: intentSeq.current,
      sentSig: wavesSig(waves),
      expectedSig: wavesSig(expectedSavedWaves(cleanWaves)),
      dropped: droppedGroupsText(waves),
      saved: true,
    };
    setWavesReadbackPending(null);
    setWaveStatus("saving");
    setWaveMsg(`「${mapId}」波次儲存中...`);
    try {
      await gasAdminCall("save_waves_config", {
        map_id: mapId,
        waves: cleanWaves,
      });
    } catch (e) {
      setWaveStatus("error");
      if (e instanceof AdminCallError && e.unknown) {
        setWaveMsg(
          `✗ 「${ctx.mapId}」無法確定波次是否已保存（${e.message}）：可能已寫入，也可能沒有；不會自動重送，可以按「重新讀回波次」確認設定裡的波次`
        );
        setWavesReadbackPending({ ...ctx, saved: false });
      } else {
        setWaveMsg(`✗ 「${ctx.mapId}」的波次沒有保存：${errText(e)}`);
      }
      return;
    }
    setWaveMsg(`✓ 「${ctx.mapId}」波次已保存，正在重新讀回…`);
    await readBackWaves(ctx);
  };

  /**
   * 只讀：重新讀回剛才保存的波次，以設定裡實際的波次為「已保存」的基準；不重送寫入。
   * - 期間沒有修改：畫面換成讀回的波次（被濾掉的空白組不會留在畫面上假裝已保存）
   * - 期間又改了波次：保留畫面上的修改，和讀回的內容比較（標示尚未保存）
   * - 已經換成別的地圖：不改畫面
   */
  const readBackWaves = async (ctx: WavesReadbackCtx) => {
    const seq = ++wavesReadSeq.current;
    setWavesReadbackPending(null);
    setWaveStatus("saving");
    let got: WaveRow[];
    try {
      const data = await gasCall("get_map_config", { map_id: ctx.mapId });
      if (data?.status !== 200 || !data.map) {
        throw new Error(String(data?.error || "讀回失敗"));
      }
      got = normalizeWaves(data.map.waves);
    } catch (e) {
      if (seq !== wavesReadSeq.current) return;
      const same = stillOn(ctx);
      // 後端回報成功：設定裡是濾過的內容（畫面上的空白組仍標示尚未保存）
      if (ctx.saved && same) setSavedWavesSig(ctx.expectedSig);
      setWaveStatus("error");
      setWaveMsg(
        ctx.saved
          ? `⚠ 「${ctx.mapId}」波次已保存（後端回報成功），但重新讀回失敗（${errText(e)}）：沒有重送` +
              (ctx.dropped ? `；${ctx.dropped}沒有選敵人，沒有保存` : "") +
              "；可以按「重新讀回波次」再試"
          : `✗ 重新讀回「${ctx.mapId}」的波次失敗（${errText(e)}），仍無法確定這次有沒有保存；沒有重送，可以再按「重新讀回波次」`
      );
      setWavesReadbackPending(ctx);
      return;
    }
    if (seq !== wavesReadSeq.current) return;
    // 已讀取的地圖清單重新讀取（只讀），讓地圖資料檢查顯示保存後的波次
    if (mapListState.status !== "idle") handleLoadMapList();
    const gotSig = wavesSig(got);
    const sameAsSent = gotSig === ctx.expectedSig;
    const same = stillOn(ctx);
    const untouched = same && wavesSigRef.current === ctx.sentSig;
    // 寫入結果不明而且設定和送出的不同：這次沒有生效，畫面保留修改
    const replace = untouched && (ctx.saved || sameAsSent);
    if (same) {
      if (replace) setWaves(got);
      setSavedWavesSig(gotSig);
    }
    const dropped = ctx.dropped
      ? `；${ctx.dropped}沒有選敵人，沒有保存${replace ? "（已從畫面移除）" : ""}`
      : "";
    const elsewhere = "；目前畫面已經不是這張地圖，沒有改變";
    if (!ctx.saved) {
      setWaveStatus(sameAsSent ? "ok" : "error");
      setWaveMsg(
        sameAsSent
          ? `✓ 讀回確認：設定裡「${ctx.mapId}」的波次和這次送出的相同，這次波次已保存${same ? dropped : elsewhere}`
          : `✗ 讀回確認：設定裡「${ctx.mapId}」的波次和這次送出的不同，這次波次保存沒有生效（或已被其他修改蓋過）；沒有重送` +
              (same ? "，畫面保留你的修改" : elsewhere)
      );
      return;
    }
    if (!sameAsSent) {
      setWaveStatus("error");
      setWaveMsg(
        `⚠ 「${ctx.mapId}」波次已保存，但讀回的波次和送出的不同（可能同時有其他修改）` +
          (!same
            ? elsewhere
            : replace
              ? "；畫面已改成設定裡的波次"
              : "；畫面保留你的修改")
      );
      return;
    }
    setWaveStatus("ok");
    setWaveMsg(
      !same
        ? `✓ 「${ctx.mapId}」波次儲存成功並重新讀回${elsewhere}`
        : untouched
          ? `✓ 「${ctx.mapId}」波次儲存成功並重新讀回，畫面和設定一致${dropped}`
          : `✓ 「${ctx.mapId}」波次儲存成功並重新讀回；保存期間你又改了波次，那些修改還沒保存（畫面保留你的修改）${dropped}`
    );
  };

  // ── 輸出 JSON ──
  // 目前畫面的內容（地圖與地圖資訊，尚未保存的修改也在內）
  const editorMap: EditorMapContent = {
    mapId,
    name: mapName,
    chapter,
    unlockStage,
    cols,
    rows,
    paths,
    bgTexture,
    grid,
  };
  const draftSig = editorMapSig(editorMap);
  const draftWavesSig = wavesSig(waves);
  // 非同步的讀取／讀回完成時要比對「當下」的畫面內容
  useEffect(() => {
    draftSigRef.current = draftSig;
    wavesSigRef.current = draftWavesSig;
    mapIdRef.current = mapId;
  }, [draftSig, draftWavesSig, mapId]);
  const mapDirty = savedMapSig !== null && savedMapSig !== draftSig;
  const wavesDirty = savedWavesSig !== null && savedWavesSig !== draftWavesSig;

  // ── 狀態列 ──
  // 操作開始時取得狀態列（清掉上一次其他操作的結果）；結束時若已有較新的操作開始，結果改顯示在「其他操作的結果」
  const beginStatus = (status: SheetStatus, msg: string) => {
    const op = ++statusSeq.current;
    setSheetStatus(status);
    setSheetMsg(msg);
    setSheetAside("");
    return op;
  };
  const endStatus = (op: number, status: SheetStatus, msg: string) => {
    if (op === statusSeq.current) {
      setSheetStatus(status);
      setSheetMsg(msg);
    } else {
      setSheetAside(msg);
    }
  };

  // 畫面換成另一份內容（套用載入、新地圖、匯入）：在這之前開始的載入或讀回，回來時不再改畫面
  const replaceContext = () => {
    intentSeq.current++;
    setLoadingMapId(null);
  };

  // path_json 裡的地圖資訊和保存後的頂層欄位相同（沒有修改的章節是原值）；章節無效時照輸入的文字（不會送出）
  const buildMapJson = (): MapJson => {
    const meta = mapMetaUpdate(metaOriginal, mapId, {
      name: mapName,
      chapter,
      unlockStage,
    });
    const c = meta.ok ? meta.effective.chapter : chapter;
    return mapJsonOf(editorMap, typeof c === "number" ? c : metaText(c));
  };

  // ── 新增地圖（modal 確認後）──
  const handleNewMapConfirm = () => {
    const nc = parseInt(newCols) || 14;
    const nr = parseInt(newRows) || 11;
    const cancelled = loadingMapId;
    replaceContext();
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
    // 新地圖不是從設定載入的：沒有原值（保存時三欄都送出），也沒有「已保存」的內容。
    // 之前保存的重新讀回按鈕標示的是那張地圖，保留（只讀，不改這個畫面）
    setMetaOriginal(null);
    setChapterError("");
    setSavedMapSig(null);
    setSavedWavesSig(null);
    setUnsavedDraft(true);
    setShowNewModal(false);
    beginStatus(
      "ok",
      `✓ 已建立新地圖「${newMapId.trim()}」的草稿（還沒保存到設定）` +
        (cancelled ? `；先前「${cancelled}」的載入已取消，不會套用` : "")
    );
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
  // 地圖清單（含路線與波次，地圖資料檢查用）：只讀，不改編輯中的畫面；同時有兩次讀取時以較晚送出的為準
  const handleLoadMapList = async () => {
    const seq = ++listSeq.current;
    setMapListState({ status: "loading" });
    handleLoadEnemies();
    try {
      const data = await gasCall("get_all_maps", {});
      if (data?.status !== 200 || !Array.isArray(data.maps)) {
        throw new Error(String(data?.error || "載入失敗"));
      }
      if (seq !== listSeq.current) return;
      const list = mapsOf(data);
      setMapListState({ status: "loaded", data: list });
      // 原本選的地圖還在清單裡就保留
      setLoadMapId((cur) =>
        list.some((m) => m.map_id === cur) ? cur : (list[0]?.map_id ?? cur)
      );
    } catch (e) {
      if (seq !== listSeq.current) return;
      // 失敗原因與重試在地圖資料檢查面板（重試成功後不留下舊的錯誤）
      setMapListState({ status: "error", error: errText(e) });
    }
  };

  /**
   * 把設定裡的一張地圖放進編輯器，並記下原值與「已保存」的內容。
   * withWaves 為 false 時不動波次（保存地圖後的讀回不能蓋掉尚未保存的波次）
   */
  const applyLoadedMap = (
    map: Record<string, unknown>,
    id: string,
    withWaves: boolean
  ) => {
    const m = loadFromJson(mapJsonFromConfig(map, id));
    setMetaOriginal({
      mapId: id,
      name: map.name,
      chapter: map.chapter,
      unlock_stage: map.unlock_stage,
    });
    setSavedMapSig(editorMapSig(m));
    setUnsavedDraft(false);
    if (withWaves) {
      const w = normalizeWaves(map.waves);
      setWaves(w);
      setSavedWavesSig(wavesSig(w));
    }
  };

  /**
   * 載入設定裡的一張地圖（使用者按「載入」）。按下時畫面上尚未保存的內容會被取代（訊息會說明）；
   * 等待回應期間如果又改了畫面、建立新地圖或匯入 JSON，回應回來時不套用，保留較新的畫面
   */
  const handleLoadFromSheet = async () => {
    const id = loadMapId;
    const intent = ++intentSeq.current;
    const startSig = `${draftSigRef.current}\n${wavesSigRef.current}`;
    const replacing = mapDirty || wavesDirty || unsavedDraft;
    const op = beginStatus("loading", `「${id}」載入中...`);
    setLoadingMapId(id);
    let map: Record<string, unknown>;
    try {
      const data = await gasCall("get_map_config", { map_id: id });
      if (data?.status !== 200 || !data.map) {
        throw new Error(String(data?.error || "載入失敗"));
      }
      map = data.map;
    } catch (e) {
      // 新地圖、匯入或較新的載入已經取代這次載入：不改畫面與狀態
      if (intent !== intentSeq.current) return;
      setLoadingMapId(null);
      endStatus(
        op,
        "error",
        `✗ 「${id}」載入失敗：${errText(e)}；畫面沒有改變`
      );
      return;
    }
    if (intent !== intentSeq.current) return;
    if (`${draftSigRef.current}\n${wavesSigRef.current}` !== startSig) {
      setLoadingMapId(null);
      endStatus(
        op,
        "error",
        `⚠ 「${id}」已讀到，但等待期間畫面有新的修改，為保留這些修改沒有套用；要換成「${id}」請再按一次「載入」（會取代畫面上尚未保存的內容）`
      );
      return;
    }
    replaceContext();
    applyLoadedMap(map, id, true);
    endStatus(
      op,
      "ok",
      `✓ 「${id}」載入成功` +
        (replacing ? "；原本畫面上尚未保存的內容已被取代" : "")
    );
  };

  /**
   * 只讀：重新讀回剛才保存的地圖（與已讀取的清單），讓畫面和設定一致；不重送寫入。
   * - 保存後開始了載入、建立新地圖或匯入時不改畫面（結果照樣說明）
   * - 保存期間又改了畫面、或寫入結果不明而設定和送出的不同時，保留畫面上的修改（還沒保存）
   * op 是這次保存（或按「重新讀回」）在狀態列的操作序號
   */
  const readBack = async (ctx: ReadbackCtx, op: number) => {
    const seq = ++readbackSeq.current;
    setReadbackPending(null);
    setReadingBack(true);
    let map: Record<string, unknown>;
    try {
      const data = await gasCall("get_map_config", { map_id: ctx.mapId });
      if (data?.status !== 200 || !data.map) {
        throw new Error(String(data?.error || "讀回失敗"));
      }
      map = data.map;
    } catch (e) {
      if (seq !== readbackSeq.current) return;
      setReadingBack(false);
      endStatus(
        op,
        "error",
        ctx.saved
          ? `⚠ 「${ctx.mapId}」已保存（後端回報成功），但重新讀回失敗（${errText(e)}）：` +
              (stillOn(ctx)
                ? "畫面仍是你送出的內容"
                : "目前畫面已經不是這張地圖") +
              "，沒有重送；可以按「重新讀回」再試"
          : `✗ 重新讀回「${ctx.mapId}」失敗（${errText(e)}），仍無法確定這次更新有沒有保存；沒有重送，可以再按「重新讀回」`
      );
      setReadbackPending(ctx);
      return;
    }
    if (seq !== readbackSeq.current) return;
    setReadingBack(false);
    if (mapListState.status !== "idle") handleLoadMapList();

    const diff = metaReadbackDiff(ctx.sent, map);
    const sameAsSent =
      JSON.stringify(map.path_json) === ctx.sentPathJson && diff.length === 0;
    const sameMap = stillOn(ctx);
    const untouched = sameMap && draftSigRef.current === ctx.sentSig;
    // 寫入結果不明而且設定和送出的不同：這次的更新沒有生效，畫面保留修改
    const keepDraft = !untouched || (!ctx.saved && !sameAsSent);
    if (sameMap && !keepDraft) {
      applyLoadedMap(map, ctx.mapId, false);
    } else if (sameMap) {
      // 保留畫面上的修改；原值與「已保存」的內容改成設定裡的
      setMetaOriginal({
        mapId: ctx.mapId,
        name: map.name,
        chapter: map.chapter,
        unlock_stage: map.unlock_stage,
      });
      setSavedMapSig(
        editorMapSig(editorMapFromJson(mapJsonFromConfig(map, ctx.mapId)))
      );
    }

    const elsewhere = "；目前畫面已經不是這張地圖，沒有改變";
    if (!ctx.saved) {
      endStatus(
        op,
        sameAsSent ? "ok" : "error",
        sameAsSent
          ? `✓ 讀回確認：設定裡「${ctx.mapId}」的內容和這次送出的相同，這次更新已保存${sameMap ? "" : elsewhere}`
          : `✗ 讀回確認：設定裡「${ctx.mapId}」的內容和這次送出的不同，這次更新沒有生效（或已被其他修改蓋過）；沒有重送` +
              (sameMap ? "，畫面保留你的修改" : elsewhere)
      );
      return;
    }
    if (!sameAsSent) {
      const detail = diff
        .map((d) => `${META_LABEL[d.field]}是「${d.got}」（送出「${d.sent}」）`)
        .join("、");
      endStatus(
        op,
        "error",
        `⚠ 「${ctx.mapId}」已保存，但讀回的內容和送出的不同${detail ? `：${detail}` : "（地圖內容）"}` +
          (untouched ? "；畫面已改成設定裡的內容" : sameMap ? "" : elsewhere)
      );
      return;
    }
    endStatus(
      op,
      "ok",
      untouched
        ? `✓ 「${ctx.mapId}」已保存並重新讀回，畫面和設定一致`
        : sameMap
          ? `✓ 「${ctx.mapId}」已保存並重新讀回；保存期間你又改了畫面，那些修改還沒保存（畫面保留你的修改）`
          : `✓ 「${ctx.mapId}」已保存並重新讀回${elsewhere}`
    );
  };

  // 更新既有地圖：地圖內容（path_json）和有修改的地圖資訊（頂層的 name／chapter／unlock_stage）一起送出。
  // 章節不是 1 以上的整數時留在畫面上，不問管理密碼、不送出；成功後只讀地重新讀回
  const handleUpdateSheet = async () => {
    const meta = mapMetaUpdate(metaOriginal, mapId, {
      name: mapName,
      chapter,
      unlockStage,
    });
    if (!meta.ok) {
      setChapterError(meta.error);
      setSheetStatus("error");
      setSheetMsg(`✗ ${meta.error}；沒有送出`);
      return;
    }
    setChapterError("");
    setReadbackPending(null);
    const pathJson = buildMapJson();
    const ctx: ReadbackCtx = {
      mapId,
      intent: intentSeq.current,
      sent: meta.fields,
      sentSig: draftSig,
      sentPathJson: JSON.stringify(pathJson),
      saved: true,
    };
    const op = beginStatus("saving", `「${mapId}」更新中...`);
    setSavingMap(true);
    try {
      await gasAdminCall("update_map_config", {
        map_id: mapId,
        path_json: pathJson,
        ...meta.fields,
      });
    } catch (e) {
      setSavingMap(false);
      if (e instanceof AdminCallError && e.unknown) {
        endStatus(
          op,
          "error",
          `✗ 「${ctx.mapId}」無法確定是否已保存（${e.message}）：可能已寫入，也可能沒有；不會自動重送，可以按「重新讀回」確認設定裡的內容`
        );
        setReadbackPending({ ...ctx, saved: false });
      } else {
        endStatus(op, "error", `✗ 「${ctx.mapId}」沒有保存：${errText(e)}`);
      }
      return;
    }
    setSavingMap(false);
    endStatus(op, "loading", `✓ 「${ctx.mapId}」已保存，正在重新讀回…`);
    await readBack(ctx, op);
  };

  const handleCreateSheet = async () => {
    const n = parseChapter(chapter);
    if (n === null) {
      setChapterError(CHAPTER_INVALID);
      setSheetStatus("error");
      setSheetMsg(`✗ ${CHAPTER_INVALID}；沒有送出`);
      return;
    }
    setChapterError("");
    const id = mapId;
    const op = beginStatus("saving", `「${id}」新增中...`);
    setSavingMap(true);
    try {
      await gasAdminCall("create_map_config", {
        map_id: id,
        chapter: n,
        name: mapName,
        unlock_stage: unlockStage,
        path_json: mapJsonOf(editorMap, n),
      });
      endStatus(op, "ok", `✓ 「${id}」新增成功`);
    } catch (e) {
      endStatus(op, "error", `✗ 「${id}」沒有新增：${errText(e)}`);
    } finally {
      setSavingMap(false);
    }
  };

  const mapJsonNow = buildMapJson();
  const standardJson = () => JSON.stringify(mapJsonNow, null, 2);
  const sheetsJson = () => JSON.stringify(mapJsonNow).replace(/"/g, '""');
  const outputText = outputTab === "standard" ? standardJson() : sheetsJson();
  // 地圖資料檢查的「目前畫面」：地圖用畫面的 path_json，波次用畫面上的波次（都還沒保存也照樣檢查）
  const draftConfig = {
    map_id: mapId,
    name: mapName,
    chapter: mapJsonNow.chapter,
    unlock_stage: unlockStage,
    path_json: mapJsonNow,
    waves,
  } as unknown as MapConfig;

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
      const cancelled = loadingMapId;
      const m = loadFromJson(targetJson);
      replaceContext();
      // 匯入的 JSON 不是從設定載入的：沒有原值（保存時三欄都送出），也沒有「已保存」的內容
      setMetaOriginal(null);
      setSavedMapSig(null);
      setUnsavedDraft(true);
      beginStatus(
        "ok",
        `✓ 匯入成功：「${m.mapId}」（還沒保存到設定）` +
          (cancelled ? `；先前「${cancelled}」的載入已取消，不會套用` : "")
      );
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
        {/* 航點 / 防禦區 / 障礙物：split button（左=材質，右=工具）*/}
        {(
          [
            { id: "waypoint", label: "🚩 航點", texKey: "road" },
            { id: "build", label: "🟩 防禦區", texKey: "build" },
            { id: "obstacle", label: "⬛ 障礙物", texKey: "obstacle" },
          ] as { id: Tool; label: string; texKey: keyof TileTextures }[]
        ).map(({ id, label, texKey }) => (
          <div
            key={id}
            className={`${styles.splitBtn} ${tool === id ? styles.splitBtnActive : ""}`}
          >
            {/* 左半：材質縮圖，點擊彈出 popup 更換此工具的預設材質縮圖 */}
            <button
              className={styles.splitBtnTex}
              title={`點擊更換 ${label.replace(/^\S+\s/, "")} 預設材質縮圖`}
              type="button"
              onClick={(e) => {
                const rect = (
                  e.currentTarget as HTMLButtonElement
                ).getBoundingClientRect();
                setTexPicker({ key: texKey, x: rect.left, y: rect.bottom });
              }}
            >
              <Image
                src={`/images/shenmaSanguo/${textures[texKey]}`}
                alt={texKey}
                width={18}
                height={18}
                style={{ imageRendering: "pixelated", objectFit: "cover" }}
                unoptimized
              />
            </button>
            {/* 右半：切換工具 */}
            <button
              className={`${styles.splitBtnMain} ${tool === id ? styles.splitBtnMainActive : ""}`}
              type="button"
              onClick={() => setTool(id)}
            >
              {label}
            </button>
          </div>
        ))}
        {/* 清除 / 格子貼圖：維持原本按鈕 */}
        {(
          [
            { id: "erase", label: "🧹 清除" },
            { id: "texture", label: "🎨 格子貼圖" },
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

      {/* ── 地圖背景貼圖選取列（常駐顯示）── */}
      <div className={styles.bgTextureBar}>
        <span className={styles.toolLabel}>地圖背景：</span>
        {mapImageOptions.map((img) => (
          <button
            key={img}
            className={`${styles.textureOption} ${bgTexture === img ? styles.textureOptionSelected : ""}`}
            onClick={() => setBgTexture(img)}
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

      {/* ── 出生點材質選取列 ── */}
      <div className={styles.bgTextureBar}>
        <span className={styles.toolLabel}>出生點：</span>
        {imageOptions.map((img) => (
          <button
            key={img}
            className={`${styles.textureOption} ${textures.spawn === img ? styles.textureOptionSelected : ""}`}
            onClick={() => setTextures((t) => ({ ...t, spawn: img }))}
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

      {/* ── 基地（終點）材質選取列 ── */}
      <div className={styles.bgTextureBar}>
        <span className={styles.toolLabel}>基地：</span>
        {imageOptions.map((img) => (
          <button
            key={img}
            className={`${styles.textureOption} ${textures.base === img ? styles.textureOptionSelected : ""}`}
            onClick={() => setTextures((t) => ({ ...t, base: img }))}
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

      {/* ── 素材轉換：轉成 WebP 預覽並下載（正式網站不能上傳；新素材要加入遊戲並發布才能使用）── */}
      <div className={styles.uploadBar} data-testid="asset-convert">
        <span className={styles.toolLabel}>素材轉換：</span>
        <div className={styles.uploadTypeGroup}>
          <label
            className={`${styles.uploadTypeBtn} ${uploadType === "tile" ? styles.uploadTypeBtnActive : ""}`}
          >
            <input
              type="radio"
              name="uploadType"
              value="tile"
              checked={uploadType === "tile"}
              onChange={() => setUploadType("tile")}
              style={{ display: "none" }}
            />
            🖼️ 格子貼圖
          </label>
          <label
            className={`${styles.uploadTypeBtn} ${uploadType === "map" ? styles.uploadTypeBtnActive : ""}`}
          >
            <input
              type="radio"
              name="uploadType"
              value="map"
              checked={uploadType === "map"}
              onChange={() => setUploadType("map")}
              style={{ display: "none" }}
            />
            🗺️ 地圖背景
          </label>
        </div>
        <label className={styles.uploadFileBtn}>
          {convertStatus === "converting" ? "⏳ 轉換中…" : "＋ 選擇圖片"}
          <input
            type="file"
            accept="image/*"
            className={styles.visuallyHiddenInput}
            data-testid="asset-convert-input"
            disabled={convertStatus === "converting"}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleConvertImage(f, uploadType);
              e.target.value = "";
            }}
          />
        </label>
        <span className={styles.uploadHint}>
          在瀏覽器轉成 WebP 後下載（不會上傳）
        </span>
        {convertStatus === "error" && (
          <div
            className={styles.assetError}
            role="alert"
            data-testid="asset-convert-error"
          >
            ✗ {convertError}
          </div>
        )}
        {converted && (
          <div
            className={styles.assetResult}
            data-testid="asset-convert-result"
          >
            <Image
              src={converted.url}
              alt={`轉換後的預覽：${converted.fileName}`}
              width={48}
              height={48}
              className={styles.assetPreview}
              unoptimized
            />
            <span className={styles.assetInfo}>
              {converted.fileName}（{converted.width}×{converted.height}，
              {Math.max(1, Math.round(converted.blob.size / 1024))} KB）
            </span>
            <a
              className={styles.uploadFileBtn}
              href={converted.url}
              download={converted.fileName}
              data-testid="asset-convert-download"
            >
              ⬇ 下載 WebP
            </a>
            {IS_DEV && (
              <button
                type="button"
                className={styles.toolBtn}
                onClick={handleDevAddAsset}
                data-testid="asset-dev-add"
              >
                加入開發素材（本機）
              </button>
            )}
            <span
              className={styles.uploadHint}
              data-testid="asset-convert-hint"
            >
              這個素材還沒加入遊戲：下載後要放進遊戲素材的
              {converted.type === "tile"
                ? "格子貼圖（tiles）"
                : "地圖背景（maps）"}
              並重新發布，才會出現在素材選單、才能用在地圖上。
            </span>
            {devAddMsg && (
              <span className={styles.uploadHint}>{devAddMsg}</span>
            )}
          </div>
        )}
      </div>

      {/* ── 主體 ── */}
      <div className={styles.editorBody}>
        {/* 格子 + 波次（左欄） */}
        <div className={styles.gridCol}>
          <div
            className={styles.gridWrap}
            onMouseUp={() => handleMouseUp()}
            onMouseLeave={() => handleMouseUp()}
            style={{
              backgroundImage: bgTexture.startsWith("maps/")
                ? `url(/images/shenmaSanguo/${bgTexture})`
                : undefined,
              backgroundSize: "cover",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            }}
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

                  const labelStr = cellLabel(cell, paths, colIdx, rowIdx);
                  const cellTex =
                    labelStr === "S"
                      ? textures.spawn
                      : labelStr === "E"
                        ? textures.base
                        : getCellTexture(cell);

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
                        backgroundImage: `url(/images/shenmaSanguo/${cellTex})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        opacity: dynamicOpacity,
                        outline: isActivePath ? "2px solid #ff7b00" : "none",
                        outlineOffset: "-2px",
                        zIndex: isActivePath ? 2 : 1,
                      }}
                      onMouseDown={(e) => handleMouseDown(colIdx, rowIdx, e)}
                      onMouseEnter={() => handleMouseEnter(colIdx, rowIdx)}
                      title={`[${colIdx},${rowIdx}]`}
                    >
                      {labelStr}
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
                role="status"
                data-testid="wave-status"
              >
                {waveMsg}
              </div>
            )}
            {wavesReadbackPending && (
              <button
                type="button"
                className={`${styles.toolBtn} mb-2`}
                onClick={() => readBackWaves(wavesReadbackPending)}
                disabled={waveStatus === "saving"}
                data-testid="waves-readback-retry"
              >
                重新讀回「{wavesReadbackPending.mapId}」的波次（只讀，不重送）
              </button>
            )}

            {waves.length === 0 && (
              <div style={{ fontSize: "0.78rem", color: "#9ca3af" }}>
                尚無波次，點擊「＋ 新增波次」開始設定。
              </div>
            )}

            {waves.map((wave, wi) => (
              <div key={wi} className={styles.waveItem} data-testid="wave-item">
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
                              {/* 還沒選、或不在敵人設定裡的值照實顯示（不顯示成第一個敵人；沒有選敵人的組不會保存） */}
                              {!enemyOptions.includes(enemy.enemy_id) && (
                                <option value={enemy.enemy_id}>
                                  {enemy.enemy_id.trim()
                                    ? `${enemy.enemy_id}（不在敵人設定）`
                                    : "（未選擇敵人）"}
                                </option>
                              )}
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
          <div className={styles.panelCard} data-testid="map-meta">
            <div className={styles.panelTitle}>地圖資訊</div>
            {(
              [
                { key: "map_id", label: "map_id", val: mapId, set: setMapId },
                { key: "name", label: "名稱", val: mapName, set: setMapName },
                {
                  key: "chapter",
                  label: "章節",
                  val: chapter,
                  set: (v: string) => {
                    setChapter(v);
                    setChapterError("");
                  },
                },
                {
                  key: "unlock_stage",
                  label: "解鎖條件",
                  val: unlockStage,
                  set: setUnlockStage,
                },
              ] as {
                key: string;
                label: string;
                val: string;
                set: (v: string) => void;
              }[]
            ).map(({ key, label, val, set }) => {
              const invalid = key === "chapter" && !!chapterError;
              return (
                <div key={key} className={styles.metaRow}>
                  <label
                    className={styles.metaLabel}
                    htmlFor={`map-meta-${key}`}
                  >
                    {label}
                  </label>
                  <input
                    id={`map-meta-${key}`}
                    className={`${styles.metaInput} ${invalid ? styles.metaInputInvalid : ""}`}
                    value={val}
                    inputMode={key === "chapter" ? "numeric" : undefined}
                    aria-invalid={invalid || undefined}
                    aria-describedby={
                      invalid
                        ? "map-meta-chapter-error"
                        : key === "unlock_stage"
                          ? "map-meta-unlock-hint"
                          : undefined
                    }
                    onChange={(e) => set(e.target.value)}
                  />
                </div>
              );
            })}
            {chapterError && (
              <div
                id="map-meta-chapter-error"
                className={styles.metaError}
                role="alert"
                data-testid="map-meta-chapter-error"
              >
                {chapterError}
              </div>
            )}
            <div id="map-meta-unlock-hint" className={styles.metaHint}>
              解鎖條件只記錄在設定表：遊戲目前依關卡順序（map_id）與玩家的進度解鎖，改這一欄不會改變遊戲的解鎖順序。
            </div>
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
                    aria-label="要載入的地圖"
                    data-testid="sheet-map-select"
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
                  disabled={loadingMapId !== null}
                >
                  載入
                </button>
              </div>
              <div className={styles.sheetBtnRow}>
                <button
                  className={styles.toolBtn}
                  onClick={handleUpdateSheet}
                  disabled={savingMap}
                  style={{ flex: 1 }}
                >
                  更新至 Sheet
                </button>
                <button
                  className={styles.toolBtn}
                  onClick={handleCreateSheet}
                  disabled={savingMap}
                  style={{ flex: 1 }}
                >
                  新增至 Sheet
                </button>
              </div>
              {sheetMsg && (
                <div
                  className={`${styles.sheetStatus} ${statusClass}`}
                  role="status"
                  data-testid="sheet-status"
                >
                  {sheetMsg}
                </div>
              )}
              {sheetAside && (
                <div
                  className={styles.sheetAside}
                  role="status"
                  data-testid="sheet-status-aside"
                >
                  其他操作的結果：{sheetAside}
                </div>
              )}
              {readbackPending && (
                <button
                  type="button"
                  className={styles.toolBtn}
                  onClick={() =>
                    readBack(
                      readbackPending,
                      beginStatus(
                        "loading",
                        `重新讀回「${readbackPending.mapId}」中...`
                      )
                    )
                  }
                  disabled={readingBack}
                  data-testid="map-readback-retry"
                >
                  重新讀回「{readbackPending.mapId}」（只讀，不重送）
                </button>
              )}
            </div>
          </div>

          {/* 地圖資料檢查（路線、波次是否齊全） */}
          <MapIntegrityPanel
            list={mapListState}
            enemies={enemiesState}
            selectedId={loadMapId}
            onSelect={setLoadMapId}
            onReloadList={handleLoadMapList}
            onReloadEnemies={() => handleLoadEnemies(true)}
            draft={draftConfig}
            draftLoaded={savedMapSig !== null}
            draftMapDirty={mapDirty}
            draftWavesDirty={wavesDirty}
          />

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

      {/* ── 格子材質選擇器 popup（fixed，不受 overflow 裁切）── */}
      {pickerCell &&
        (() => {
          const POPUP_W = 200;
          const POPUP_H = 160;
          const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
          const vh = typeof window !== "undefined" ? window.innerHeight : 800;
          const left = Math.min(pickerCell.x + 8, vw - POPUP_W - 8);
          const top =
            pickerCell.y + 8 + POPUP_H > vh
              ? pickerCell.y - POPUP_H - 8
              : pickerCell.y + 8;
          return (
            <div
              className={styles.cellPicker}
              style={{ position: "fixed", left, top }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span className={styles.cellPickerTitle}>
                  [{pickerCell.col}, {pickerCell.row}] 選擇材質
                </span>
                <button
                  className={styles.cellPickerClose}
                  onClick={() => setPickerCell(null)}
                >
                  ✕
                </button>
              </div>
              <div className={styles.cellPickerGrid}>
                {imageOptions.map((img) => (
                  <button
                    key={img}
                    className={`${styles.textureOption} ${
                      grid[pickerCell.row]?.[pickerCell.col]?.texture === img
                        ? styles.textureOptionSelected
                        : ""
                    }`}
                    title={img}
                    type="button"
                    onClick={() => {
                      setGrid((prev) => {
                        const next = prev.map((r) => r.map((c) => ({ ...c })));
                        next[pickerCell.row][pickerCell.col] = {
                          ...next[pickerCell.row][pickerCell.col],
                          texture: img,
                        };
                        return next;
                      });
                      setActiveCellTexture(img);
                      setPickerCell(null);
                    }}
                  >
                    <Image
                      src={`/images/shenmaSanguo/${img}`}
                      alt={img}
                      width={28}
                      height={28}
                      style={{
                        imageRendering: "pixelated",
                        objectFit: "cover",
                      }}
                      unoptimized
                    />
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

      {/* ── Split Button 材質縮圖選擇 popup ── */}
      {texPicker &&
        (() => {
          const POPUP_W = 224;
          const POPUP_H = 188;
          const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
          const vh = typeof window !== "undefined" ? window.innerHeight : 800;
          const left = Math.min(texPicker.x, vw - POPUP_W - 8);
          const top =
            texPicker.y + 6 + POPUP_H > vh
              ? texPicker.y - POPUP_H - 6
              : texPicker.y + 6;
          return (
            <div
              className={styles.cellPicker}
              style={{ position: "fixed", left, top }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span className={styles.cellPickerTitle}>
                  更換縮圖（{texPicker.key}）
                </span>
                <button
                  className={styles.cellPickerClose}
                  onClick={() => setTexPicker(null)}
                >
                  ✕
                </button>
              </div>
              <div className={styles.cellPickerGrid}>
                {imageOptions.map((img) => (
                  <button
                    key={img}
                    className={`${styles.textureOption} ${textures[texPicker.key] === img ? styles.textureOptionSelected : ""}`}
                    title={img}
                    type="button"
                    onClick={() => {
                      setTextures((t) => ({ ...t, [texPicker.key]: img }));
                      setActiveCellTexture(img);
                      setTexPicker(null);
                    }}
                  >
                    <Image
                      src={`/images/shenmaSanguo/${img}`}
                      alt={img}
                      width={28}
                      height={28}
                      style={{
                        imageRendering: "pixelated",
                        objectFit: "cover",
                      }}
                      unoptimized
                    />
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

      {/* hidden canvas for webp conversion */}
      <canvas ref={uploadCanvasRef} style={{ display: "none" }} />
    </>
  );
}
