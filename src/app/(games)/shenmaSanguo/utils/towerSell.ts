/**
 * 備戰拆除防禦塔（Round 18）：兩個戰鬥頁共用的面板狀態。
 * Godot 是唯一的結算方：返還金額、能不能拆都以 Godot 為準；網頁不先增加顯示的金幣（等 update_stats）。
 * - confirm：玩家按了「拆除」，正在確認（還沒送出命令）
 * - pending：已送出 sell_tower，等 Godot 回覆
 * - rejected：Godot 回覆不成功（reason），面板顯示原因，可以重新操作
 */
export interface TowerSellState {
  battle_id: string;
  tower_uid: string;
  phase: "confirm" | "pending" | "rejected";
  reason?: string;
}

/** Godot 的回覆 tower_sell_result */
export interface TowerSellResult {
  battle_id: string;
  tower_uid: string;
  ok: boolean;
  reason?: string;
  /** 這座塔現在的返還金額（不成功時；不是這座塔時是 -1） */
  refund?: number;
  can_sell?: boolean;
}

interface PanelLike {
  unit_type?: string;
  battle_id?: string;
  tower_uid?: string;
}

/** 回覆是不是給這個面板（同一場、同一座塔） */
export function isSameTower(
  a: PanelLike | null | undefined,
  b: { battle_id?: string; tower_uid?: string }
): boolean {
  return (
    !!a &&
    !!a.tower_uid &&
    a.battle_id === b.battle_id &&
    a.tower_uid === b.tower_uid
  );
}

/** 收到回覆後的面板資料：成功時關閉；不成功時換成 Godot 帶回的現在返還金額與能不能拆 */
export function panelAfterSellResult<T extends PanelLike>(
  prev: T | null,
  d: TowerSellResult
): T | null {
  if (!prev || prev.unit_type !== "tower" || !isSameTower(prev, d)) return prev;
  if (d.ok) return null;
  return {
    ...prev,
    ...(typeof d.refund === "number" && d.refund >= 0
      ? { sell_refund: d.refund }
      : {}),
    ...(typeof d.can_sell === "boolean" ? { can_sell: d.can_sell } : {}),
  };
}

/** 收到回覆後的拆除狀態：成功時清除；不成功時顯示原因 */
export function sellStateAfterResult(
  prev: TowerSellState | null,
  d: TowerSellResult
): TowerSellState | null {
  if (!prev || !isSameTower(prev, d)) return prev;
  return d.ok ? null : { ...prev, phase: "rejected", reason: d.reason };
}

/** 不成功的原因（給玩家看的說明） */
export function sellReasonText(reason: string | undefined): string {
  switch (reason) {
    case "not_prep":
      return "戰鬥已開始，備戰時才能拆除。";
    case "refund_changed":
      return "返還金額已改變，請確認新的金額後再拆除。";
    case "not_selected":
    case "already_sold":
      return "這座塔已不是目前選取的防禦塔，請重新點選。";
    case "stale_battle":
      return "這一場已經結束或更換，請重新點選。";
    case "paused":
      return "戰鬥已暫停，繼續後才能拆除。";
    default:
      return "拆除沒有完成，請重新點選這座塔。";
  }
}
