// 共用帳號待確認結算的關卡說明（純函式：沒有 store、儲存或網路）。
// 只用這場暫存裡記下的關卡 ID，不看目前選中的關卡；後端的關卡設定已就緒、這個 ID 只對到一關、
// 名稱不是空的才顯示正式名稱，否則只顯示 ID 並說名稱未確認（不拿內建的代用資料猜名稱）。

/** 待確認狀態裡和顯示有關的欄位（和 store 的 pendingSettle 相同） */
export interface PendingStageInput {
  stageId: string;
  status: "pending" | "review" | "unavailable";
}

/** 關卡清單裡和名稱有關的欄位（StageDataManager.getStages() 的 map_id、name） */
export interface StageNameSource {
  map_id: string;
  name: string;
}

export interface PendingStageLabel {
  /** 暫存裡的關卡 ID（讀不到或無法辨識時是空字串） */
  stageId: string;
  /** 確認過的正式名稱；沒有確認時是 null */
  name: string | null;
  /** 給玩家看的一行說明（純文字，由畫面當文字輸出） */
  text: string;
}

const PREFIX: Record<PendingStageInput["status"], string> = {
  pending: "待確認的結算",
  review: "要人工確認的結算",
  unavailable: "暫存讀不到的結算",
};

/**
 * 這個關卡 ID 在清單裡的正式名稱：剛好對到一關、名稱去掉空白後不是空的，
 * 也不是讀取時用 ID 補上的名稱（StageDataManager 遇到空名稱會改用 map_id）；否則 null
 */
function confirmedName(
  stages: readonly StageNameSource[],
  stageId: string
): string | null {
  const hits = stages.filter((s) => !!s && s.map_id === stageId);
  if (hits.length !== 1) return null;
  const name = typeof hits[0].name === "string" ? hits[0].name.trim() : "";
  return name && name !== stageId ? name : null;
}

/** 待確認結算的關卡說明；沒有待確認時是 null */
export function describePendingStage(
  pending: PendingStageInput | null,
  stages: readonly StageNameSource[],
  remoteReady: boolean
): PendingStageLabel | null {
  if (!pending) return null;
  const stageId =
    typeof pending.stageId === "string" ? pending.stageId.trim() : "";
  if (!stageId) {
    return {
      stageId: "",
      name: null,
      text:
        pending.status === "unavailable"
          ? "這個分頁的暫存讀不到，無法確認是哪一關。"
          : `${PREFIX[pending.status] ?? PREFIX.review}：無法辨識是哪一關。`,
    };
  }
  const name = remoteReady ? confirmedName(stages, stageId) : null;
  const prefix = PREFIX[pending.status] ?? PREFIX.review;
  return {
    stageId,
    name,
    text: name
      ? `${prefix}：${name}（${stageId}）`
      : `${prefix}：${stageId}（關卡名稱未確認）`,
  };
}
