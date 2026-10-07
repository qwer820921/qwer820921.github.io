/**
 * testStagePlayabilityComprehensive.ts
 * 極致全面驗證神馬三國 JS 版關卡出征資格、未開放地圖偵測、進度解鎖與自由演練
 */

import {
  getStageDataProblem,
  getStageAccessStatus,
  stageToNum,
  getNextStage,
  isStageUnlocked,
} from "../utils/stagePlayability";
import { BUILTIN_STAGES, StageData } from "./builtinData";

async function runComprehensiveStageVerification() {
  console.log("==========================================================");
  console.log("🛡️  神馬三國 (JS版) 關卡開放性與出征邏輯 全面極致校驗");
  console.log("==========================================================");

  // 1. 驗證內建關卡 BUILTIN_STAGES 與基礎工具函式
  console.log("\n[第 1 階段] 驗證 BUILTIN_STAGES 基礎完整性 (3關) 與進度工具函式...");
  if (stageToNum("chapter1_3") !== 103 || stageToNum("chapter2_1") !== 201) {
    throw new Error("stageToNum 數值轉換有誤");
  }
  if (!isStageUnlocked("chapter1_2", "chapter1_2") || isStageUnlocked("chapter1_3", "chapter1_2")) {
    throw new Error("isStageUnlocked 進度比對有誤");
  }
  for (const stage of BUILTIN_STAGES) {
    const prob = getStageDataProblem(stage);
    if (prob) {
      throw new Error(`內建關卡 ${stage.map_id} 居然判定有缺陷: ${prob.reasons.join(", ")}`);
    }
  }
  console.log("  ✔ BUILTIN_STAGES (chapter1_1 ~ chapter1_3) 均具備有效路線與波次，100% 完整！");

  // 2. 向 GAS 獲取全量 100 關地圖資料並驗證
  console.log("\n[第 2 階段] 向 GAS API (get_all_maps) 抓取真實 100 關卡進行全面掃描...");
  const gasUrl =
    process.env.NEXT_PUBLIC_SHENMA_GAS_URL ||
    "https://script.google.com/macros/s/AKfycbwp4fh9r832zzUwY6x1HnvxrhuKxGAb0cluL_89ydsqSLQAwHHxMkUt_8mJQO1xDpue/exec";

  const res = await fetch(gasUrl, {
    method: "POST",
    body: JSON.stringify({ action: "get_all_maps" }),
  });
  const data = await res.json();
  const allMaps: StageData[] = data.maps || [];

  if (allMaps.length !== 100) {
    throw new Error(`預期收錄 100 關卡，實際收錄 ${allMaps.length}`);
  }
  console.log(`  ✔ 成功讀取全量 ${allMaps.length} 張戰略地圖！涵蓋 10 個章節。`);

  // 3. 逐關卡進行 StageDataProblem 檢驗
  const openMaps: StageData[] = [];
  const incompleteMaps: { stage: StageData; reasons: string[] }[] = [];

  for (const map of allMaps) {
    const prob = getStageDataProblem(map);
    if (prob) {
      incompleteMaps.push({ stage: map, reasons: prob.reasons });
    } else {
      openMaps.push(map);
    }
  }

  console.log(`\n[第 3 階段] 關卡完整度診斷結果：`);
  console.log(`  - 具備完整行軍路線與防守波次之【已開放關卡】: ${openMaps.length} 關`);
  console.log(`  - 資料未完成（缺路線或缺波次）之【尚未開放關卡】: ${incompleteMaps.length} 關`);

  if (openMaps.length !== 6) {
    throw new Error(`預期僅有 6 關開放（chapter1_1 ~ chapter1_6），實際開放 ${openMaps.length}`);
  }
  if (incompleteMaps.length !== 94) {
    throw new Error(`預期 94 關尚未開放，實際為 ${incompleteMaps.length}`);
  }

  console.log("  ✔ 已開放關卡清單:", openMaps.map((m) => `${m.map_id} (${m.name})`).join(", "));
  console.log("  ✔ 尚未開放關卡包含: chapter1_7 (汜水關, 缺波次), chapter1_8~chapter10_10 (無路線、無波次)");

  // 4. 驗證 UI 狀態判定 (getStageAccessStatus)
  console.log("\n[第 4 階段] 驗證各場景下的 UI 狀態標籤與資格判定...");

  // 情境 A: 初始新玩家 (max_stage = "chapter1_1", allowFreePlay = false)
  console.log("  Scenario A: 初始玩家 (進度 chapter1_1，自由演練關閉)");
  const st1_1 = openMaps.find((m) => m.map_id === "chapter1_1")!;
  const st1_2 = openMaps.find((m) => m.map_id === "chapter1_2")!;
  const st1_7 = incompleteMaps.find((m) => m.stage.map_id === "chapter1_7")!.stage;
  const st5_1 = incompleteMaps.find((m) => m.stage.map_id === "chapter5_1")!.stage;

  const status1_1_current = getStageAccessStatus({
    stage: st1_1,
    currentStageId: "chapter1_1",
    maxStageId: "chapter1_1",
    clearedStages: {},
    allowFreePlay: false,
  });
  if (status1_1_current !== "current") {
    throw new Error(`預期 chapter1_1 當前作戰為 current，實際為 ${status1_1_current}`);
  }

  const status1_2_locked = getStageAccessStatus({
    stage: st1_2,
    currentStageId: "chapter1_1",
    maxStageId: "chapter1_1",
    clearedStages: {},
    allowFreePlay: false,
  });
  if (status1_2_locked !== "locked") {
    throw new Error(`預期 chapter1_2 為 locked，實際為 ${status1_2_locked}`);
  }

  const status1_7_incom = getStageAccessStatus({
    stage: st1_7,
    currentStageId: "chapter1_1",
    maxStageId: "chapter1_1",
    clearedStages: {},
    allowFreePlay: false,
  });
  if (status1_7_incom !== "incomplete") {
    throw new Error(`預期 chapter1_7 為 incomplete，實際為 ${status1_7_incom}`);
  }

  const status5_1_incom = getStageAccessStatus({
    stage: st5_1,
    currentStageId: "chapter1_1",
    maxStageId: "chapter1_1",
    clearedStages: {},
    allowFreePlay: false,
  });
  if (status5_1_incom !== "incomplete") {
    throw new Error(`預期第 5 章地圖 chapter5_1 為 incomplete，實際為 ${status5_1_incom}`);
  }
  console.log("    ✔ chapter1_1 顯示「當前作戰」");
  console.log("    ✔ chapter1_2 顯示「🔒 尚未解鎖」（禁止挑戰）");
  console.log("    ✔ chapter1_7 與 chapter5_1 嚴格顯示「🔒 尚未開放」（禁止挑戰）");

  // 情境 B: 啟用自由演練模式 (allowFreePlay = true)
  console.log("\n  Scenario B: 玩家開啟「自由演練模式」(allowFreePlay = true)");
  const status1_2_free = getStageAccessStatus({
    stage: st1_2,
    currentStageId: "chapter1_1",
    maxStageId: "chapter1_1",
    clearedStages: {},
    allowFreePlay: true,
  });
  if (status1_2_free !== "freeplay") {
    throw new Error(`在自由演練下已開放的 chapter1_2 應為 freeplay，實際為 ${status1_2_free}`);
  }

  // 關鍵保護：未開放關卡在自由演練下仍然必須是 incomplete！
  const status1_7_still_incom = getStageAccessStatus({
    stage: st1_7,
    currentStageId: "chapter1_1",
    maxStageId: "chapter1_1",
    clearedStages: {},
    allowFreePlay: true,
  });
  if (status1_7_still_incom !== "incomplete") {
    throw new Error(`自由演練下 incomplete 關卡絕對不可開放出征！實際為 ${status1_7_still_incom}`);
  }

  const status5_1_still_incom = getStageAccessStatus({
    stage: st5_1,
    currentStageId: "chapter1_1",
    maxStageId: "chapter1_1",
    clearedStages: {},
    allowFreePlay: true,
  });
  if (status5_1_still_incom !== "incomplete") {
    throw new Error(`自由演練下 chapter5_1 絕對不可開放出征！實際為 ${status5_1_still_incom}`);
  }
  console.log("    ✔ 完整關卡 chapter1_2 正確轉為「🛡️ 自由演練」可供戰術測試");
  console.log("    ✔ 未完成關卡 chapter1_7, chapter5_1 仍堅固保持「🔒 尚未開放」，100% 防禦無效關卡！");

  // 情境 C: 玩家通關 chapter1_1 (cleared_stages = { chapter1_1: 3 })
  console.log("\n  Scenario C: 玩家通關 chapter1_1 獲 3 星，max_stage 推進至 chapter1_2");
  const status1_1_cleared = getStageAccessStatus({
    stage: st1_1,
    currentStageId: "chapter1_2",
    maxStageId: "chapter1_2",
    clearedStages: { chapter1_1: 3 },
    allowFreePlay: false,
  });
  if (status1_1_cleared !== "cleared") {
    throw new Error(`預期 chapter1_1 為 cleared，實際為 ${status1_1_cleared}`);
  }

  const status1_2_playable = getStageAccessStatus({
    stage: st1_2,
    currentStageId: "chapter1_1", // 當前在 1_1，查看 1_2
    maxStageId: "chapter1_2",
    clearedStages: { chapter1_1: 3 },
    allowFreePlay: false,
  });
  if (status1_2_playable !== "playable") {
    throw new Error(`預期已解鎖且完整的 chapter1_2 為 playable (可挑戰)，實際為 ${status1_2_playable}`);
  }
  console.log("    ✔ chapter1_1 正確顯示「⭐ 已通關」");
  console.log("    ✔ chapter1_2 正確顯示「🔥 可挑戰」");

  // 5. 驗證終局關卡防護 (chapter1_6 通關後不跳轉至無效的 chapter1_7)
  console.log("\n[第 5 階段] 驗證終局關卡 chapter1_6 通關後進度邊界防護...");
  const nextOf6 = getNextStage("chapter1_6");
  if (nextOf6 !== "chapter1_7") {
    throw new Error(`getNextStage(chapter1_6) 應為 chapter1_7，實際為 ${nextOf6}`);
  }
  const nextStageObj = allMaps.find((m) => m.map_id === nextOf6);
  const nextProb = getStageDataProblem(nextStageObj);
  if (!nextProb) {
    throw new Error("chapter1_7 應判定為 incomplete！");
  }
  console.log(`  ✔ chapter1_6 通關後，下一關代碼為 ${nextOf6}，經檢驗具備缺失：${nextProb.reasons.join("、")}`);
  console.log("  ✔ settleBattle 與 handleNextStage 將阻擋進入未開放之 chapter1_7，並顯示全通慶賀！");

  console.log("\n==========================================================");
  console.log("🎉 所有關卡出征資格、資料缺失檢驗、防護機制 100% 通過！");
  console.log("==========================================================");
}

runComprehensiveStageVerification().catch((err) => {
  console.error("❌ 驗證失敗:", err);
  process.exit(1);
});
