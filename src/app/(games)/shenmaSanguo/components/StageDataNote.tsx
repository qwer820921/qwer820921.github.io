"use client";

import {
  StageDataProblem,
  stageDataProblemText,
} from "../utils/stagePlayability";
import styles from "../styles/shenmaSanguo.module.css";

/**
 * 關卡卡片上的「尚未開放」說明（規則見 utils/stagePlayability）：關卡資料未完成的原因。
 * 兩個關卡選擇入口共用；這一關不能出征，但仍可以查看敵軍預覽
 */
export default function StageDataNote({
  problem,
}: {
  problem: StageDataProblem;
}) {
  return (
    <div
      className={styles.stageDataNote}
      data-testid="stage-data-note"
      data-gaps={problem.gaps.join(",")}
    >
      {stageDataProblemText(problem)}。暫時不能出征（不是還沒通關）。
    </div>
  );
}
