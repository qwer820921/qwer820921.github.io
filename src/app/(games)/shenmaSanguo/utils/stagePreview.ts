import { EnemyConfig, MapConfig } from "../types";
import { MovementInfo, movementOf } from "./antiAir";

/**
 * 關卡敵軍預覽（唯讀）：只用已載入的 maps[].waves、enemiesConfig 與關卡的路線資料，不打任何 API。
 * 出兵規則照 Godot 實際的做法，預覽才不會和戰場上的出兵不同：
 * - 波數＝waves 裡最大的 wave 編號（Main._count_waves），依序打第 1～N 波；
 *   某一波沒有資料，或那一波沒有任何可出兵的組時，遊戲會拒絕開始那一波（BattleManager._reject_wave）
 * - 同一個編號有多筆時只用第一筆（WaveManager.plan_wave）
 * - 每一組依序檢查，不符合就整組略過：enemy_id 空白（GAS 的空白列）→ 找不到敵人設定 → 路線沒有路點 →
 *   飛行路線無效（飛行敵人的路線只有一個路點，或起點和終點是同一格）→ 地面路線沒有路程（地面敵人的路線只有一個路點，
 *   或所有路點在同一格；起終點同格但中間有路程的環狀路線照常）→ 數量 ≤ 0（WaveManager.plan_wave）；
 *   沒有提供數量時遊戲以 1 隻計、沒有路線時用 path_a、沒有間隔時是 1 秒
 * 資料裡沒有的敵人能力不推定；數量無法判讀時不給確定的總數
 * 移動方式（movement_type）照遊戲的判讀（utils/antiAir）：只有 flying 是飛行，其他都當作地面，遊戲不認得的寫法另外註明
 */

/** 組在戰場上的結果：出兵、遊戲會略過、無法判斷 */
export type GroupOutcome = "spawn" | "skip" | "unknown";

/**
 * 飛行路線無效的原因（和 Godot WaveManager 的原因代碼相同）：只有一個路點、起點和終點是同一格。
 * 飛行敵人從起點直線飛到終點，這兩種一出現就在終點，遊戲不出兵
 */
export type FlightProblem = "flight_single_point" | "flight_same_endpoints";

/**
 * 地面路線沒有路程的原因（和 Godot WaveManager 的原因代碼相同）：只有一個路點、所有路點在同一格（總路程 0）。
 * 地面敵人沿路點依序走，這兩種一出現就抵達終點，遊戲不出兵
 */
export type GroundProblem = "ground_single_point" | "ground_zero_length";

/** 路點的格子座標（和 Godot 的 Vector2i(int(x), int(y)) 相同）；無法確定 Godot 的結果時是 null */
export type GridPoint = readonly [number, number] | null;

export interface PreviewGroup {
  /** 這一波的第幾組（從 1 開始，包含空白列） */
  index: number;
  enemyId: string;
  /** 敵人設定的名稱；找不到設定時是 null */
  name: string | null;
  /** 會出兵的隻數；遊戲會略過或無法判讀時是 null */
  count: number | null;
  path: string;
  hp: number | null;
  speed: number | null;
  /** 每隻之間的出兵間隔（秒） */
  interval: number | null;
  /** 移動方式（遊戲的判讀）；找不到敵人設定時是 null */
  movement: MovementInfo | null;
  outcome: GroupOutcome;
  /** 飛行路線無效（遊戲會略過這一組）；地面組、路線有效或無法判讀時是 null */
  flightProblem: FlightProblem | null;
  /** 地面路線沒有路程（遊戲會略過這一組）；飛行組、路線有效或無法判讀時是 null */
  groundProblem: GroundProblem | null;
  /** 資料不完整或遊戲會略過的原因（顯示用） */
  notes: string[];
}

export interface PreviewWave {
  wave: number;
  /** 關卡資料裡沒有這一波 */
  missing: boolean;
  groups: PreviewGroup[];
  /** 略過的空白列數（GAS 的空白列，不是敵人） */
  blankRows: number;
  /** 這一波確定的出兵隻數；無法確定或遊戲會拒絕這一波時是 null */
  total: number | null;
  /** 遊戲會拒絕開始這一波（沒有資料，或沒有任何可出兵的組） */
  rejected: boolean;
  /** 有資料不完整的組（略過、無法判讀或用了遊戲的預設值） */
  incomplete: boolean;
  /** 同一個編號有多筆資料（遊戲只用第一筆） */
  duplicates: number;
}

export interface StagePreview {
  waves: PreviewWave[];
  /** 關卡的路線（有路點的） */
  pathIds: string[];
  /** 全關確定的出兵隻數；有任何一波無法確定或會被拒絕時是 null */
  total: number | null;
  /** 這一關會出現飛行敵人（有出兵或數量無法確定的組是飛行） */
  flying: boolean;
  /** 關卡本身的問題（例如沒有波次資料） */
  problems: string[];
}

const finiteOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** 和 Godot 的 int() 相同的整數：數字取整數部分、純整數字串；其他（無法確定 Godot 的結果）回傳 null */
function toInt(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : null;
  if (typeof v === "string" && /^\s*[+-]?\d+\s*$/.test(v))
    return parseInt(v, 10);
  return null;
}

const isPoint = (p: unknown): boolean => Array.isArray(p) && p.length >= 2;

/** 一個路點的格子座標：座標必須是 Godot 的 int() 結果確定的值（數字取整數部分、純整數字串），否則 null */
function gridPoint(wp: unknown): GridPoint {
  if (!isPoint(wp)) return null;
  const x = toInt((wp as unknown[])[0]);
  const y = toInt((wp as unknown[])[1]);
  return x === null || y === null ? null : [x, y];
}

/**
 * 關卡每條路線的路點（格子座標）：和 GameMap._parse_path_json 相同（paths 物件、paths 陣列視為 path_a、舊版 waypoints）。
 * 只列出有路點的路線
 */
export function stagePathPoints(
  pathJson: unknown
): Record<string, GridPoint[]> {
  let pj = pathJson;
  if (typeof pj === "string") {
    try {
      pj = JSON.parse(pj);
    } catch {
      return {};
    }
  }
  if (!pj || typeof pj !== "object" || Array.isArray(pj)) return {};
  const o = pj as Record<string, unknown>;
  const out: Record<string, GridPoint[]> = {};
  if ("paths" in o) {
    const paths = o.paths;
    if (Array.isArray(paths)) {
      // 陣列格式：只取 [x, y] 形式的點（其他元素遊戲會跳過）
      const pts = paths.filter(isPoint);
      if (pts.length > 0) out.path_a = pts.map(gridPoint);
    } else if (paths && typeof paths === "object") {
      for (const [id, pts] of Object.entries(
        paths as Record<string, unknown>
      )) {
        if (Array.isArray(pts) && pts.length > 0) out[id] = pts.map(gridPoint);
      }
    }
    return out;
  }
  if (Array.isArray(o.waypoints) && o.waypoints.length > 0) {
    out.path_a = o.waypoints.map(gridPoint);
  }
  return out;
}

/** 關卡的路線（有路點的） */
export function stagePathIds(pathJson: unknown): string[] {
  return Object.keys(stagePathPoints(pathJson));
}

/**
 * 飛行路線的問題：只有一個路點 → flight_single_point；起點和終點是同一格 → flight_same_endpoints（格子相同，
 * 遊戲換算成像素也相同；不同格至少差一格，不會被當成同一個位置）。起點或終點的座標無法判讀時回傳 "unknown"
 */
export function flightRouteProblem(
  points: GridPoint[]
): FlightProblem | "unknown" | null {
  if (points.length < 2) return "flight_single_point";
  const a = points[0];
  const b = points[points.length - 1];
  if (a === null || b === null) return "unknown";
  return a[0] === b[0] && a[1] === b[1] ? "flight_same_endpoints" : null;
}

/** 飛行路線無效的說明（預覽、對空提醒、拒絕開戰的提示共用） */
export function flightProblemText(problem: FlightProblem): string {
  return problem === "flight_single_point"
    ? "飛行路線只有一個路點"
    : "飛行路線的起點和終點是同一格";
}

/**
 * 地面路線的問題：只有一個路點 → ground_single_point；所有路點在同一格（沿路點走的總路程為 0）→ ground_zero_length。
 * 不看起點和終點：只要有兩個路點不同格，總路程就至少是這兩點的距離（不同格至少差一格），環狀路線照常。
 * 有座標無法判讀、而且能判讀的路點都在同一格時回傳 "unknown"（無法判讀的點可能在別格，不猜）
 */
export function groundRouteProblem(
  points: GridPoint[]
): GroundProblem | "unknown" | null {
  if (points.length < 2) return "ground_single_point";
  const known = points.filter((p): p is readonly [number, number] => !!p);
  if (known.some((p) => p[0] !== known[0][0] || p[1] !== known[0][1])) {
    return null;
  }
  return known.length < points.length ? "unknown" : "ground_zero_length";
}

/** 地面路線沒有路程的說明（預覽、拒絕開戰的提示共用） */
export function groundProblemText(problem: GroundProblem): string {
  return problem === "ground_single_point"
    ? "地面路線只有一個路點"
    : "地面路線的路點都在同一格（沒有路程）";
}

function previewGroup(
  raw: unknown,
  index: number,
  enemies: EnemyConfig[],
  paths: Record<string, GridPoint[]>
): PreviewGroup | "blank" {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const enemyId = g.enemy_id == null ? "" : String(g.enemy_id).trim();
  if (enemyId === "") return "blank";
  const cfg = enemies.find((e) => String(e.enemy_id) === enemyId) ?? null;
  const path = g.path === undefined ? "path_a" : String(g.path);
  const notes: string[] = [];
  let outcome: GroupOutcome = "spawn";
  let flightProblem: FlightProblem | null = null;
  let groundProblem: GroundProblem | null = null;
  const movement = cfg ? movementOf(cfg.movement_type) : null;

  if (!cfg) {
    notes.push(`找不到敵人設定「${enemyId}」，遊戲會略過這一組`);
    outcome = "skip";
  } else if (!Object.keys(paths).includes(path)) {
    notes.push(`路線「${path}」沒有路點，遊戲會略過這一組`);
    outcome = "skip";
  } else if (movement?.value === "flying") {
    // 飛行敵人從路線的起點直線飛到終點：只有一個路點、或起點和終點是同一格時一出現就在終點，遊戲不出兵
    const problem = flightRouteProblem(paths[path]);
    if (problem === "unknown") {
      notes.push(
        `路線「${path}」的起點或終點座標無法判讀，無法確定飛行敵人能不能出兵`
      );
      outcome = "unknown";
    } else if (problem) {
      flightProblem = problem;
      notes.push(
        `${flightProblemText(problem)}（路線「${path}」）：飛行敵人從起點直線飛到終點，這樣一出現就在終點，遊戲會略過這一組`
      );
      outcome = "skip";
    }
  } else {
    // 地面敵人沿路點依序走：只有一個路點、或所有路點在同一格時一出現就抵達終點，遊戲不出兵
    const problem = groundRouteProblem(paths[path]);
    if (problem === "unknown") {
      notes.push(`路線「${path}」有座標無法判讀，無法確定地面敵人能不能出兵`);
      outcome = "unknown";
    } else if (problem) {
      groundProblem = problem;
      notes.push(
        `${groundProblemText(problem)}（路線「${path}」）：地面敵人沿路點走，這樣一出現就抵達終點，遊戲會略過這一組`
      );
      outcome = "skip";
    }
  }

  let count: number | null = null;
  if (g.count === undefined) {
    count = 1;
    notes.push("沒有提供數量，遊戲以 1 隻計");
  } else {
    count = toInt(g.count);
    if (count === null) {
      notes.push("數量無法判讀，無法確定會出幾隻");
      if (outcome === "spawn") outcome = "unknown";
    }
  }
  if (count !== null && count <= 0 && outcome === "spawn") {
    notes.push(`數量是 ${count}，遊戲會略過這一組`);
    outcome = "skip";
  }

  const intervalRaw = g.interval === undefined ? 1 : g.interval;
  const interval =
    typeof intervalRaw === "number" && Number.isFinite(intervalRaw)
      ? Math.max(0, intervalRaw)
      : null;
  if (g.interval === undefined) notes.push("沒有提供出兵間隔，遊戲以 1 秒計");

  const hp = cfg ? finiteOrNull(cfg.hp) : null;
  const speed = cfg ? finiteOrNull(cfg.speed) : null;
  if (cfg && hp === null) notes.push("敵人設定沒有提供血量");
  if (cfg && speed === null) notes.push("敵人設定沒有提供移動速度");
  if (movement && !movement.known) {
    notes.push(
      `移動方式「${movement.raw}」不是遊戲的寫法，遊戲當作${movement.label}`
    );
  }

  return {
    index,
    enemyId,
    name: cfg ? String(cfg.name ?? enemyId) : null,
    count: outcome === "spawn" ? count : null,
    path,
    hp,
    speed,
    interval,
    movement,
    outcome,
    flightProblem,
    groundProblem,
    notes,
  };
}

export function buildStagePreview(
  map: MapConfig,
  enemies: EnemyConfig[]
): StagePreview {
  const paths = stagePathPoints(map.path_json);
  const pathIds = Object.keys(paths);
  const rawWaves: unknown[] = Array.isArray(map.waves) ? map.waves : [];
  const problems: string[] = [];
  if (rawWaves.length === 0) problems.push("關卡資料沒有提供波次");
  if (pathIds.length === 0) problems.push("關卡資料沒有可用的路線");

  const numOf = (w: unknown) =>
    w && typeof w === "object"
      ? toInt((w as Record<string, unknown>).wave)
      : null;
  const unreadable = rawWaves.filter((w) => numOf(w) === null).length;
  if (unreadable > 0) {
    problems.push(`有 ${unreadable} 筆波次的編號無法判讀`);
  }
  const maxWave = rawWaves.reduce<number>(
    (m, w) => Math.max(m, numOf(w) ?? 0),
    0
  );

  const waves: PreviewWave[] = [];
  for (let n = 1; n <= maxWave; n++) {
    const same = rawWaves.filter((w) => numOf(w) === n);
    const first = same[0] as Record<string, unknown> | undefined;
    if (!first) {
      waves.push({
        wave: n,
        missing: true,
        groups: [],
        blankRows: 0,
        total: null,
        rejected: true,
        incomplete: true,
        duplicates: 0,
      });
      continue;
    }
    const list: unknown[] = Array.isArray(first.enemies) ? first.enemies : [];
    const groups: PreviewGroup[] = [];
    let blankRows = 0;
    list.forEach((raw, i) => {
      const g = previewGroup(raw, i + 1, enemies, paths);
      if (g === "blank") blankRows += 1;
      else groups.push(g);
    });
    const spawning = groups.filter((g) => g.outcome === "spawn");
    const unknown = groups.some((g) => g.outcome === "unknown");
    const rejected = !unknown && spawning.length === 0;
    waves.push({
      wave: n,
      missing: false,
      groups,
      blankRows,
      total:
        unknown || rejected
          ? null
          : spawning.reduce((s, g) => s + (g.count ?? 0), 0),
      rejected,
      incomplete: groups.some((g) => g.notes.length > 0) || rejected,
      duplicates: same.length - 1,
    });
  }

  const total =
    waves.length > 0 && waves.every((w) => w.total !== null)
      ? waves.reduce((s, w) => s + (w.total ?? 0), 0)
      : null;
  const flying = waves.some(
    (w) =>
      !w.rejected &&
      w.groups.some(
        (g) => g.outcome !== "skip" && g.movement?.value === "flying"
      )
  );
  return { waves, pathIds, total, flying, problems };
}
