/**
 * LocalGameBridge.ts
 * 戰鬥引擎與 React UI 本地事件通訊橋樑 (無 iframe 零序列化損耗)
 * 100% 相容 Protocol 7 介面合約
 */

import { BattleEngine, StagePayload } from "./BattleEngine";
import { StatsSyncData, BattleResultData, GameState } from "./BattleManager";
import { HeroStateData, HeroEntity } from "./entities/HeroEntity";
import { TowerEntity } from "./entities/TowerEntity";

export interface PlacementMenuData {
  col: number;
  row: number;
  isRoad: boolean;
  isBuild: boolean;
}

export class LocalGameBridge {
  private engine: BattleEngine;

  // React 訂閱回調
  public onStatsChanged?: (stats: StatsSyncData) => void;
  public onPlacementMenuOpen?: (data: PlacementMenuData | null) => void;
  public onUpgradePanelOpen?: (tower: TowerEntity | null) => void;
  public onHeroInfoOpen?: (hero: HeroEntity | null) => void;
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

    this.engine.onShowPlacementMenu = (col, row, isRoad, isBuild) => {
      this.onPlacementMenuOpen?.({ col, row, isRoad, isBuild });
    };

    this.engine.onShowUpgradePanel = (tower) => {
      this.onUpgradePanelOpen?.(tower);
    };

    this.engine.onShowHeroInfo = (hero) => {
      this.onHeroInfoOpen?.(hero);
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
    this.engine.battleManager.manualPaused = !this.engine.battleManager.manualPaused;
    this.engine.battleManager.syncStats();
  }

  public setPaused(paused: boolean): void {
    this.engine.battleManager.manualPaused = paused;
    this.engine.battleManager.syncStats();
  }

  public setDeploySlow(slow: boolean): void {
    if (slow) {
      this.engine.battleManager.beginDeploySlow();
    } else {
      this.engine.battleManager.endDeploySlow();
    }
  }

  // 部署與操作
  public placeHero(col: number, row: number, heroState: HeroStateData): boolean {
    const success = this.engine.placeHero(col, row, heroState);
    if (success) {
      this.onPlacementMenuOpen?.(null);
    }
    return success;
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

  public sellTower(col: number, row: number): boolean {
    const success = this.engine.sellTower(col, row);
    if (success) {
      this.onUpgradePanelOpen?.(null);
    }
    return success;
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
