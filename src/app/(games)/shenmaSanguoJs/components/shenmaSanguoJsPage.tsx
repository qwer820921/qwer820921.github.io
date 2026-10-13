"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Row, Col } from "react-bootstrap";
import {
  DeployMenuContext,
  LocalGameBridge,
  PlacementMenuData,
} from "../engine/LocalGameBridge";
import {
  StatsSyncData,
  BattleResultData,
  GameState,
} from "../engine/BattleManager";
import { TowerEntity } from "../engine/entities/TowerEntity";
import {
  MoveRejectReason,
  MoveTarget,
  MoveUnitKind,
  TowerSellRequest,
  TowerSellResult,
} from "../engine/BattleEngine";
import { HeroEntity, HeroStateData } from "../engine/entities/HeroEntity";
import {
  BUILTIN_STAGES,
  BUILTIN_HEROES_CONFIG,
  BUILTIN_ENEMIES_CONFIG,
  DEFAULT_PLAYER_HEROES,
  StageData,
} from "../engine/builtinData";
import { StageDataManager } from "../engine/StageDataManager";
import {
  getNextStage,
  getStageDataProblem,
  isStageUnlocked,
} from "../utils/stagePlayability";
import { describePendingStage } from "../utils/sharedSettleDisplay";
import { canvasHeroSkill } from "../utils/heroSkillBinding";
import {
  CurrentAccount,
  guestRewardAllowed,
  heroDeployAllowed,
  HERO_DEPLOY_BLOCKED_TEXT,
  isCurrentAccount,
  LOCAL_NOT_SAVED_TEXT,
} from "../utils/battleAccountBoundary";
import { useJsPlayerStore } from "../store/useJsPlayerStore";
import { BattleRewardResult, TeamSlot } from "../types/player";
import { KeySetupModal } from "./KeySetupModal";
import { PlayerInfoModal } from "./PlayerInfoModal";
import { TeamEditModal } from "./TeamEditModal";
import { HeroRosterModal } from "./HeroRosterModal";
import { SettingsModal } from "./SettingsModal";
import { BattleCanvasView } from "./BattleCanvasView";
import { PlacementMenuModal } from "./PlacementMenuModal";
import { UpgradePanelModal } from "./UpgradePanelModal";
import { HeroInfoModal } from "./HeroInfoModal";
import { BattleResultModal } from "./BattleResultModal";
import { StageSelectorModal } from "./StageSelectorModal";
import { MoveUnitPanel } from "./MoveUnitPanel";
import { BattleTips } from "./BattleTips";
import { NextWaveModal } from "./NextWaveModal";
import styles from "../styles/shenmaSanguoJs.module.css";

/** 關卡、武將與敵人設定都已讀到後端（或它的快取），不是內建的代用資料 */
const isRemoteConfig = (mgr: StageDataManager) =>
  mgr.getStages() !== BUILTIN_STAGES &&
  mgr.getHeroesConfig() !== BUILTIN_HEROES_CONFIG &&
  mgr.getEnemiesConfig() !== BUILTIN_ENEMIES_CONFIG;

/** 訪客或尚未登入時的預設出征武將（附正式技能表的技能）。只建立一次：不相關的存檔更新不會換掉它、不會讓備戰中的戰場重新載入 */
const DEFAULT_SORTIE_HEROES: HeroStateData[] = DEFAULT_PLAYER_HEROES.map(
  (h) => ({ ...h, ...canvasHeroSkill(h.hero_id) })
);

const DEFAULT_STATS: StatsSyncData = {
  battle_id: "",
  gold: 5000,
  wave: 0,
  total_waves: 5,
  hp: 20,
  max_hp: 20,
  game_state: GameState.PREP,
  auto_mode: false,
  auto_next_wave_pending: false,
  speed: 1,
  time_scale: 1,
  deploy_slow: false,
  paused: false,
};

/** 出征隊伍資料的來源：帳號模式、金鑰與帳號世代（世代是 store 換上這份玩家資料當下的世代；不知道時是 null） */
interface TeamOwner {
  mode: string;
  key: string | null;
  epoch: number | null;
}

/** 同一次計算得到的出征隊伍與它的來源（載入與同步都整份傳，不分開取） */
interface TeamSource {
  heroes: HeroStateData[];
  owner: TeamOwner;
}

const sameOwner = (a: TeamOwner, b: TeamOwner) =>
  a.mode === b.mode && a.key === b.key && a.epoch === b.epoch;

/** 判斷隊伍來源時讀的 store 欄位（只讀） */
interface TeamSourceState {
  isLoading: boolean;
  mode: string;
  player: { key: string } | null;
  teamEditable: boolean;
  readOnly: boolean;
  getAccountEpoch: () => number;
}

/**
 * 這份隊伍來源現在能不能用（建立新的一場或同步到場上之前檢查，在任何副作用之前）：
 * - 一般：只接受已選的帳號（訪客或共用帳號）：store 有玩家資料、來源的金鑰是非空字串而且等於玩家的金鑰、
 *   模式與帳號世代都等於 store 現在（世代要已知；金鑰相同但世代不同不算）、不在載入中；
 *   共用帳號另外要隊伍可編輯、不是唯讀。還沒選帳號（mode none）不論世代都不由這裡放行
 * - 首次內建展示（bootstrap 為 true：還沒有任何一場、這次用內建設定）：來源和 store 都還沒選帳號
 *   （兩邊 mode none、store 沒有玩家資料、來源沒有金鑰）時可以載入；這一場用內建設定（configReady false），不寫入共用進度
 */
const teamSourceUsable = (
  owner: TeamOwner,
  s: TeamSourceState,
  bootstrap: boolean
): boolean =>
  ((owner.mode === "guest" || owner.mode === "shared") &&
    s.mode === owner.mode &&
    s.player !== null &&
    owner.key !== null &&
    owner.key.trim() !== "" &&
    s.player.key === owner.key &&
    owner.epoch !== null &&
    s.getAccountEpoch() === owner.epoch &&
    !s.isLoading &&
    (owner.mode !== "shared" || (s.teamEditable && !s.readOnly))) ||
  (bootstrap &&
    owner.mode === "none" &&
    owner.key === null &&
    s.mode === "none" &&
    s.player === null);

/** 從 store 讀到的目前帳號（模式、玩家資料的金鑰、帳號世代、是否載入中），交給 battleAccountBoundary 的純函式 */
const currentAccountOf = (s: TeamSourceState): CurrentAccount => ({
  mode: s.mode,
  key: s.player?.key ?? null,
  epoch: s.getAccountEpoch(),
  isLoading: s.isLoading,
});

/** 換帳號後的舊場不能移動武將（塔不受帳號影響） */
const MOVE_HERO_BLOCKED_TEXT = "這一場是換帳號前的出征，不能移動武將。";

/**
 * 武將資訊或塔的面板「這一次」打開時的固定快照：每次打開都是新的物件與編號（同一個實例、同一格重開也不同）。
 * 只凍結快照本身（實例仍是場上的那一個），只在本機記憶體，不保存、不序列化
 */
interface MovePanelSnapshot {
  readonly seq: number;
  readonly kind: MoveUnitKind;
  readonly unit: HeroEntity | TowerEntity;
  readonly battleId: string;
  readonly from: Readonly<{ col: number; row: number }>;
}

/** 移位沒有成功時給玩家看的簡短說明（不成功時什麼都沒移動） */
function moveRejectText(reason: MoveRejectReason): string {
  switch (reason) {
    case "not_prep":
      return "只有備戰時可以移動。";
    case "paused":
      return "暫停中不能移動。";
    case "stale_battle":
      return "這個單位不在目前這一場，請重新點選。";
    case "not_found":
      return "這個單位已經不在場上。";
    case "source_changed":
      return "這個單位的位置已經改變，請重新點選。";
    case "stale_move":
      return "這次移動已經結束，請重新點選。";
    case "same_cell":
      return "那是原本的格子，已取消移動。";
    case "occupied":
      return "那一格已經有單位，已取消移動。";
    default:
      return "那一格不能放，已取消移動。";
  }
}

const ShenmaSanguoJsPage: React.FC = () => {
  const bridgeRef = useRef<LocalGameBridge | null>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const containerSizeRef = useRef<{ w: number; h: number } | null>(null);

  // 玩家存檔與帳號狀態 (Zustand)
  const {
    player,
    syncStatus,
    hasCheckedStorage,
    init: initPlayer,
    loginWithKey,
    createProfile,
    startGuestMode,
    logout,
    updateNickname,
    updateTeam,
    requestHeroUpgrade,
    upgradePreview,
    heroCostOf,
    settleBattle,
    forceSync,
    exportBackup,
    importBackup,
    mode,
    readOnly,
    teamEditable,
    notice,
    busy,
    writeBlocked,
    pendingCreateKey,
    error: accountError,
    settleArmed,
    sortieNote,
    settleView,
    pendingSettle,
    retrySharedSettle,
  } = useJsPlayerStore();

  // 共用帳號不能寫入的原因（唯讀、結果待確認、正在保存）；訪客沒有限制
  const writeBlockReason =
    mode !== "shared"
      ? null
      : readOnly
        ? "雲端存檔目前只能查看，不能寫入"
        : pendingSettle
          ? pendingSettle.status === "unavailable"
            ? "瀏覽器的暫存讀不到，暫時不能寫入"
            : pendingSettle.status === "review"
              ? "有一場戰鬥結算要人工確認，確認前不能寫入"
              : "有一場戰鬥結算待確認：請先按「重新確認」"
          : writeBlocked
            ? "上一個保存的結果不明：請先在主公資訊按「手動同步」確認"
            : busy
              ? "正在保存，請稍候"
              : settleArmed
                ? "出征中：這場結算完成前不能修改共用存檔"
                : null;
  // 待確認結算是哪一關：只用暫存記下的關卡 ID（不是目前選中的關卡）；關卡名稱確認來自後端才顯示名稱
  const pendingStageLabel =
    mode === "shared" && pendingSettle
      ? describePendingStage(
          pendingSettle,
          StageDataManager.getInstance().getStages(),
          StageDataManager.getInstance().hasConfirmedStageNames()
        )
      : null;
  const teamBlockReason =
    writeBlockReason ??
    (mode === "shared" && !teamEditable
      ? "雲端的出征隊伍這裡還不支援：原樣保留，暫時不能在這裡修改"
      : null);
  // 共用帳號不能出征的原因：雲端隊伍不支援，或還沒有隊伍（不自動換成預設隊伍）
  const sortieBlockReason =
    mode !== "shared" || !player
      ? null
      : !teamEditable
        ? "雲端的出征隊伍這裡還不支援：暫時不能出征"
        : player.team.length === 0
          ? "還沒有出征隊伍：請先到「隊伍」編排並保存"
          : null;

  // 戰鬥狀態管理
  const [stats, setStats] = useState<StatsSyncData>(DEFAULT_STATS);
  const [allStages, setAllStages] = useState<StageData[]>(BUILTIN_STAGES);
  const [currentStage, setCurrentStage] = useState<StageData>(
    BUILTIN_STAGES[0]
  );
  const [placementMenu, setPlacementMenu] = useState<PlacementMenuData | null>(
    null
  );
  const [upgradeTower, setUpgradeTower] = useState<TowerEntity | null>(null);
  // 防禦塔面板打開時這座塔所屬的那一場（拆除請求帶回這一場，不換成之後的新場次）
  const [towerPanelBattleId, setTowerPanelBattleId] = useState<string | null>(
    null
  );
  const [heroInfo, setHeroInfo] = useState<HeroEntity | null>(null);
  const [battleResult, setBattleResult] = useState<BattleResultData | null>(
    null
  );
  const [battleReward, setBattleReward] = useState<BattleRewardResult | null>(
    null
  );
  // 訪客這場勝利沒有寫入本機進度的原因（出征後帳號來源已變更）；沒有就是 null
  const [localNotSavedReason, setLocalNotSavedReason] = useState<string | null>(
    null
  );
  // 目前這一場的出征來源（battleCtxRef 的 owner 給畫面用的副本：部署選單的武將卡據此判斷能不能派）
  const [battleOwner, setBattleOwner] = useState<TeamOwner | null>(null);
  // 移位：目前有效的那一次面板快照（打開面板時建立；關閉、開始移動成功、換場、該武將離場時消費）。
  // 按鈕綁定的是打開那一次的快照（panelSnap），這個 ref 只用來核它是不是仍然有效
  const panelUnitRef = useRef<MovePanelSnapshot | null>(null);
  const panelSeqRef = useRef(0);
  const [panelSnap, setPanelSnap] = useState<MovePanelSnapshot | null>(null);
  // 進行中的移位（畫面用）：引擎給的移動編號、這一場、種類、名稱與合法目的格；ref 給回呼讀最新值
  const [moveState, setMoveState] = useState<{
    moveId: number;
    battleId: string;
    kind: MoveUnitKind;
    name: string;
    targets: MoveTarget[];
  } | null>(null);
  const moveStateRef = useRef<typeof moveState>(null);
  // 移位沒有成功或被取消時的說明
  const [moveNotice, setMoveNotice] = useState<string | null>(null);
  const [placedHeroIds, setPlacedHeroIds] = useState<string[]>([]);

  // 視窗 Modal 顯示狀態
  const [isStageSelectorOpen, setIsStageSelectorOpen] = useState(false);
  const [isPlayerInfoOpen, setIsPlayerInfoOpen] = useState(false);
  const [isTeamEditOpen, setIsTeamEditOpen] = useState(false);
  const [isHeroRosterOpen, setIsHeroRosterOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isKeySwitchOpen, setIsKeySwitchOpen] = useState(false);
  const [isBattleTipsOpen, setIsBattleTipsOpen] = useState(false);
  const [isNextWaveOpen, setIsNextWaveOpen] = useState(false);

  // 音訊靜音狀態
  const [isBgmMuted, setIsBgmMuted] = useState(false);
  const [isSfxMuted, setIsSfxMuted] = useState(false);

  // 玩家資料是在哪個帳號世代換上的：store 換 player／mode／teamEditable 的當下記下世代（訂閱回呼和 store 的 set 同步執行）。
  // 出征隊伍的來源只用這裡記下的世代，不在之後用當下的世代替舊資料補上身份（登入失敗時資料不變、世代已換，就對不上）。
  // 要在初始化玩家存檔之前訂閱
  const [playerEpoch, setPlayerEpoch] = useState<{
    player: typeof player;
    mode: string;
    teamEditable: boolean;
    epoch: number;
  } | null>(null);
  useEffect(
    () =>
      useJsPlayerStore.subscribe((s, prev) => {
        if (
          s.player !== prev.player ||
          s.mode !== prev.mode ||
          s.teamEditable !== prev.teamEditable
        ) {
          setPlayerEpoch({
            player: s.player,
            mode: s.mode,
            teamEditable: s.teamEditable,
            epoch: s.getAccountEpoch(),
          });
        }
      }),
    []
  );

  // 初始化玩家存檔
  useEffect(() => {
    void initPlayer();
  }, [initPlayer]);

  // 當前出征隊伍武將名單（嚴格取自 player.team 與 player.heroes；數值 0 照樣是 0）。
  // 共用帳號沒有隊伍或隊伍不支援時是空的（不自動換成預設隊伍）；訪客或尚未登入時照原本的預設展示。
  // 技能只照武將是誰從正式技能表帶入（canvasHeroSkill），不來自存檔或後端設定，也不寫回存檔。
  // 和隊伍一起記下來源（模式、金鑰、這份資料換上時的世代；記下的資料不是畫面上這一份時世代是 null）
  const activeTeam: TeamSource = useMemo(() => {
    const owner: TeamOwner = {
      mode,
      key: player?.key ?? null,
      epoch:
        playerEpoch &&
        playerEpoch.player === player &&
        playerEpoch.mode === mode &&
        playerEpoch.teamEditable === teamEditable
          ? playerEpoch.epoch
          : null,
    };
    if (
      !player ||
      !player.team ||
      player.team.length === 0 ||
      (mode === "shared" && !teamEditable)
    ) {
      return { heroes: mode === "shared" ? [] : DEFAULT_SORTIE_HEROES, owner };
    }
    return {
      heroes: player.team.map((slot) => {
        const heroState = player.heroes.find((h) => h.hero_id === slot.hero_id);
        return {
          hero_id: slot.hero_id,
          level: heroState?.level ?? 1,
          star: heroState?.star ?? 1,
          atk: heroState?.atk ?? 100,
          def: heroState?.def ?? 50,
          hp: heroState?.hp ?? 1000,
          ...canvasHeroSkill(slot.hero_id),
        };
      }),
      owner,
    };
  }, [player, mode, teamEditable, playerEpoch]);
  const activeTeamHeroes = activeTeam.heroes;

  const currentStageRef = useRef<StageData>(BUILTIN_STAGES[0]);
  const statsRef = useRef<StatsSyncData>(stats);
  // 畫面上開著的部署選單（引擎派出成功通知關閉時，用它打開時的這一場與編號關閉慢速）
  const placementMenuRef = useRef<PlacementMenuData | null>(null);
  const activeTeamRef = useRef<TeamSource>(activeTeam);
  // 目前載入的這一場：每次 loadStage 產生一個 battleId，開戰與結算都用同一個（共用帳號在第一次進入戰鬥時固定）
  const battleCtxRef = useRef<{
    battleId: string;
    stageId: string;
    /** 這場用的是後端的關卡、武將與敵人設定 */
    configReady: boolean;
    /** 載入時這一關還沒解鎖（只能從自由演練進來） */
    practice: boolean;
    armTried: boolean;
    /** 這一場的出征隊伍來自哪個帳號（模式、金鑰、世代）：同一個來源的隊伍改變才同步到場上 */
    owner: TeamOwner;
    /** 已經套到場上的隊伍資料（載入時的隊伍，或最後一次成功同步的；同一份不重複同步） */
    syncedTeam: string;
  } | null>(null);
  const battleSeqRef = useRef(0);
  const [settleRetryMsg, setSettleRetryMsg] = useState<string | null>(null);

  /**
   * 載入一場（初始、遠端設定就緒、換關、換帳號時的第 0 波備戰、下一關、重新挑戰都經過這裡）：產生新的 battleId、
   * 記下這場是否用後端設定與是否為自由演練，以及出征隊伍與它的來源（同一份快照），放下上一場還沒結束的固定。
   * 來源不是 store 目前的帳號（見 teamSourceUsable）就不載入、回傳 false：battleId、這一場、場上、名單、選單與固定都不動
   */
  const loadBattle = useCallback(
    (stage: StageData, team: TeamSource, builtin = false): boolean => {
      const playerHeroes = team.heroes;
      const bridge = bridgeRef.current;
      if (!bridge) return false;
      if (
        !teamSourceUsable(
          team.owner,
          useJsPlayerStore.getState(),
          builtin && battleCtxRef.current === null
        )
      )
        return false;
      const mgr = StageDataManager.getInstance();
      const battleId = `battle_${Date.now()}_${++battleSeqRef.current}`;
      const st = useJsPlayerStore.getState();
      const c = st.canonical;
      battleCtxRef.current = {
        battleId,
        stageId: stage.map_id,
        configReady:
          !builtin && isRemoteConfig(mgr) && mgr.getStages().includes(stage),
        practice:
          st.mode === "shared" &&
          !isStageUnlocked(
            stage.map_id,
            typeof c?.max_stage === "string" ? c.max_stage : undefined,
            c?.cleared_stages as Record<string, number> | undefined
          ),
        armTried: false,
        owner: team.owner,
        syncedTeam: JSON.stringify(playerHeroes),
      };
      st.disarmSharedSettle();
      bridge.loadStage({
        stageId: stage.map_id,
        battleId,
        totalWaves: stage.waves.length,
        pathJson: stage.path_json,
        waves: stage.waves,
        heroesConfig: builtin ? BUILTIN_HEROES_CONFIG : mgr.getHeroesConfig(),
        enemiesConfig: builtin
          ? BUILTIN_ENEMIES_CONFIG
          : mgr.getEnemiesConfig(),
        playerHeroes,
      });
      // 換成新的一場（場上沒有武將）：部署選單的「已在場上」名單與還開著的部署選單（指向上一場的格子）一起清掉
      setPlacedHeroIds([]);
      setPlacementMenu(null);
      placementMenuRef.current = null;
      setBattleOwner(team.owner);
      return true;
    },
    []
  );

  useEffect(() => {
    currentStageRef.current = currentStage;
  }, [currentStage]);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    activeTeamRef.current = activeTeam;
  }, [activeTeam]);

  // 載入關卡（由關卡選擇視窗、結算下一關或重新挑戰觸發）。出征隊伍的來源不是目前的帳號時不載入、什麼都不清（回傳 false）
  const loadStageData = useCallback(
    (stage: StageData): boolean => {
      if (getStageDataProblem(stage)) {
        console.warn("[ShenmaSanguoJs] 嘗試載入未開放關卡:", stage.map_id);
        setIsStageSelectorOpen(true);
        return false;
      }
      const team = activeTeamRef.current;
      if (
        !bridgeRef.current ||
        !teamSourceUsable(team.owner, useJsPlayerStore.getState(), false)
      )
        return false;

      setCurrentStage(stage);
      currentStageRef.current = stage;
      setPlacementMenu(null);
      setUpgradeTower(null);
      setHeroInfo(null);
      panelUnitRef.current = null;
      setPanelSnap(null);
      setBattleResult(null);
      setBattleReward(null);
      setLocalNotSavedReason(null);
      setPlacedHeroIds([]);

      return loadBattle(stage, team);
    },
    [loadBattle]
  );

  /** 畫面上的移位狀態與 ref 一起更新 */
  const applyMoveState = useCallback((next: typeof moveState) => {
    moveStateRef.current = next;
    setMoveState(next);
  }, []);

  /**
   * 提交移位（畫布點的格子與鍵盤確認都走這裡）：只處理畫面上正在進行的這一次（移動編號不同的舊面板或晚到的點選不動新的移動）；
   * 武將先用 store 當下的帳號核這一場的來源（和派武將相同的規則，換帳號、同一把金鑰的新世代、還沒選帳號、載入中都不移）；
   * 之後由引擎全部重核。沒有移動就取消這次移動並說明原因
   */
  const commitMoveTo = useCallback(
    (moveId: number, col: number, row: number) => {
      const bridge = bridgeRef.current;
      const ms = moveStateRef.current;
      if (!bridge || !ms || ms.moveId !== moveId) return;
      const ctx = battleCtxRef.current;
      if (
        ms.kind === "hero" &&
        (!ctx ||
          ctx.battleId !== ms.battleId ||
          !isCurrentAccount(
            ctx.owner,
            currentAccountOf(useJsPlayerStore.getState())
          ))
      ) {
        bridge.cancelMove(ms.moveId);
        applyMoveState(null);
        setMoveNotice(MOVE_HERO_BLOCKED_TEXT);
        return;
      }
      const result = bridge.commitMove(ms.moveId, col, row);
      if (result.ok) {
        // 移動完成：引擎的移位結束通知會清掉畫面上的移位狀態
        setMoveNotice(null);
        return;
      }
      bridge.cancelMove(ms.moveId);
      applyMoveState(null);
      setMoveNotice(moveRejectText(result.reason));
    },
    [applyMoveState]
  );

  // 初始化 Bridge 實例（只在 mount 時建立一次，避免因 stats 或 currentStage 變更而重複重建）
  useEffect(() => {
    const bridge = new LocalGameBridge();
    bridgeRef.current = bridge;

    bridge.onStatsChanged = (s) => {
      setStats(s);
      // 共用帳號：這一場第一次進入戰鬥時固定（按進入戰場、自動、下一波都一樣），每場只試一次
      const ctx = battleCtxRef.current;
      if (
        ctx &&
        !ctx.armTried &&
        s.game_state === GameState.BATTLE &&
        s.battle_id === ctx.battleId
      ) {
        ctx.armTried = true;
        const mgr = StageDataManager.getInstance();
        const remote = ctx.configReady && isRemoteConfig(mgr);
        useJsPlayerStore.getState().armSharedSettle({
          battleId: ctx.battleId,
          stageId: ctx.stageId,
          configReady: remote,
          completeStageIds: new Set(
            remote
              ? mgr
                  .getStages()
                  .filter((x) => !getStageDataProblem(x))
                  .map((x) => x.map_id)
              : []
          ),
          practice: ctx.practice,
        });
      }
    };
    bridge.onPlacementMenuOpen = (m) => {
      if (m) {
        placementMenuRef.current = m;
        setPlacementMenu(m);
        return;
      }
      // 引擎派出成功時要求關閉：用畫面上那個選單打開時的這一場與編號關閉（恢復玩家選的速度）
      const cur = placementMenuRef.current;
      placementMenuRef.current = null;
      if (cur) bridge.closeDeployMenu(cur);
      setPlacementMenu(null);
    };
    // 打開塔或武將的面板：建立這一次面板的新快照（這一場、這個實例與它當時的格子；移位只用這一份）
    const openPanelSnapshot = (
      kind: MoveUnitKind,
      unit: HeroEntity | TowerEntity,
      battleId: string
    ) => {
      const snap: MovePanelSnapshot = Object.freeze({
        seq: ++panelSeqRef.current,
        kind,
        unit,
        battleId,
        from: Object.freeze({ col: unit.gridCell.col, row: unit.gridCell.row }),
      });
      panelUnitRef.current = snap;
      setPanelSnap(snap);
      setMoveNotice(null);
    };
    bridge.onUpgradePanelOpen = (tw, context) => {
      setUpgradeTower(tw);
      setTowerPanelBattleId(tw && context ? context.battleId : null);
      if (tw && context) {
        openPanelSnapshot("tower", tw, context.battleId);
      } else if (!tw && panelUnitRef.current?.kind === "tower") {
        // 塔賣掉而關閉面板：消費塔的快照
        panelUnitRef.current = null;
        setPanelSnap(null);
      }
    };
    bridge.onHeroInfoOpen = (h, context) => {
      setHeroInfo(h);
      if (h && context) openPanelSnapshot("hero", h, context.battleId);
    };
    // 移位結束（移動、取消或失效）：只處理這個 bridge、目前畫面上的這次移動（舊的通知不清新的移動）
    bridge.onMoveEnded = (info) => {
      if (bridgeRef.current !== bridge) return;
      const ms = moveStateRef.current;
      if (!ms || ms.moveId !== info.moveId || ms.battleId !== info.battleId)
        return;
      applyMoveState(null);
      if (info.reason === "invalidated") {
        setMoveNotice("移動已取消：不在備戰、暫停了，或場上已經改變。");
      }
    };
    // 移位模式中點了畫布的某一格：走同一個提交入口
    bridge.onMoveCellPicked = (pick) => {
      if (bridgeRef.current !== bridge) return;
      const ms = moveStateRef.current;
      if (!ms || ms.moveId !== pick.moveId || ms.battleId !== pick.battleId)
        return;
      commitMoveTo(pick.moveId, pick.col, pick.row);
    };
    // 武將陣亡：只處理目前這個 bridge 與這一場（舊場次晚到的通知不改新場的名單）；部署選單的「已在場上」換成這一場還活著的武將，
    // 陣亡的那一位就能再派；武將資訊只在顯示的正是陣亡的那個實例時關閉。
    // 隊伍同步（數值更新或不在隊伍裡而離場）同樣只處理這一場：名單換新（也讓開著的武將資訊重新顯示更新後的數值），
    // 武將資訊只在顯示的正是離場的那個實例時關閉
    bridge.onHeroRosterChanged = (info) => {
      if (
        bridgeRef.current !== bridge ||
        info.battleId !== battleCtxRef.current?.battleId
      ) {
        return;
      }
      setPlacedHeroIds([...info.aliveHeroIds]);
      if ("died" in info) {
        setHeroInfo((cur) => (cur === info.died ? null : cur));
      } else {
        setHeroInfo((cur) => (cur && info.removed.includes(cur) ? null : cur));
      }
      // 面板快照對應的武將陣亡或離場：這一次面板的「移動」失效
      const snapNow = panelUnitRef.current;
      if (
        snapNow &&
        snapNow.kind === "hero" &&
        ("died" in info
          ? snapNow.unit === info.died
          : info.removed.some((h) => h === snapNow.unit))
      ) {
        panelUnitRef.current = null;
        setPanelSnap(null);
      }
    };

    bridge.onBattleEnded = (r) => {
      // 只處理目前載入的這一場（舊場次晚到的回呼不改畫面、不結算）
      const ctx = battleCtxRef.current;
      if (!ctx || !r || r.battle_id !== ctx.battleId) return;
      // 這一場結束：清掉頁面上還開著的部署選單（引擎已經關閉這一場的選單；不清的話關掉結算或地圖後舊選單會再出現）
      placementMenuRef.current = null;
      setPlacementMenu(null);
      // 這一場的升級面板與武將資訊也一起關掉（否則關掉結算或地圖後舊面板會回到最上層）
      setUpgradeTower(null);
      setHeroInfo(null);
      setBattleResult(r);
      setSettleRetryMsg(null);
      setLocalNotSavedReason(null);
      const store = useJsPlayerStore.getState();
      if (store.mode === "shared") {
        // 共用帳號：只用引擎回呼的凍結結果（星數、點數、擊殺、時間）結算，獎勵由後端計算
        setBattleReward(null);
        void store.settleSharedBattle(r);
      } else if (r.result === "WIN") {
        // 訪客的本機結算只給這一場的出征來源本人（模式、金鑰、帳號世代都和這時的 store 相同、不在載入中）；
        // 出征後換過帳號（含同一個訪客登出再選回、還沒選帳號）就不結算、不寫本機進度，結算畫面說明原因
        if (guestRewardAllowed(ctx.owner, currentAccountOf(store))) {
          const reward = settleBattle(
            currentStageRef.current.map_id,
            statsRef.current.hp,
            statsRef.current.max_hp
          );
          setBattleReward(reward);
        } else {
          setBattleReward(null);
          setLocalNotSavedReason(LOCAL_NOT_SAVED_TEXT);
        }
      } else {
        setBattleReward(null);
      }
    };

    // 若畫布已掛載，立即初始化與縮放
    if (canvasElementRef.current) {
      bridge.init(canvasElementRef.current);
      if (containerSizeRef.current) {
        bridge.resize(containerSizeRef.current.w, containerSizeRef.current.h);
      }
    }

    // 初始載入當前關卡（內建的代用設定：這場不寫入共用進度）
    loadBattle(currentStageRef.current, activeTeamRef.current, true);

    if (typeof window !== "undefined") {
      (window as unknown as { __testBridge?: LocalGameBridge }).__testBridge =
        bridge;
    }

    // 非同步讀取完整地圖庫清單以供關卡選擇
    const stageMgr = StageDataManager.getInstance();
    void stageMgr.loadAllStages().then((res) => {
      if (res.stages && res.stages.length > 0) {
        setAllStages(res.stages);
        const match = res.stages.find(
          (s) => s.map_id === currentStageRef.current.map_id
        );
        if (match) {
          setCurrentStage(match);
          // 遠端設定就緒：還沒開打時改用後端的資料重新載入這一關（新的 battleId）
          const cur = statsRef.current;
          if (
            bridgeRef.current === bridge &&
            cur.game_state === GameState.PREP &&
            cur.wave === 0 &&
            !cur.paused
          ) {
            currentStageRef.current = match;
            loadBattle(match, activeTeamRef.current);
          }
        }
      }
    });

    return () => {
      if (typeof window !== "undefined") {
        delete (window as unknown as { __testBridge?: LocalGameBridge })
          .__testBridge;
      }
      bridge.destroy();
      bridgeRef.current = null;
      // 這個 bridge 的場次跟著結束：之後新建的 bridge 還沒有任何一場（首次內建展示照常判斷）
      battleCtxRef.current = null;
      setBattleOwner(null);
      panelUnitRef.current = null;
      setPanelSnap(null);
      applyMoveState(null);
    };
  }, [settleBattle, loadBattle, applyMoveState, commitMoveTo]);

  // 移動武將中換了帳號（或同一把金鑰的新世代、登出、載入中）：取消這次移動；塔的移動不受帳號影響
  useEffect(
    () =>
      useJsPlayerStore.subscribe((s) => {
        const ms = moveStateRef.current;
        if (!ms || ms.kind !== "hero") return;
        const ctx = battleCtxRef.current;
        if (ctx && isCurrentAccount(ctx.owner, currentAccountOf(s))) return;
        bridgeRef.current?.cancelMove(ms.moveId);
        applyMoveState(null);
        setMoveNotice(MOVE_HERO_BLOCKED_TEXT);
      }),
    [applyMoveState]
  );

  // 出征隊伍改變時（改隊伍、升級、手動同步讀回、換帳號），只看目前載入的這一場：
  // - 還沒有任何一場（首次內建展示沒有載入，例如一開始就已經選了帳號）：來源可用時照原流程載入第一場
  // - 同一個來源（模式、金鑰、帳號世代都相同），備戰（任何波次）或戰鬥中（暫停中也一樣）：同步到場上，不重新載入
  //   （battleId、波次、塔、金幣、城防、首擊紀錄、暫停都保留）。只在來源可用（teamSourceUsable）、有選帳號時同步；
  //   同一份隊伍不重複同步，不被接受時不記成已同步
  // - 來源不同（換了帳號或帳號世代）：只在這一場還沒開打（第 0 波備戰）時照原本的流程用新的來源重新載入一場
  //   （loadBattle 同樣先核來源）；清完一波回到備戰或戰鬥中不動（換帳號後舊戰場的處理另案）
  useEffect(() => {
    const bridge = bridgeRef.current;
    const ctx = battleCtxRef.current;
    if (!bridge) return;
    if (!ctx) {
      loadBattle(currentStageRef.current, activeTeam);
      return;
    }
    if (stats.battle_id !== ctx.battleId) return;
    if (
      stats.game_state !== GameState.PREP &&
      stats.game_state !== GameState.BATTLE
    )
      return;
    if (!sameOwner(activeTeam.owner, ctx.owner)) {
      if (stats.game_state === GameState.PREP && stats.wave === 0) {
        loadBattle(currentStageRef.current, activeTeam);
      }
      return;
    }
    if (
      activeTeam.owner.mode === "none" ||
      !teamSourceUsable(activeTeam.owner, useJsPlayerStore.getState(), false)
    )
      return;
    const team = JSON.stringify(activeTeam.heroes);
    if (team === ctx.syncedTeam) return;
    if (bridge.syncTeam(ctx.battleId, activeTeam.heroes).ok)
      ctx.syncedTeam = team;
  }, [activeTeam, stats.battle_id, stats.game_state, stats.wave, loadBattle]);

  // 畫布回調
  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    canvasElementRef.current = canvas;
    if (bridgeRef.current) {
      bridgeRef.current.init(canvas);
      if (containerSizeRef.current) {
        bridgeRef.current.resize(
          containerSizeRef.current.w,
          containerSizeRef.current.h
        );
      }
    }
  }, []);

  const handleResize = useCallback((width: number, height: number) => {
    if (width > 0 && height > 0) {
      containerSizeRef.current = { w: width, h: height };
    }
    bridgeRef.current?.resize(width, height);
  }, []);

  // 控制操作（共用帳號的隊伍不支援或沒有隊伍時不能出征）
  const handleStartBattle = () => {
    if (sortieBlockReason) return;
    bridgeRef.current?.startBattle();
  };

  const handleToggleAuto = () => {
    bridgeRef.current?.toggleAuto();
  };

  const handleSetSpeed = (speed: number) => {
    bridgeRef.current?.setSpeed(speed);
  };

  const handleTogglePause = () => {
    bridgeRef.current?.togglePause();
  };

  const handleToggleBgm = () => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    const nextMuted = !isBgmMuted;
    bridge.setBgmMuted(nextMuted);
    setIsBgmMuted(nextMuted);
  };

  const handleToggleSfx = () => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    const nextMuted = !isSfxMuted;
    bridge.setSfxMuted(nextMuted);
    setIsSfxMuted(nextMuted);
  };

  // 部署選單：關閉時帶這個選單打開時的這一場與編號（只關這一個；舊的關閉不影響新的選單）
  const sameMenu = (a: DeployMenuContext, b: DeployMenuContext) =>
    a.battleId === b.battleId && a.menuId === b.menuId;
  const closePlacementMenu = (ctx: DeployMenuContext) => {
    bridgeRef.current?.closeDeployMenu(ctx);
    if (placementMenuRef.current && sameMenu(placementMenuRef.current, ctx)) {
      placementMenuRef.current = null;
    }
    setPlacementMenu((cur) => (cur && sameMenu(cur, ctx) ? null : cur));
  };

  // 建造與放置操作：只用所屬選單（這一場、還開著）派出；過期的選單不派，回傳是否成功
  const handlePlaceTower = (
    ctx: DeployMenuContext,
    col: number,
    row: number,
    typeKey: string
  ): boolean => {
    const bridge = bridgeRef.current;
    if (!bridge || !bridge.isDeployMenuOpen(ctx)) return false;
    return bridge.placeTower(col, row, typeKey);
  };

  const handlePlaceHero = (
    ctx: DeployMenuContext,
    col: number,
    row: number,
    heroState: HeroStateData
  ): boolean => {
    const bridge = bridgeRef.current;
    if (!bridge || !bridge.isDeployMenuOpen(ctx)) return false;
    // 換帳號後的舊場不派武將：這一場的出征來源與部署選單的隊伍來源，都要是 store 這時的帳號（模式、金鑰、世代、不在載入中）；
    // 用 store 當下的值核對，不用可能還沒更新的頁面快照代替。擋下時什麼都不改（不派、不改名單、不關選單）
    const battle = battleCtxRef.current;
    if (
      !battle ||
      !heroDeployAllowed(
        battle.owner,
        activeTeamRef.current.owner,
        currentAccountOf(useJsPlayerStore.getState())
      )
    )
      return false;
    const success = bridge.placeHero(col, row, heroState);
    if (success) {
      setPlacedHeroIds((prev) => [...prev, heroState.hero_id]);
    }
    return success;
  };

  /**
   * 開始移位（武將資訊或塔面板的「移動」）：snap 是按鈕所在那一次面板打開時的快照，請求的實例、場次與來源格都由它而來，
   * 不用畫面的 stats、舊的隊伍快照或按下時的最新面板。快照要仍是目前有效的那一次（重開、關閉、開始成功後就換新或消費）：
   * 過期的不開始、不取消目前的移動，正在移動時也不改說明。武將另外用 store 當下的帳號核這一場的來源。
   * 引擎接受才消費這次快照、關掉原面板、進入移位模式（同一個按鈕重播不會再開始）
   */
  const handleMoveStart = (
    kind: MoveUnitKind,
    snap: MovePanelSnapshot | null
  ) => {
    const bridge = bridgeRef.current;
    const ctx = battleCtxRef.current;
    if (!snap || panelUnitRef.current !== snap || snap.kind !== kind) {
      if (!moveStateRef.current) setMoveNotice("請重新點選要移動的單位。");
      return;
    }
    const cap = snap;
    if (!bridge || !ctx || cap.battleId !== ctx.battleId) {
      setMoveNotice("請重新點選要移動的單位。");
      return;
    }
    if (
      kind === "hero" &&
      !isCurrentAccount(
        ctx.owner,
        currentAccountOf(useJsPlayerStore.getState())
      )
    ) {
      setMoveNotice(MOVE_HERO_BLOCKED_TEXT);
      return;
    }
    const result = bridge.beginMove(cap.battleId, kind, cap.unit, cap.from);
    if (!result.ok) {
      setMoveNotice(moveRejectText(result.reason));
      return;
    }
    panelUnitRef.current = null;
    setPanelSnap(null);
    if (kind === "hero") setHeroInfo(null);
    else setUpgradeTower(null);
    setMoveNotice(null);
    applyMoveState({
      moveId: result.moveId,
      battleId: result.battleId,
      kind,
      name: result.name,
      targets: bridge.listMoveTargets(result.moveId),
    });
  };

  /**
   * 關閉武將資訊或塔的面板：只關按鈕所在的那一次面板並消費它的快照；舊面板晚到的關閉不動新的面板與快照
   */
  const handleUnitPanelClose = (
    kind: MoveUnitKind,
    snap: MovePanelSnapshot | null
  ) => {
    if (snap && panelUnitRef.current !== snap) return;
    if (snap) {
      panelUnitRef.current = null;
      setPanelSnap(null);
    }
    if (kind === "hero") setHeroInfo(null);
    else setUpgradeTower(null);
  };

  /** 取消移位（不移動任何東西）；只取消畫面上正在進行的這一次 */
  const handleMoveCancel = useCallback(
    (moveId: number) => {
      const ms = moveStateRef.current;
      if (!ms || ms.moveId !== moveId) return;
      bridgeRef.current?.cancelMove(ms.moveId);
      applyMoveState(null);
    },
    [applyMoveState]
  );

  /**
   * 鍵盤選了目的格：只預覽（只預覽畫面上正在進行的這一次）。武將選目的格時也用 store 當下的帳號核這一場的來源，
   * 不是目前的帳號就取消這次移動並說明
   */
  const handleMovePreview = (moveId: number, col: number, row: number) => {
    const bridge = bridgeRef.current;
    const ms = moveStateRef.current;
    if (!bridge || !ms || ms.moveId !== moveId) return;
    const ctx = battleCtxRef.current;
    if (
      ms.kind === "hero" &&
      (!ctx ||
        ctx.battleId !== ms.battleId ||
        !isCurrentAccount(
          ctx.owner,
          currentAccountOf(useJsPlayerStore.getState())
        ))
    ) {
      bridge.cancelMove(ms.moveId);
      applyMoveState(null);
      setMoveNotice(MOVE_HERO_BLOCKED_TEXT);
      return;
    }
    bridge.previewMove(ms.moveId, col, row);
  };

  const handleUpgradeTower = (col: number, row: number) => {
    bridgeRef.current?.upgradeTower(col, row);
  };

  const handleSellTower = (request: TowerSellRequest): TowerSellResult =>
    bridgeRef.current
      ? bridgeRef.current.sellTower(request)
      : { ok: false, reason: "stale_battle", refund: null, canSell: false };

  const handleTargetModeChange = (col: number, row: number, mode: string) => {
    bridgeRef.current?.setTowerTargetMode(col, row, mode);
  };

  // 結算後操作
  // 重新挑戰：結算畫面與獎勵由 loadStageData 在確定載入時才清掉（來源不是目前的帳號時不載入、結算畫面留著）
  const handleRetry = () => {
    loadStageData(currentStage);
  };

  // 下一關：資料完整才算存在；共用帳號另外要在雲端已確認的進度裡已解鎖（這場的結算讀回確認後才會更新）
  const nextStageCandidate = useMemo(() => {
    const nextMapId = getNextStage(currentStage.map_id);
    const nextStage = allStages.find((s) => s.map_id === nextMapId);
    return nextStage && !getStageDataProblem(nextStage) ? nextStage : null;
  }, [allStages, currentStage.map_id]);
  const nextStageUnlocked =
    !!nextStageCandidate &&
    (mode !== "shared" ||
      isStageUnlocked(
        nextStageCandidate.map_id,
        player?.max_stage,
        player?.cleared_stages
      ));
  const hasNextPlayableStage = !!nextStageCandidate && nextStageUnlocked;

  // 下一關：載入時由 loadStageData 清掉結算畫面與獎勵（來源不是目前的帳號時不載入、結算畫面留著）；沒有可玩的下一關時照原本關掉結算、打開關卡選擇
  const handleNextStage = () => {
    if (nextStageCandidate && nextStageUnlocked) {
      loadStageData(nextStageCandidate);
    } else {
      setBattleResult(null);
      setBattleReward(null);
      setIsStageSelectorOpen(true);
    }
  };

  // 隊伍保存（共用帳號等伺服器回應）；成功後畫面的隊伍更新，備戰中會重新傳給 Bridge
  const handleSaveTeam = (newTeam: TeamSlot[]) => updateTeam(newTeam);

  // 共用帳號：使用者明確按「重新確認」才原樣再送待確認的結算（不自動重送）
  const handleRetrySettle = async () => {
    setSettleRetryMsg(null);
    const res = await retrySharedSettle();
    if (!res.success) setSettleRetryMsg(res.error ?? "這次沒有確認");
  };
  // 派武將、建塔、升級的畫面可操作狀態：備戰或戰鬥中、而且這一場還沒有結算結果
  // （引擎結算時只改階段、不送狀態同步，stats 的階段可能仍是戰鬥中，所以另看結算結果）
  const isActionPhase =
    (stats.game_state === GameState.PREP ||
      stats.game_state === GameState.BATTLE) &&
    battleResult === null;
  // 部署選單的武將卡：這一場的出征來源或選單的隊伍來源不是目前的帳號時停用並說明（塔不受影響；
  // 畫面可能晚一拍，真正派出時 handlePlaceHero 會再用 store 當下的值核一次）
  const heroDeployBlockedReason =
    battleOwner &&
    heroDeployAllowed(
      battleOwner,
      activeTeam.owner,
      currentAccountOf(useJsPlayerStore.getState())
    )
      ? null
      : HERO_DEPLOY_BLOCKED_TEXT;
  // 「移動」按鈕：只有這一場的備戰（第 0 波或清波後）、沒有暫停、還沒結算時可以按；武將另外要這一場的來源是目前的帳號
  // （畫面可能晚一拍，真正開始與提交時引擎與 store 會再核一次）
  const moveBlockedReasonFor = (kind: MoveUnitKind): string | null => {
    if (
      battleResult !== null ||
      (stats.game_state !== GameState.PREP &&
        stats.game_state !== GameState.BATTLE)
    )
      return "這一場已經結束，不能移動。";
    if (stats.game_state !== GameState.PREP)
      return "只有備戰時可以移動（戰鬥中不能移動）。";
    if (stats.paused) return "暫停中不能移動。";
    if (
      kind === "hero" &&
      !(
        battleOwner &&
        isCurrentAccount(
          battleOwner,
          currentAccountOf(useJsPlayerStore.getState())
        )
      )
    )
      return MOVE_HERO_BLOCKED_TEXT;
    return null;
  };
  const resultSettleView =
    mode === "shared" &&
    battleResult &&
    settleView &&
    settleView.battleId === battleResult.battle_id
      ? settleView
      : null;

  return (
    <div className={styles.singlePage}>
      {/* 3:4 直式遊戲框戰場區域 */}
      <div className={styles.gamePortraitWrap} data-game-stage>
        <div className={styles.gameWrapper}>
          <BattleCanvasView
            onCanvasReady={handleCanvasReady}
            onResize={handleResize}
          />

          {/* 備戰階段中央金屬「進入戰場」圓形迎戰徽章 */}
          {stats.game_state === GameState.PREP && !stats.paused && (
            <button
              type="button"
              className={styles.centerEnterBattleBtn}
              onClick={handleStartBattle}
              title={sortieBlockReason ?? "開始戰鬥"}
              aria-label="進入戰場"
              disabled={sortieBlockReason !== null}
              data-testid="enter-battle"
            >
              <div className={styles.centerEnterBattleInner}>
                <span>進入</span>
                <span>戰場</span>
              </div>
            </button>
          )}

          {/* 暫停狀態懸浮標籤 */}
          {stats.paused && (
            <div className={styles.pauseBadge}>
              <span>⏸ 已暫停</span>
              <button
                type="button"
                className={styles.pauseBadgeBtn}
                onClick={handleTogglePause}
              >
                繼續
              </button>
            </div>
          )}

          {/* 戰場部署選單 */}
          {placementMenu && (
            <PlacementMenuModal
              show={placementMenu !== null}
              data={placementMenu}
              currentGold={stats.gold}
              playerHeroes={activeTeamHeroes}
              placedHeroIds={placedHeroIds}
              isPaused={stats.paused}
              isActivePhase={isActionPhase}
              heroBlockedReason={heroDeployBlockedReason}
              onPlaceTower={handlePlaceTower}
              onPlaceHero={handlePlaceHero}
              onClose={closePlacementMenu}
            />
          )}

          {/* 防禦塔強化/拆除選單 */}
          {upgradeTower && (
            <UpgradePanelModal
              show={upgradeTower !== null}
              tower={upgradeTower}
              currentGold={stats.gold}
              isPrepPhase={stats.game_state === GameState.PREP}
              isPaused={stats.paused}
              isActivePhase={isActionPhase}
              battleId={towerPanelBattleId}
              onUpgrade={handleUpgradeTower}
              onSell={handleSellTower}
              onTargetModeChange={handleTargetModeChange}
              onClose={() => handleUnitPanelClose("tower", panelSnap)}
              onMove={() => handleMoveStart("tower", panelSnap)}
              moveBlockedReason={moveBlockedReasonFor("tower")}
            />
          )}

          {/* 已部署武將詳情 */}
          {heroInfo && (
            <HeroInfoModal
              show={heroInfo !== null}
              hero={heroInfo}
              onClose={() => handleUnitPanelClose("hero", panelSnap)}
              onMove={() => handleMoveStart("hero", panelSnap)}
              moveBlockedReason={moveBlockedReasonFor("hero")}
            />
          )}
        </div>
      </div>

      {/* 頂部 HUD 狀態列 */}
      <div className={styles.hudTopBar}>
        <button
          type="button"
          className={styles.hudAvatar}
          onClick={() => setIsPlayerInfoOpen(true)}
          title="主公資訊"
          aria-label="主公資訊"
        >
          👤
        </button>
        <div className={styles.hudCenter}>
          <button
            type="button"
            className={styles.hudStageBtn}
            onClick={() => setIsStageSelectorOpen(true)}
            title="切換關卡"
          >
            🗺️
          </button>
          <span className={styles.hudMapName}>
            {currentStage?.name || "未知戰役"}
          </span>
          <span className={styles.hudWave}>
            {stats.wave}/{stats.total_waves}
          </span>
        </div>
        <div className={styles.hudRight}>
          <span className={styles.hudStat}>
            <span style={{ color: "#f59e0b" }}>🪙</span>
            <span>{stats.gold.toLocaleString()}</span>
          </span>
          <span
            className={styles.hudStat}
            style={{
              color:
                stats.hp / stats.max_hp < 0.3
                  ? "#ef4444"
                  : "rgba(255,255,255,0.9)",
            }}
          >
            <span
              style={{
                color: stats.hp / stats.max_hp < 0.3 ? "#ef4444" : "#6366f1",
              }}
            >
              🛡️
            </span>
            <span>
              {stats.hp}/{stats.max_hp}
            </span>
          </span>
          <button
            type="button"
            className={styles.hudStageBtn}
            onClick={() => setIsBattleTipsOpen(!isBattleTipsOpen)}
            title={isBattleTipsOpen ? "收起玩法提示" : "玩法提示"}
          >
            ❓
          </button>
          <button
            type="button"
            className={styles.hudStageBtn}
            onClick={() => setIsSettingsOpen(true)}
            title="系統設定"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* 操作子按鈕列 */}
      <div className={styles.hudActionBar}>
        <div className={styles.hudActionBarLeft}>
          <button
            type="button"
            className={`${styles.hudBarBtn} ${stats.game_state === GameState.BATTLE ? styles.hudBarBtnBattle : ""}`}
            onClick={handleStartBattle}
            disabled={
              stats.game_state !== GameState.PREP ||
              stats.paused ||
              sortieBlockReason !== null
            }
            title={sortieBlockReason ?? undefined}
            data-testid="hud-start-battle"
          >
            {stats.game_state === GameState.BATTLE ? "戰鬥中" : "迎戰"}
          </button>
          <button
            type="button"
            className={`${styles.hudBarBtn} ${stats.auto_mode ? styles.hudActionBtnActive : ""}`}
            onClick={handleToggleAuto}
            disabled={stats.paused}
          >
            自動
          </button>
          <div
            style={{
              display: "inline-flex",
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid rgba(255, 255, 255, 0.18)",
            }}
          >
            <button
              type="button"
              className={`${styles.hudBarBtn} ${styles.hudSpeedBtn} ${stats.speed === 1 ? styles.hudActionBtnActive : ""}`}
              style={{ borderRadius: 0, border: "none" }}
              onClick={() => handleSetSpeed(1)}
              disabled={stats.paused}
            >
              1x
            </button>
            <button
              type="button"
              className={`${styles.hudBarBtn} ${styles.hudSpeedBtn} ${stats.speed === 2 ? styles.hudActionBtnActive : ""}`}
              style={{
                borderRadius: 0,
                border: "none",
                borderLeft: "1px solid rgba(255, 255, 255, 0.18)",
              }}
              onClick={() => handleSetSpeed(2)}
              disabled={stats.paused}
            >
              2x
            </button>
          </div>
          <button
            type="button"
            className={styles.hudBarBtn}
            onClick={handleTogglePause}
          >
            {stats.paused ? "▶ 繼續" : "⏸ 暫停"}
          </button>
          <button
            type="button"
            className={styles.hudBarBtn}
            onClick={() => setIsNextWaveOpen(true)}
          >
            ⏳ 下一波
          </button>
        </div>
        <div className={styles.hudActionBarRight}>
          <button
            type="button"
            className={styles.hudBarBtn}
            onClick={() => setIsHeroRosterOpen(true)}
          >
            武將
          </button>
          <button
            type="button"
            className={styles.hudBarBtn}
            onClick={() => setIsTeamEditOpen(true)}
          >
            隊伍
          </button>
        </div>
      </div>

      {/* 移位面板（在畫布下方，不蓋住格子）：點畫布上的合法格或用鍵盤選目的格 */}
      {moveState && (
        <MoveUnitPanel
          key={moveState.moveId}
          show
          name={moveState.name}
          kindLabel={moveState.kind === "hero" ? "武將" : "防禦塔"}
          targets={moveState.targets}
          onPreview={(col, row) =>
            handleMovePreview(moveState.moveId, col, row)
          }
          onConfirm={(col, row) => commitMoveTo(moveState.moveId, col, row)}
          onCancel={() => handleMoveCancel(moveState.moveId)}
        />
      )}
      {!moveState && moveNotice && (
        <div
          className="small text-warning bg-dark bg-opacity-75 px-2 py-1"
          data-testid="move-notice"
        >
          {moveNotice}
        </div>
      )}

      {/* 共用帳號的說明：不能出征的原因與存檔的狀態（唯讀、衝突、結果待確認、不支援的資料） */}
      {mode === "shared" &&
        (sortieBlockReason ||
          notice ||
          sortieNote ||
          pendingSettle ||
          (settleView?.phase === "confirmed" && !battleResult)) && (
          <div
            className="small text-warning bg-dark bg-opacity-75 px-2 py-1"
            data-testid="shared-account-notice"
          >
            {/* 窄畫面右下角是全站的聊天按鈕：內容放左側，右側留一欄空白（寬畫面不需要） */}
            <Row className="g-0">
              <Col xs={9} lg={12}>
                {sortieBlockReason && (
                  <div data-testid="sortie-blocked">{sortieBlockReason}</div>
                )}
                {sortieNote && (
                  <div data-testid="sortie-settle-note">{sortieNote}</div>
                )}
                {notice && <div>{notice}</div>}
                {/* 待確認的這一場是哪一關（只是資訊，沒有操作） */}
                {pendingStageLabel && (
                  <div data-testid="settle-stage">{pendingStageLabel.text}</div>
                )}
                {/* 重新確認後的結果（結算視窗關掉之後） */}
                {!pendingSettle &&
                  !battleResult &&
                  settleView &&
                  settleView.phase === "confirmed" && (
                    <div data-testid="settle-confirmed">{settleView.text}</div>
                  )}
                {pendingSettle?.status === "pending" && !battleResult && (
                  <div data-testid="settle-pending">
                    {settleView && settleView.phase !== "saving" && (
                      <span data-testid="settle-pending-status">
                        {settleView.text}
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-warning ms-2"
                      onClick={() => void handleRetrySettle()}
                      disabled={busy}
                      data-testid="settle-retry"
                    >
                      重新確認
                    </button>
                    {settleRetryMsg && (
                      <div data-testid="settle-retry-feedback">
                        {settleRetryMsg}
                      </div>
                    )}
                  </div>
                )}
              </Col>
              <Col xs={3} className="d-lg-none" aria-hidden="true" />
            </Row>
          </div>
        )}

      {/* 懸浮玩法提示 */}
      {isBattleTipsOpen && (
        <BattleTips onClose={() => setIsBattleTipsOpen(false)} />
      )}

      {/* 下一波軍情情報彈窗 */}
      <NextWaveModal
        show={isNextWaveOpen}
        waveIndex={stats.wave}
        totalWaves={stats.total_waves}
        waves={currentStage.waves}
        onClose={() => setIsNextWaveOpen(false)}
      />

      {/* 首次進入/尚未登入之金鑰設定視窗 (強制登入或訪客) */}
      <KeySetupModal
        show={hasCheckedStorage && !player}
        onLogin={loginWithKey}
        onCreate={createProfile}
        onGuestMode={startGuestMode}
        canCancel={false}
        initialKey={pendingCreateKey}
        initialError={accountError}
      />

      {/* 切換金鑰彈窗 (自設定或主公資訊開啟) */}
      {isKeySwitchOpen && (
        <KeySetupModal
          show={isKeySwitchOpen}
          onLogin={async (k) => {
            const res = await loginWithKey(k);
            if (res.success) setIsKeySwitchOpen(false);
            return res;
          }}
          onCreate={async (k, n) => {
            const res = await createProfile(k, n);
            if (res.success) setIsKeySwitchOpen(false);
            return res;
          }}
          onGuestMode={async () => {
            await startGuestMode();
            setIsKeySwitchOpen(false);
          }}
          onClose={() => setIsKeySwitchOpen(false)}
          canCancel={true}
        />
      )}

      {/* 主公資訊視窗 */}
      <PlayerInfoModal
        show={isPlayerInfoOpen}
        player={player}
        syncStatus={syncStatus}
        onClose={() => setIsPlayerInfoOpen(false)}
        onUpdateNickname={updateNickname}
        onSwitchKey={loginWithKey}
        onCreateProfile={createProfile}
        onGuestMode={startGuestMode}
        onForceSync={forceSync}
        mode={mode}
        notice={mode === "shared" ? notice : null}
        writeDisabledReason={writeBlockReason}
        onOpenStageSelector={() => {
          setIsPlayerInfoOpen(false);
          setIsStageSelectorOpen(true);
        }}
        onLogout={logout}
      />

      {/* 5 席出征隊伍編排視窗 */}
      <TeamEditModal
        show={isTeamEditOpen}
        player={player}
        onClose={() => setIsTeamEditOpen(false)}
        onSaveTeam={handleSaveTeam}
        heroCostOf={mode === "shared" ? heroCostOf : undefined}
        writeDisabledReason={teamBlockReason}
      />

      {/* 武將名錄與修為升級視窗 */}
      <HeroRosterModal
        show={isHeroRosterOpen}
        player={player}
        onClose={() => setIsHeroRosterOpen(false)}
        onUpgradeHero={requestHeroUpgrade}
        upgradePreview={upgradePreview}
        writeDisabledReason={writeBlockReason}
        serverPriced={mode === "shared"}
      />

      {/* 系統設定與存檔備份視窗 */}
      <SettingsModal
        show={isSettingsOpen}
        isBgmMuted={isBgmMuted}
        isSfxMuted={isSfxMuted}
        onToggleBgm={handleToggleBgm}
        onToggleSfx={handleToggleSfx}
        onExportBackup={exportBackup}
        onImportBackup={importBackup}
        importDisabledReason={
          mode === "shared"
            ? "共用帳號不能用匯入覆蓋雲端存檔（可以匯出備份）。"
            : null
        }
        onSwitchKey={() => {
          setIsSettingsOpen(false);
          logout();
        }}
        onLogout={() => {
          setIsSettingsOpen(false);
          logout();
        }}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* 戰役勝負結算視窗 */}
      <BattleResultModal
        show={battleResult !== null}
        result={battleResult}
        rewardResult={battleReward}
        localNotSavedReason={localNotSavedReason}
        sharedSettle={resultSettleView}
        onRetrySettle={() => void handleRetrySettle()}
        retryDisabled={busy}
        retryMessage={resultSettleView ? settleRetryMsg : null}
        hasNextStage={hasNextPlayableStage}
        nextLocked={!!nextStageCandidate && !nextStageUnlocked}
        onRetry={handleRetry}
        onNextStage={handleNextStage}
        onOpenStageSelector={() => {
          setBattleResult(null);
          setBattleReward(null);
          setLocalNotSavedReason(null);
          setIsStageSelectorOpen(true);
        }}
      />

      {/* 軍情關卡選擇地圖 */}
      <StageSelectorModal
        show={isStageSelectorOpen}
        stages={allStages}
        currentStageId={currentStage.map_id}
        maxStageId={player?.max_stage}
        clearedStages={player?.cleared_stages}
        onSelectStage={loadStageData}
        onClose={() => setIsStageSelectorOpen(false)}
      />
    </div>
  );
};

export default ShenmaSanguoJsPage;
