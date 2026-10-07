/**
 * stagePlayability.ts
 * 關卡出征資格、資料完整度、解鎖判定與章節統計
 * 完美對齊原版神馬三國 stagePlayability.ts 與 Godot WaveManager 規範
 */

import { StageData } from "../engine/builtinData";

export type StageDataGap = "route" | "waves";

export interface StageDataProblem {
  gaps: StageDataGap[];
  reasons: string[];
}

export type StageAccessStatus =
  | "incomplete" // 關卡資料未完成（無路線或無波次），絕對不可出征
  | "current" // 當前進行中戰役
  | "cleared" // 已通關（有星級評定）
  | "playable" // 已解鎖且資料完整，可開赴戰場挑戰
  | "locked" // 資料完整但玩家進度尚未解鎖
  | "freeplay"; // 進度未解鎖，但玩家手動開啟了自由演練模式

const STAGES_PER_CHAPTER = 10;

/**
 * 將 stage_id 轉為可比較的數字，如 chapter1_3 → 103, chapter2_1 → 201
 */
export function stageToNum(stageId?: string): number {
  if (!stageId) return 0;
  const match = stageId.match(/chapter(\d+)_(\d+)/);
  if (!match) return 0;
  return parseInt(match[1], 10) * 100 + parseInt(match[2], 10);
}

/**
 * 取得下一個關卡代碼，如 chapter1_1 → chapter1_2, chapter1_10 → chapter2_1
 */
export function getNextStage(stageId: string): string {
  const match = stageId.match(/chapter(\d+)_(\d+)/);
  if (!match) return stageId;

  let chapter = parseInt(match[1], 10);
  let stage = parseInt(match[2], 10) + 1;

  if (stage > STAGES_PER_CHAPTER) {
    chapter += 1;
    stage = 1;
  }
  return `chapter${chapter}_${stage}`;
}

/**
 * 檢查關卡資料完整性（是否有有效路線與有效防守波次）
 * 若有缺失則回傳 StageDataProblem，否則回傳 null
 */
export function getStageDataProblem(stage: StageData | null | undefined): StageDataProblem | null {
  if (!stage) return null;
  const gaps: StageDataGap[] = [];
  const reasons: string[] = [];

  // 1. 路線檢驗
  let pj = stage.path_json;
  if (typeof pj === "string") {
    try {
      pj = JSON.parse(pj);
    } catch {
      pj = null;
    }
  }

  let hasValidRoute = false;
  if (pj && typeof pj === "object") {
    if (pj.paths && typeof pj.paths === "object") {
      const keys = Object.keys(pj.paths);
      for (const k of keys) {
        const pts = (pj.paths as Record<string, unknown>)[k];
        if (Array.isArray(pts) && pts.length >= 2) {
          hasValidRoute = true;
          break;
        }
      }
    } else if (Array.isArray(pj.waypoints) && pj.waypoints.length >= 2) {
      hasValidRoute = true;
    }
  }

  if (!hasValidRoute) {
    gaps.push("route");
    reasons.push("沒有可用的行軍路線");
  }

  // 2. 波次檢驗
  const waves = stage.waves;
  let hasValidWaves = false;
  if (Array.isArray(waves) && waves.length > 0) {
    // 必須至少有 1 個波次且設定正常
    hasValidWaves = waves.some((w) => w && (Array.isArray(w.enemies) ? w.enemies.length > 0 : true));
  }

  if (!hasValidWaves) {
    gaps.push("waves");
    reasons.push("沒有波次資料");
  }

  return gaps.length > 0 ? { gaps, reasons } : null;
}

/**
 * 關卡資料未完成說明文字
 */
export function stageDataProblemText(problem: StageDataProblem): string {
  return `關卡資料未完成：${problem.reasons.join("、")}`;
}

/**
 * 判定關卡是否在玩家進度範圍內已解鎖
 */
export function isStageUnlocked(
  stageId: string,
  maxStageId?: string,
  clearedStages?: Record<string, number>
): boolean {
  if (stageId === "chapter1_1") return true;
  if (clearedStages && clearedStages[stageId] !== undefined && clearedStages[stageId] > 0) {
    return true;
  }
  const stageNum = stageToNum(stageId);
  const maxNum = stageToNum(maxStageId || "chapter1_1");
  return stageNum <= maxNum;
}

/**
 * 判定單一關卡的完整可訪問狀態
 */
export function getStageAccessStatus(options: {
  stage: StageData;
  currentStageId?: string;
  maxStageId?: string;
  clearedStages?: Record<string, number>;
  allowFreePlay?: boolean;
}): StageAccessStatus {
  const { stage, currentStageId, maxStageId, clearedStages = {}, allowFreePlay = false } = options;

  // 1. 資料不完整者，一律為尚未開放（禁止任何出征）
  const problem = getStageDataProblem(stage);
  if (problem) {
    return "incomplete";
  }

  // 2. 當前作戰
  if (currentStageId && stage.map_id === currentStageId) {
    return "current";
  }

  // 3. 已通關（曾獲得星級）
  const stars = clearedStages[stage.map_id] || 0;
  if (stars > 0) {
    return "cleared";
  }

  // 4. 進度已解鎖
  const unlocked = isStageUnlocked(stage.map_id, maxStageId, clearedStages);
  if (unlocked) {
    return "playable";
  }

  // 5. 進度未解鎖，但開啟了自由演練模式
  if (allowFreePlay) {
    return "freeplay";
  }

  // 6. 進度未解鎖
  return "locked";
}
