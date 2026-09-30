import { EnemyConfig, HeroConfig, MapConfig, TeamSlot } from "../types";
import { heroCanHitAir } from "./antiAir";
import { FlightProblem, StagePreview, buildStagePreview } from "./stagePreview";

/**
 * 出征前的對空準備提醒（唯讀；兩個關卡選擇入口與共用的敵軍預覽都用這一份規則）：
 * - 關卡有沒有飛行敵人照敵軍預覽（utils/stagePreview）：遊戲會拒絕的波次、遊戲會略過的組不算；
 *   數量照預覽的合法規則，無法確定時不給數字（不會算出 NaN 或假的精確數）
 * - 飛行路線無效（只有一個路點、起點和終點是同一格）的飛行組遊戲不會出兵：另外列出原因，不算進飛行敵人
 * - 找不到敵人設定、沒有波次或路線、波次編號無法判讀、缺波次時標成「資料不完整」：
 *   不能保證沒有飛行敵人，也不能保證飛行敵人只有列出的這些
 * - 隊伍只看目前真實上陣的武將（player.team，依 hero_id 去重），不把沒上陣的武將算進去；
 *   能不能對空照武將職業（utils/antiAir 的矩陣，遊戲不認得的職業只打地面）；找不到設定的武將另外列出
 * - 只是戰術提醒：不是戰力評分，不保證能獲勝，也不阻擋出征、不寫入任何東西
 */

export interface FlyingGroupInfo {
  name: string;
  /** 會出兵的隻數；無法確定時是 null */
  count: number | null;
}

export interface FlyingWaveInfo {
  wave: number;
  groups: FlyingGroupInfo[];
}

/** 路線無效、遊戲會略過的飛行組 */
export interface InvalidFlyingInfo {
  wave: number;
  name: string;
  path: string;
  reason: FlightProblem;
}

export type TeamAirState =
  /** 玩家資料或武將設定還沒載入：無法判斷 */
  | { status: "unknown" }
  /** 沒有上陣的武將 */
  | { status: "empty" }
  | {
      status: "ready";
      /** 上陣武將數（去重後） */
      size: number;
      /** 能對空的上陣武將名稱 */
      airHeroes: string[];
      /** 找不到設定的上陣武將 hero_id（無法判斷能不能對空） */
      unknownHeroes: string[];
    };

export interface StageAirReadiness {
  /**
   * ground：確定沒有飛行敵人（不顯示提醒）；unclear：沒有發現飛行敵人，但敵軍資料不完整；
   * flying：這一關會出現飛行敵人
   */
  kind: "ground" | "unclear" | "flying";
  flyingWaves: FlyingWaveInfo[];
  /** 飛行敵人的總隻數：每一組都確定而且敵軍資料完整時才有，否則 null */
  flyingTotal: number | null;
  /** 路線無效、遊戲會略過的飛行組（不算在 flyingWaves 與 flyingTotal 裡） */
  invalidFlying: InvalidFlyingInfo[];
  /** 敵軍資料不完整的原因（顯示用） */
  incomplete: string[];
  team: TeamAirState;
}

/** 列出前幾個，其餘用「等 N 個」 */
const listSome = (items: string[], max = 3) =>
  items.length <= max
    ? items.join("、")
    : `${items.slice(0, max).join("、")} 等 ${items.length} 個`;

/** 敵軍預覽裡的資料不完整原因（和預覽的判讀相同） */
function incompleteReasons(preview: StagePreview): string[] {
  const reasons = [...preview.problems];
  const unknownIds = [
    ...new Set(
      preview.waves.flatMap((w) =>
        w.groups.filter((g) => g.movement === null).map((g) => g.enemyId)
      )
    ),
  ];
  if (unknownIds.length > 0) {
    reasons.push(`找不到敵人設定：${listSome(unknownIds)}`);
  }
  const missing = preview.waves.filter((w) => w.missing).map((w) => w.wave);
  if (missing.length > 0) {
    reasons.push(
      `第 ${listSome(missing.map(String))} 波沒有資料（遊戲打到時會拒絕開始）`
    );
  }
  return reasons;
}

/** 目前上陣隊伍的對空能力 */
export function teamAirState(
  team: TeamSlot[] | null | undefined,
  heroesConfig: HeroConfig[] | null | undefined
): TeamAirState {
  if (!Array.isArray(team) || !Array.isArray(heroesConfig)) {
    return { status: "unknown" };
  }
  const ids = [
    ...new Set(
      team
        .map((s) => (s && typeof s.hero_id === "string" ? s.hero_id : ""))
        .filter((id) => id !== "")
    ),
  ];
  if (ids.length === 0) return { status: "empty" };
  const airHeroes: string[] = [];
  const unknownHeroes: string[] = [];
  for (const id of ids) {
    const cfg = heroesConfig.find((h) => h && h.hero_id === id);
    if (!cfg) unknownHeroes.push(id);
    else if (heroCanHitAir(cfg.job)) airHeroes.push(String(cfg.name || id));
  }
  return { status: "ready", size: ids.length, airHeroes, unknownHeroes };
}

export function stageAirReadiness(
  map: MapConfig,
  enemies: EnemyConfig[] | null | undefined,
  team: TeamSlot[] | null | undefined,
  heroesConfig: HeroConfig[] | null | undefined
): StageAirReadiness {
  const preview = buildStagePreview(map, Array.isArray(enemies) ? enemies : []);
  const incomplete = incompleteReasons(preview);
  const flyingWaves: FlyingWaveInfo[] = preview.waves
    .filter((w) => !w.rejected)
    .map((w) => ({
      wave: w.wave,
      groups: w.groups
        .filter((g) => g.outcome !== "skip" && g.movement?.value === "flying")
        .map((g) => ({ name: g.name ?? g.enemyId, count: g.count })),
    }))
    .filter((w) => w.groups.length > 0);
  const invalidFlying: InvalidFlyingInfo[] = preview.waves.flatMap((w) =>
    w.groups.flatMap((g) =>
      g.flightProblem
        ? [
            {
              wave: w.wave,
              name: g.name ?? g.enemyId,
              path: g.path,
              reason: g.flightProblem,
            },
          ]
        : []
    )
  );
  const counts = flyingWaves.flatMap((w) => w.groups.map((g) => g.count));
  const flyingTotal =
    flyingWaves.length > 0 &&
    incomplete.length === 0 &&
    counts.every((c) => typeof c === "number" && Number.isFinite(c))
      ? counts.reduce<number>((s, c) => s + (c ?? 0), 0)
      : null;
  return {
    kind:
      flyingWaves.length > 0
        ? "flying"
        : incomplete.length > 0
          ? "unclear"
          : "ground",
    flyingWaves,
    flyingTotal,
    invalidFlying,
    incomplete,
    team: teamAirState(team, heroesConfig),
  };
}
