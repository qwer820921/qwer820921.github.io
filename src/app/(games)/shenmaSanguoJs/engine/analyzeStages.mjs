import { BUILTIN_STAGES } from "../builtinData.js";

// 模擬檢查 stageDataProblem
function checkProblem(s) {
  const gaps = [];
  const reasons = [];

  const pathJson = s.path_json;
  let hasValidRoute = false;
  if (pathJson && typeof pathJson === "object") {
    if (pathJson.paths && typeof pathJson.paths === "object") {
      if (Array.isArray(pathJson.paths)) {
        hasValidRoute = pathJson.paths.length > 0;
      } else {
        const keys = Object.keys(pathJson.paths);
        hasValidRoute = keys.some((k) => Array.isArray(pathJson.paths[k]) && pathJson.paths[k].length > 0);
      }
    } else if (Array.isArray(pathJson.waypoints)) {
      hasValidRoute = pathJson.waypoints.length > 0;
    }
  }

  if (!hasValidRoute) {
    gaps.push("route");
    reasons.push("沒有可用的行軍路線");
  }

  const hasWaves = Array.isArray(s.waves) && s.waves.length > 0;
  if (!hasWaves) {
    gaps.push("waves");
    reasons.push("沒有進犯波次資料");
  }

  return gaps.length > 0 ? { gaps, reasons } : null;
}

console.log("BUILTIN_STAGES count:", BUILTIN_STAGES.length);
BUILTIN_STAGES.forEach((s) => {
  const p = checkProblem(s);
  console.log(`- ${s.map_id} (${s.name}):`, p ? `尚未開放 [${p.reasons.join(", ")}]` : "開放可玩");
});
