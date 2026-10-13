/**
 * LocalGameBridge.ts
 * 戰鬥引擎與 React UI 本地事件通訊橋樑 (無 iframe 零序列化損耗)
 * 100% 相容 Protocol 7 介面合約
 */

import {
  BattleEngine,
  HeroRosterInfo,
  StagePayload,
  TeamSyncResult,
  TowerSellRequest,
  TowerSellResult,
} from "./BattleEngine";
import { StatsSyncData, BattleResultData, GameState } from "./BattleManager";
import { HeroStateData, HeroEntity } from "./entities/HeroEntity";
import { TowerEntity } from "./entities/TowerEntity";

/** 部署選單打開時記下的這一場與選單編號：關閉、派武將、建塔都帶回這一組，只有同一場、目前開著的那個選單有效 */
export interface DeployMenuContext {
  battleId: string;
  menuId: number;
}

export interface PlacementMenuData extends DeployMenuContext {
  col: number;
  row: number;
  isRoad: boolean;
  isBuild: boolean;
}

const isDeployMenuContext = (v: unknown): v is DeployMenuContext =>
  !!v &&
  typeof v === "object" &&
  typeof (v as Record<string, unknown>).battleId === "string" &&
  Number.isSafeInteger((v as Record<string, unknown>).menuId);

/** 打開防禦塔面板時記下的資訊：這座塔屬於哪一場（拆除請求要帶回這一場，不能換成之後的新場次） */
export interface TowerPanelContext {
  battleId: string;
}

export class LocalGameBridge {
  private engine: BattleEngine;

  // React 訂閱回調
  public onStatsChanged?: (stats: StatsSyncData) => void;
  public onPlacementMenuOpen?: (data: PlacementMenuData | null) => void;
  public onUpgradePanelOpen?: (
    tower: TowerEntity | null,
    context?: TowerPanelContext
  ) => void;
  public onHeroInfoOpen?: (hero: HeroEntity | null) => void;
  /** 武將陣亡（died）或隊伍同步更新／離場（removed）：這一場與還活著的武將識別碼（凍結的複本） */
  public onHeroRosterChanged?: (info: HeroRosterInfo) => void;
  public onBattleEnded?: (result: BattleResultData) => void;
  public onWaveRejected?: (wave: number, reason: string) => void;

  constructor() {
    this.engine = new BattleEngine();
    this.bindEngineCallbacks();
  }

  private bindEngineCallbacks(): void {
    this.engine.onStatsUpdated = (stats) => {
      this.onStatsChanged?.(stats);
    };

    // 點了可部署的空格：先打開部署選單（進入 0.1 倍慢速並取得選單編號），只有備戰或戰鬥中、沒有暫停時才開，否則不顯示選單
    this.engine.onShowPlacementMenu = (col, row, isRoad, isBuild) => {
      const bm = this.engine.battleManager;
      const menuId = bm.openDeployMenu();
      if (menuId === 0) return;
      this.onPlacementMenuOpen?.({
        col,
        row,
        isRoad,
        isBuild,
        battleId: bm.battleId,
        menuId,
      });
    };

    this.engine.onShowUpgradePanel = (tower) => {
      this.onUpgradePanelOpen?.(tower, {
        battleId: this.engine.battleManager.battleId,
      });
    };

    this.engine.onShowHeroInfo = (hero) => {
      this.onHeroInfoOpen?.(hero);
    };

    this.engine.onHeroRosterChanged = (info) => {
      this.onHeroRosterChanged?.(info);
    };

    this.engine.onBattleEnded = (result) => {
      this.onBattleEnded?.(result);
    };

    this.engine.onWaveRejected = (wave, reason) => {
      this.onWaveRejected?.(wave, reason);
    };
  }

  public init(canvas: HTMLCanvasElement): void {
    this.engine.init(canvas);
  }

  public loadStage(payload: StagePayload): void {
    this.engine.loadStage(payload);
  }

  public resize(width: number, height: number): void {
    this.engine.resize(width, height);
  }

  // 戰鬥狀態控制
  public startBattle(): void {
    this.engine.battleManager.playerStartBattle();
  }

  public toggleAuto(): void {
    this.engine.battleManager.toggleAutoMode();
  }

  public setSpeed(speed: number): void {
    this.engine.battleManager.speedPref = speed;
    this.engine.battleManager.syncStats();
  }

  public togglePause(): void {
    this.engine.battleManager.manualPaused =
      !this.engine.battleManager.manualPaused;
    this.engine.battleManager.syncStats();
  }

  public setPaused(paused: boolean): void {
    this.engine.battleManager.manualPaused = paused;
    this.engine.battleManager.syncStats();
  }

  /** 這個部署選單（打開時記下的這一場與編號）是不是還開著（純查詢） */
  public isDeployMenuOpen(ctx: unknown): boolean {
    return (
      isDeployMenuContext(ctx) &&
      this.engine.battleManager.isDeployMenuOpen(ctx.battleId, ctx.menuId)
    );
  }

  /** 關閉部署選單：帶打開時記下的這一場與編號；只有目前開著的那個選單會關閉並恢復玩家選的速度，回傳是否有效 */
  public closeDeployMenu(ctx: unknown): boolean {
    return (
      isDeployMenuContext(ctx) &&
      this.engine.battleManager.closeDeployMenu(ctx.battleId, ctx.menuId)
    );
  }

  // 部署與操作
  public placeHero(
    col: number,
    row: number,
    heroState: HeroStateData
  ): boolean {
    const success = this.engine.placeHero(col, row, heroState);
    if (success) {
      this.onPlacementMenuOpen?.(null);
    }
    return success;
  }

  /** 同一場的隊伍同步（改隊伍或升級後）：只接受這一場、備戰或戰鬥中；不重新載入（見 BattleEngine.syncTeam） */
  public syncTeam(battleId: string, team: unknown): TeamSyncResult {
    return this.engine.syncTeam(battleId, team);
  }

  public placeTower(col: number, row: number, towerTypeKey: string): boolean {
    const success = this.engine.placeTower(col, row, towerTypeKey);
    if (success) {
      this.onPlacementMenuOpen?.(null);
    }
    return success;
  }

  public upgradeTower(col: number, row: number): boolean {
    return this.engine.upgradeTower(col, row);
  }

  public sellTower(request: TowerSellRequest): TowerSellResult {
    const result = this.engine.sellTower(request);
    if (result.ok) {
      this.onUpgradePanelOpen?.(null);
    }
    return result;
  }

  public setTowerTargetMode(col: number, row: number, mode: string): void {
    this.engine.setTowerTargetMode(col, row, mode);
  }

  // 音效與音樂
  public playBgm(): void {
    this.engine.soundManager.playBgm();
  }

  public stopBgm(): void {
    this.engine.soundManager.stopBgm();
  }

  public setSfxMuted(muted: boolean): void {
    this.engine.soundManager.setSfxMuted(muted);
  }

  public setBgmMuted(muted: boolean): void {
    this.engine.soundManager.setBgmMuted(muted);
  }

  public isSfxMuted(): boolean {
    return this.engine.soundManager.isSfxMuted();
  }

  public isBgmMuted(): boolean {
    return this.engine.soundManager.isBgmMuted();
  }

  public unlockAudio(): void {
    this.engine.soundManager.unlockAudio();
  }

  public getGameState(): GameState {
    return this.engine.battleManager.gameState;
  }

  public destroy(): void {
    this.engine.destroy();
  }
}
