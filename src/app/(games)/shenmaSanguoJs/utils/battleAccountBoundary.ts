/**
 * 換帳號之後的舊場守門（純函式：只看傳進來的值，不讀 store、瀏覽器儲存或 API）。
 *
 * 一場戰鬥載入時記下出征來源（模式、金鑰、帳號世代）。之後帳號換了而這一場沒有重新載入
 * （戰鬥中或清完一波回到備戰時換帳號），畫面上的帳號就不再是這一場的來源：
 * - 訪客的本機結算只給這一場的來源本人（同一個訪客登出再選回也是新的世代，不算）
 * - 部署選單不把目前帳號的武將派進這一場
 *
 * 「當場身份」相同的條件：兩邊都是已選的帳號（訪客或共用帳號）而且模式相同、金鑰都是非空字串而且原樣相同、
 * 帳號世代都是已知的合法整數（0 也算）而且相同、目前不在載入中。沒有選帳號、沒有玩家資料或世代不明都不算。
 */

/** 一場戰鬥記下的出征來源，或部署選單的隊伍來源 */
export interface BattleSourceOwner {
  mode: string;
  key: string | null;
  epoch: number | null;
}

/** 目前的帳號（頁面從 store 讀到值後傳進來：模式、玩家資料的金鑰、getAccountEpoch()、是否載入中） */
export interface CurrentAccount {
  mode: string;
  key: string | null;
  epoch: unknown;
  isLoading: boolean;
}

/** 訪客本機結算被擋下時，結算畫面的說明 */
export const LOCAL_NOT_SAVED_TEXT =
  "這場沒有寫入本機進度：出征後帳號來源已變更，請重新選關再出征。";

/** 部署選單的武將卡被擋下時的說明 */
export const HERO_DEPLOY_BLOCKED_TEXT =
  "這一場是換帳號前的出征，請重新選關再派武將。";

const isAccountMode = (mode: unknown): boolean =>
  mode === "guest" || mode === "shared";

const isKey = (key: unknown): key is string =>
  typeof key === "string" && key.trim() !== "";

const isEpoch = (epoch: unknown): epoch is number =>
  typeof epoch === "number" && Number.isSafeInteger(epoch) && epoch >= 0;

/** 這個來源是不是目前帳號的當場身份（模式、金鑰、世代都相同，而且目前不在載入中） */
export function isCurrentAccount(
  owner: BattleSourceOwner,
  current: CurrentAccount
): boolean {
  return (
    isAccountMode(owner.mode) &&
    owner.mode === current.mode &&
    isKey(owner.key) &&
    isKey(current.key) &&
    owner.key === current.key &&
    isEpoch(owner.epoch) &&
    isEpoch(current.epoch) &&
    owner.epoch === current.epoch &&
    current.isLoading === false
  );
}

/** 訪客的本機結算：目前是訪客，而且這一場的來源就是目前這個訪客（同一個世代） */
export function guestRewardAllowed(
  battleOwner: BattleSourceOwner,
  current: CurrentAccount
): boolean {
  return (
    current.mode === "guest" &&
    battleOwner.mode === "guest" &&
    isCurrentAccount(battleOwner, current)
  );
}

/** 派武將：這一場的來源與部署選單的隊伍來源都是目前帳號的當場身份 */
export function heroDeployAllowed(
  battleOwner: BattleSourceOwner,
  menuTeamOwner: BattleSourceOwner,
  current: CurrentAccount
): boolean {
  return (
    isCurrentAccount(battleOwner, current) &&
    isCurrentAccount(menuTeamOwner, current)
  );
}

/** 出征原因只看的帳號狀態：模式、玩家資料的出征隊伍、雲端隊伍能不能在這裡編輯（頁面傳 store 當下的值） */
export interface SortieSourceState {
  mode: string;
  player: { team: readonly unknown[] } | null;
  teamEditable: boolean;
}

/**
 * 共用帳號不能出征的原因（「進入戰場」「迎戰」與新開「自動」共用）：不是共用帳號或沒有玩家資料是 null；
 * 雲端隊伍不支援優先，其次沒有隊伍；其他都是 null（唯讀、保存中、待確認、設定、練習、載入中、換帳號後的舊場都不在這裡判斷）
 */
export function sortieBlockReasonOf(state: SortieSourceState): string | null {
  if (state.mode !== "shared" || !state.player) return null;
  if (!state.teamEditable) return "雲端的出征隊伍這裡還不支援：暫時不能出征";
  if (state.player.team.length === 0)
    return "還沒有出征隊伍：請先到「隊伍」編排並保存";
  return null;
}
