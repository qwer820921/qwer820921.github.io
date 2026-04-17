// 關卡 ID 工具函式
// 格式：chapter{chapter}_{stage}  例：chapter1_3

const STAGES_PER_CHAPTER = 10;

/** 將 stage_id 轉為可比較的數字，chapter1_3 → 103 */
export function stageToNum(stageId: string): number {
  const match = stageId.match(/chapter(\d+)_(\d+)/);
  if (!match) return 0;
  return parseInt(match[1]) * 100 + parseInt(match[2]);
}

/** 取得下一個 stage_id，chapter1_10 → chapter2_1 */
export function getNextStage(stageId: string): string {
  const match = stageId.match(/chapter(\d+)_(\d+)/);
  if (!match) return stageId;

  let chapter = parseInt(match[1]);
  let stage = parseInt(match[2]) + 1;

  if (stage > STAGES_PER_CHAPTER) {
    chapter += 1;
    stage = 1;
  }
  return `chapter${chapter}_${stage}`;
}

/** 判斷 stageId 是否已解鎖（不超過 maxStage） */
export function isStageUnlocked(stageId: string, maxStage: string): boolean {
  return stageToNum(stageId) <= stageToNum(maxStage);
}
