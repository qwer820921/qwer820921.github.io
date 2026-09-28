import { EnemyConfig, MapConfig } from "../types";

/**
 * 關卡敵軍預覽（唯讀）：只用已載入的 maps[].waves、enemiesConfig 與關卡的路線資料，不打任何 API。
 * 出兵規則照 Godot 實際的做法，預覽才不會和戰場上的出兵不同：
 * - 波數＝waves 裡最大的 wave 編號（Main._count_waves），依序打第 1～N 波；
 *   某一波沒有資料，或那一波沒有任何可出兵的組時，遊戲會拒絕開始那一波（BattleManager._reject_wave）
 * - 同一個編號有多筆時只用第一筆（WaveManager.plan_wave）
 * - 每一組依序檢查，不符合就整組略過：enemy_id 空白（GAS 的空白列）→ 找不到敵人設定 → 路線沒有路點 → 數量 ≤ 0；
 *   沒有提供數量時遊戲以 1 隻計、沒有路線時用 path_a、沒有間隔時是 1 秒
 * 資料裡沒有的敵人能力不推定；數量無法判讀時不給確定的總數
 */

/** 組在戰場上的結果：出兵、遊戲會略過、無法判斷 */
export type GroupOutcome = "spawn" | "skip" | "unknown";

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
  outcome: GroupOutcome;
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

/** 關卡的路線：和 GameMap._parse_path_json 相同（paths 物件、paths 陣列視為 path_a、舊版 waypoints） */
export function stagePathIds(pathJson: unknown): string[] {
  let pj = pathJson;
  if (typeof pj === "string") {
    try {
      pj = JSON.parse(pj);
    } catch {
      return [];
    }
  }
  if (!pj || typeof pj !== "object" || Array.isArray(pj)) return [];
  const o = pj as Record<string, unknown>;
  if ("paths" in o) {
    const paths = o.paths;
    if (Array.isArray(paths)) return paths.some(isPoint) ? ["path_a"] : [];
    if (paths && typeof paths === "object") {
      return Object.entries(paths as Record<string, unknown>)
        .filter(([, pts]) => Array.isArray(pts) && pts.length > 0)
        .map(([id]) => id);
    }
    return [];
  }
  if (Array.isArray(o.waypoints) && o.waypoints.length > 0) return ["path_a"];
  return [];
}

function previewGroup(
  raw: unknown,
  index: number,
  enemies: EnemyConfig[],
  pathIds: string[]
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

  if (!cfg) {
    notes.push(`找不到敵人設定「${enemyId}」，遊戲會略過這一組`);
    outcome = "skip";
  } else if (!pathIds.includes(path)) {
    notes.push(`路線「${path}」沒有路點，遊戲會略過這一組`);
    outcome = "skip";
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

  return {
    index,
    enemyId,
    name: cfg ? String(cfg.name ?? enemyId) : null,
    count: outcome === "spawn" ? count : null,
    path,
    hp,
    speed,
    interval,
    outcome,
    notes,
  };
}

export function buildStagePreview(
  map: MapConfig,
  enemies: EnemyConfig[]
): StagePreview {
  const pathIds = stagePathIds(map.path_json);
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
      const g = previewGroup(raw, i + 1, enemies, pathIds);
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
  return { waves, pathIds, total, problems };
}
