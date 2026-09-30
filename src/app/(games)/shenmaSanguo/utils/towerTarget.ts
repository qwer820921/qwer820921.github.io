import { towerAirAbility } from "./antiAir";

/**
 * 防禦塔的目標優先（和 Godot Tower.gd 的 TARGET_MODES 相同）：
 * - first／strongest／weakest：每座塔都有
 * - air_first（優先飛行）：只有能對空的弓兵塔、文士塔可以選。射程內有飛行敵人就選飛行，沒有就選地面；
 *   同一類之間照「優先前方」。文士塔是優先減速飛行，不造成傷害
 * 面板上有哪些選項以 Godot 送來的 target_modes 為準（沒有送的遊戲只顯示原本三種，不會出現按了沒反應的選項）；
 * 按下後等 Godot 回覆 tower_target_changed 才改變選取狀態
 */
export type TowerTargetMode = "first" | "strongest" | "weakest" | "air_first";

/** 每座塔都有的目標優先 */
export const BASE_TARGET_MODES: readonly TowerTargetMode[] = [
  "first",
  "strongest",
  "weakest",
];

export interface TowerTargetOption {
  mode: TowerTargetMode;
  label: string;
  hint: string;
}

/** 這座塔可以選的目標優先與說明；文士塔的說明一律是「減速」 */
export function towerTargetOptions(
  towerType: unknown,
  targetModes: unknown
): TowerTargetOption[] {
  const slow = towerAirAbility(towerType) === "slow";
  const act = slow ? "減速" : "打";
  const all: TowerTargetOption[] = [
    {
      mode: "first",
      label: "優先前方",
      hint: `${act}路線上走得最前面的敵人（預設）`,
    },
    {
      mode: "strongest",
      label: "血量最多",
      hint: `${act}射程內目前血量最多的敵人`,
    },
    {
      mode: "weakest",
      label: "血量最少",
      hint: `${act}射程內目前血量最少的敵人`,
    },
    {
      mode: "air_first",
      label: "優先飛行",
      hint: `射程內有飛行敵人時先${act}飛行（走得最前面的）；沒有飛行就${act}地面最前面的`,
    },
  ];
  const listed = Array.isArray(targetModes) ? targetModes : null;
  return all.filter((o) =>
    listed ? listed.includes(o.mode) : BASE_TARGET_MODES.includes(o.mode)
  );
}
