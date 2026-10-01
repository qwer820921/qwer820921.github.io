import { create } from "zustand";

// 戰場上的玩法提示要不要展開：只存在這個瀏覽器（不進存檔、不送後端），主頁與獨立戰鬥頁共用。
// 玩家收起或展開過就照玩家的選擇；還沒選過時，畫面空間夠（展開也不會縮小遊戲畫面）才預設展開
const STORAGE_KEY = "shenma_battle_tips";

function readPref(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "open" ? true : v === "closed" ? false : null;
  } catch {
    return null;
  }
}

interface BattleTipsStore {
  /** 玩家的選擇；null＝還沒選過 */
  pref: boolean | null;
  /** 畫面空間夠：展開時遊戲畫面不會縮小（由提示依戰場區域的大小判斷） */
  roomy: boolean;
  setOpen: (open: boolean) => void;
  setRoomy: (roomy: boolean) => void;
}

export const useBattleTipsStore = create<BattleTipsStore>((set) => ({
  pref: readPref(),
  roomy: false,
  setOpen: (open) => {
    set({ pref: open });
    try {
      localStorage.setItem(STORAGE_KEY, open ? "open" : "closed");
    } catch {
      // 寫不進去（例如隱私模式）：這一頁仍照選擇顯示，下次回到預設
    }
  },
  setRoomy: (roomy) => set({ roomy }),
}));

/** 提示目前是否展開 */
export const selectTipsOpen = (s: BattleTipsStore) => s.pref ?? s.roomy;
