import { create } from "zustand";
import { BattleObservation } from "../utils/battleObservation";

// 目前戰鬥入口已採用的最新一份戰況觀測（採用規則見 utils/battleObservation 的 ObservationTracker）。
// 觀測每 0.25 秒更新一次：放在這裡而不是戰鬥入口的 state，只有顯示它的元件（武將面板、「戰況」）跟著重繪，
// 戰鬥入口本身與開著的視窗（隊伍、武將、設定等）不會因此重繪。一次只有一個戰鬥入口掛載；
// 換一場、換遊戲 iframe、離開頁面時由戰鬥入口清空
interface BattleObservationStore {
  observation: BattleObservation | null;
  setObservation: (observation: BattleObservation | null) => void;
}

export const useBattleObservationStore = create<BattleObservationStore>(
  (set) => ({
    observation: null,
    setObservation: (observation) => set({ observation }),
  })
);

/** 戰鬥入口的訊息處理用（不是 hook，不會讓呼叫的元件訂閱） */
export const publishObservation = (observation: BattleObservation | null) =>
  useBattleObservationStore.getState().setObservation(observation);
