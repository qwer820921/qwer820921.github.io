import { PreviewGroup, PreviewWave } from "./stagePreview";

/**
 * 敵軍預覽的「設定出兵節奏」（唯讀）：從 buildStagePreview 已確認的組計算，不另外解析出兵規則。
 * 依遊戲的出兵做法（godot WaveManager.start_wave／_spawn_group、BattleManager.create_game_timer）：
 * - 同一波的每一組在波次開始時同時啟動，各組第一隻立刻出兵；同一組兩隻之間等 interval，最後一隻之後不再等
 * - 所以一組最後一隻的名義出兵時間＝(n−1)×interval；整波＝各組的最大值（不是逐組相加）；n＝1 時是 0（不等，間隔是什麼都一樣）
 * - 計時器最短 0.0001 秒，而且要等遊戲處理下一幀：n>1 而 interval 小於 0.0001（含 0 與負數，預覽已照遊戲把負數當 0）時，
 *   出兵跟著處理幀走，無法由設定估算精確秒數，不寫成 0 秒或同時出兵
 * - 沒有提供 interval 時遊戲以 1 秒計（標出是預設值）；不是數字的 interval 不強轉，那一組（n>1）無法估算
 * 這是遊戲時間：手動暫停時停住、倍速時加快，不是牆鐘時間；實際出兵對齊處理幀，可能略晚於名義時間。
 * 不是清波、抵達終點或戰鬥結束的時間，也不代表勝負
 */

/** 遊戲計時器的最短時間（BattleManager.create_game_timer 的 maxf(sec, 0.0001)） */
export const MIN_TIMER_SEC = 0.0001;

/**
 * 一組的節奏：
 * - timed：最後一隻名義在 lastSec 秒出兵（n>1、間隔有效）
 * - single：只有一隻，波次開始時出兵（0 秒）
 * - frame：n>1、間隔小於計時器最短時間，依處理幀出兵，無法估算精確秒數
 * - unknown：數量或能不能出兵無法確定、間隔不是數字，或數字太大無法估算
 * - skip：遊戲會略過這一組（不出兵）
 */
export type GroupRhythmKind = "timed" | "single" | "frame" | "unknown" | "skip";

export interface GroupRhythm {
  /** 這一波的第幾組（和逐波內容相同，從 1 開始、包含空白列） */
  index: number;
  enemyId: string;
  name: string | null;
  path: string;
  count: number | null;
  interval: number | null;
  intervalDefault: boolean;
  kind: GroupRhythmKind;
  /** 最後一隻的名義出兵秒數（timed、single）；其他是 null */
  lastSec: number | null;
  /** unknown 的原因 */
  reason: string | null;
}

/**
 * 整波的節奏：
 * - complete：每一組都能估算，lastSec 就是整波最後一隻的名義出兵時間
 * - frame：每一組都確定，但有依處理幀出兵的組：lastSec（其他組的最大值）只是下限，不是整波的精確時間
 * - partial：有無法估算的組：lastSec（已估算組的最大值）只是已知範圍，不是整波
 * - none：沒有資料、遊戲會拒絕這一波，或沒有會出兵的組
 */
export type WaveRhythmStatus = "complete" | "frame" | "partial" | "none";

export interface WaveRhythm {
  wave: number;
  status: WaveRhythmStatus;
  /** 會出兵或無法確定的組（不含遊戲會略過的組），順序和逐波內容相同 */
  groups: GroupRhythm[];
  /** 遊戲會略過的組數 */
  skipped: number;
  /** complete：整波名義時間；frame／partial：已估算組的最大值（沒有時 null）；none：null */
  lastSec: number | null;
  frameGroups: number;
  unknownGroups: number;
}

function groupRhythm(g: PreviewGroup): GroupRhythm {
  const base = {
    index: g.index,
    enemyId: g.enemyId,
    name: g.name,
    path: g.path,
    count: g.count,
    interval: g.interval,
    intervalDefault: g.intervalDefault,
    lastSec: null,
    reason: null,
  };
  if (g.outcome === "skip") return { ...base, kind: "skip" };
  if (g.outcome !== "spawn" || g.count === null)
    return {
      ...base,
      kind: "unknown",
      reason: "無法確定這一組能不能出兵或數量",
    };
  const n = g.count;
  if (!Number.isSafeInteger(n) || n < 1)
    return { ...base, kind: "unknown", reason: "數量太大，無法估算" };
  if (n === 1) return { ...base, kind: "single", lastSec: 0 };
  if (g.interval === null)
    return {
      ...base,
      kind: "unknown",
      reason: "出兵間隔不是數字，無法估算",
    };
  if (g.interval < MIN_TIMER_SEC) return { ...base, kind: "frame" };
  const sec = (n - 1) * g.interval;
  if (!Number.isFinite(sec))
    return { ...base, kind: "unknown", reason: "數字太大，無法估算" };
  return { ...base, kind: "timed", lastSec: sec };
}

export function waveRhythm(w: PreviewWave): WaveRhythm {
  const all = w.groups.map(groupRhythm);
  const groups = all.filter((g) => g.kind !== "skip");
  const skipped = all.length - groups.length;
  const frameGroups = groups.filter((g) => g.kind === "frame").length;
  const unknownGroups = groups.filter((g) => g.kind === "unknown").length;
  const secs = groups
    .map((g) => g.lastSec)
    .filter((s): s is number => s !== null);
  const max = secs.length ? Math.max(...secs) : null;
  if (w.missing || w.rejected || groups.length === 0)
    return {
      wave: w.wave,
      status: "none",
      groups,
      skipped,
      lastSec: null,
      frameGroups,
      unknownGroups,
    };
  const status: WaveRhythmStatus =
    unknownGroups > 0 ? "partial" : frameGroups > 0 ? "frame" : "complete";
  return {
    wave: w.wave,
    status,
    groups,
    skipped,
    lastSec: max,
    frameGroups,
    unknownGroups,
  };
}

/** 秒數照實顯示的小數位數上限（計時器最短 0.0001 秒，4 位內的設定值都能照實寫） */
const DECIMALS = 4;
const SCALE = 10 ** DECIMALS;

/**
 * 和最近的 4 位小數只差計算的浮點誤差（幾個 ulp，例如 0.1＋0.2＝0.30000000000000004）時才當成同一個數；
 * 真的差一點點的值（0.6666999999999）不算，要標「約」
 */
const sameAsDecimal = (sec: number, d: number) =>
  Math.abs(sec - d) <= 16 * Number.EPSILON * Math.max(1, Math.abs(sec));

/**
 * 秒數的顯示（只用在畫面文字，計算值與 data 屬性都不經過這裡）：
 * - 整數照原樣（含極大的安全整數，不抹掉任何一位）
 * - 和某個 4 位以內的小數只差浮點誤差時寫那個小數（0.0001、0.001、9.9、0.3、123456789.0129），小的正值不寫成 0
 * - 其他寫最近的 4 位小數並標「約」（2/3→約 0.6667）；4 位小數放大後超出安全整數的極大非整數，寫最近的整數並標「約」
 * floor＝true 用在「至少」：直接從未進位的真值往下取，保證顯示的數字不大於真值（2/3→0.6666、0.6666999999999→0.6666），不標約
 */
export function secText(sec: number, floor = false): string {
  if (!Number.isFinite(sec)) return String(sec);
  if (Number.isInteger(sec)) return String(sec);
  const scaled = sec * SCALE;
  const nearest = Math.round(scaled);
  if (!Number.isSafeInteger(nearest))
    return floor ? String(Math.floor(sec)) : `約 ${Math.round(sec)}`;
  // 比 4 位小數還小的正值（實際的組最短是 0.0001 秒，這裡只是保險）：不寫成 0，用 2 位有效數字標約；「至少」寫 0
  if (nearest === 0 && sec !== 0)
    return floor ? "0" : `約 ${Number(sec.toPrecision(2))}`;
  const near = nearest / SCALE;
  if (sameAsDecimal(sec, near) && (!floor || near <= sec)) return String(near);
  if (floor) {
    // 放大與除法都可能有誤差：往下取後再核對，直到顯示值不大於真值
    let k = Math.floor(scaled);
    while (k / SCALE > sec) k -= 1;
    return String(k / SCALE);
  }
  return `約 ${near}`;
}

/** 「第 X 秒」；約值寫成「約第 X 秒」 */
const nthSec = (sec: number): string => {
  const t = secText(sec);
  return t.startsWith("約 ") ? `約第 ${t.slice(2)} 秒` : `第 ${t} 秒`;
};

/**
 * 逐波組列的「設定間隔」（關卡預覽與戰場的下一波共用）：寫的是設定值與遊戲怎麼處理，不是出兵時間。
 * 沒有提供時寫遊戲的預設 1 秒；≤ 0（負數照遊戲當作 0）或小於計時器最短時間時寫明兩隻之間依處理幀，不寫成同時出兵
 */
export function intervalSettingText(
  g: Pick<PreviewGroup, "interval" | "intervalDefault">
): string {
  if (g.intervalDefault) return "設定間隔 未提供（遊戲以 1 秒計）";
  if (g.interval === null) return "設定間隔 無法判讀";
  if (g.interval === 0)
    return "設定間隔 ≤ 0（遊戲當作 0；兩隻之間依處理幀，不是同時出兵）";
  if (g.interval < MIN_TIMER_SEC)
    return `設定間隔 ${g.interval} 秒（小於遊戲計時器最短的 ${MIN_TIMER_SEC} 秒；兩隻之間依處理幀）`;
  return `設定間隔 ${secText(g.interval)} 秒`;
}

/** 一組的節奏說明（畫面與測試共用） */
export function groupRhythmText(g: GroupRhythm): string {
  const iv =
    g.interval === null
      ? "間隔無法判讀"
      : `每隻間隔 ${secText(g.interval)} 秒${g.intervalDefault ? "（沒有提供，遊戲預設）" : ""}`;
  switch (g.kind) {
    case "single":
      return "只有 1 隻：波次開始時出兵（0 秒）";
    case "timed":
      return `${g.count} 隻，${iv}：第一隻在波次開始時出兵，最後一隻名義在${nthSec(g.lastSec ?? 0)}（(${g.count}−1)×${secText(g.interval ?? 0)}）`;
    case "frame":
      return `${g.count} 隻，${g.interval === 0 ? "間隔設定 ≤ 0（遊戲當作 0）" : `間隔 ${g.interval} 秒（小於遊戲計時器最短的 ${MIN_TIMER_SEC} 秒）`}：依處理幀出兵，無法由設定估算精確秒數`;
    case "unknown":
      return `${g.count === null ? "數量無法確定" : `${g.count} 隻`}，${iv}：${g.reason}`;
    default:
      return "遊戲會略過這一組，不出兵";
  }
}

/** 整波的節奏摘要（畫面與測試共用）；「至少」的下限用不進位的寫法 */
export function waveRhythmText(r: WaveRhythm): string {
  if (r.status === "none") return "這一波不會出兵，沒有出兵節奏可以估算";
  const max = r.lastSec === null ? null : nthSec(r.lastSec);
  if (r.status === "complete")
    return `${r.groups.length} 組同時開始；整波最後一隻名義在${max}出兵（各組取最晚的一組，不是相加）`;
  if (r.status === "frame") {
    if (r.lastSec === null)
      return `${r.groups.length} 組同時開始；有 ${r.frameGroups} 組依處理幀出兵，無法由設定估算整波的精確秒數`;
    const atLeast = secText(r.lastSec, true);
    return `${r.groups.length} 組同時開始；其他組最晚在${max}，另有 ${r.frameGroups} 組依處理幀出兵：整波至少 ${atLeast} 秒，無法估算精確秒數`;
  }
  const others = `另有 ${r.unknownGroups} 組無法估算${r.frameGroups > 0 ? `、${r.frameGroups} 組依處理幀出兵` : ""}`;
  return max === null
    ? `${r.groups.length} 組同時開始；${others}，整波的出兵時間無法確定`
    : `僅已估算的組：最晚在${max}；${others}，不是整波的出兵時間`;
}
