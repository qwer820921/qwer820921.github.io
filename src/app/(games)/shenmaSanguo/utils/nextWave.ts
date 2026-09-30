import { EnemyConfig, MapConfig } from "../types";
import { PreviewWave, StagePreview, buildStagePreview } from "./stagePreview";

/**
 * 戰場內的「下一波」（唯讀；兩個戰鬥入口共用）：
 * - 波次以這一場已採用的 Godot update_stats 為準（battle_id 必須是這一場），下一波＝目前的 wave＋1：
 *   初始備戰（wave 0）是第 1 波；戰鬥中是目前這一波之後的一波；清波後的備戰是接下來的一波。
 *   被拒絕開戰時仍在備戰、wave 不變，所以看到的是被拒絕的那一波（會標出不能出兵的原因）
 * - 敵軍資料用這一場送進遊戲的關卡與敵人設定（送出關卡資料時記下），不是之後才載入的設定
 * - 內容照敵軍預覽的規則（utils/stagePreview），只取這一波：關卡資料沒有這一波時是「沒有資料、遊戲會拒絕開始」，
 *   不是「沒有下一波」；有沒有下一波只看遊戲送來的總波數
 * - 還沒有這一場的戰況時是 waiting（不拿上一場的波次）；結算中是 ended
 * 只計算、不送任何命令：不暫停、不開始下一波、不改自動與倍率
 */

/** 這一場送進遊戲的關卡與敵人設定 */
export interface NextWaveBattle {
  battleId: string;
  map: MapConfig;
  enemies: EnemyConfig[];
}

/** update_stats 裡用到的欄位 */
export interface NextWaveStats {
  battle_id?: string;
  wave: number;
  total_waves: number;
  game_state: number;
  /** 自動模式清波後、等待自動開下一波（遊戲仍是戰鬥狀態） */
  auto_next_wave_pending?: boolean;
}

/** 和兩個戰鬥入口的 GameState 相同 */
const PREP = 1;
const BATTLE = 2;
const RESULT = 3;

export type NextWavePhase = "prep" | "battle";

interface Position {
  /** 目前的波次（0：還沒開始第 1 波） */
  current: number;
  /** 遊戲的總波數 */
  total: number;
  phase: NextWavePhase;
  /** 自動模式：目前這一波已清完，即將自動開始下一波 */
  autoPending: boolean;
}

export type NextWaveView =
  | { status: "waiting" }
  | { status: "ended" }
  /** 目前已是最後一波（或最後一波已打完）：沒有下一波 */
  | ({ status: "last" } & Position)
  /** 關卡資料沒有提供波次：遊戲改用內建的測試波次，無法預覽 */
  | ({ status: "unknown"; next: number; reason: string } & Position)
  | ({
      status: "wave";
      next: number;
      wave: PreviewWave;
      /** 只有這一波的敵軍預覽（對空提醒的範圍；problems 是整關的資料問題） */
      scoped: StagePreview;
      /** 關卡資料的波數（最大的 wave 編號）；和遊戲的總波數不同時，資料可能和戰場不一致 */
      dataWaves: number;
    } & Position);

const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0;

/** 關卡資料沒有這一波（和 buildStagePreview 對缺波次的判讀相同） */
const missingWave = (n: number): PreviewWave => ({
  wave: n,
  missing: true,
  groups: [],
  blankRows: 0,
  total: null,
  rejected: true,
  incomplete: true,
  duplicates: 0,
});

export function nextWaveView(
  stats: NextWaveStats | null | undefined,
  battle: NextWaveBattle | null | undefined
): NextWaveView {
  if (
    !stats ||
    !battle ||
    typeof stats.battle_id !== "string" ||
    stats.battle_id === "" ||
    stats.battle_id !== battle.battleId
  ) {
    return { status: "waiting" };
  }
  if (stats.game_state === RESULT) return { status: "ended" };
  if (stats.game_state !== PREP && stats.game_state !== BATTLE) {
    return { status: "waiting" };
  }
  if (!isCount(stats.wave) || !isCount(stats.total_waves)) {
    return { status: "waiting" };
  }
  const pos: Position = {
    current: stats.wave,
    total: stats.total_waves,
    phase: stats.game_state === BATTLE ? "battle" : "prep",
    autoPending:
      stats.game_state === BATTLE && stats.auto_next_wave_pending === true,
  };
  const next = pos.current + 1;
  if (next > pos.total) return { status: "last", ...pos };

  const rawWaves = battle.map.waves;
  if (!Array.isArray(rawWaves) || rawWaves.length === 0) {
    return {
      status: "unknown",
      next,
      reason:
        "關卡資料沒有提供波次：遊戲改用內建的測試波次，無法預覽這一波的敵軍",
      ...pos,
    };
  }
  const preview = buildStagePreview(
    battle.map,
    Array.isArray(battle.enemies) ? battle.enemies : []
  );
  const wave = preview.waves.find((w) => w.wave === next) ?? missingWave(next);
  const scoped: StagePreview = {
    waves: [wave],
    pathIds: preview.pathIds,
    total: wave.total,
    flying:
      !wave.rejected &&
      wave.groups.some(
        (g) => g.outcome !== "skip" && g.movement?.value === "flying"
      ),
    problems: preview.problems,
  };
  return {
    status: "wave",
    next,
    wave,
    scoped,
    dataWaves: preview.waves.length,
    ...pos,
  };
}
