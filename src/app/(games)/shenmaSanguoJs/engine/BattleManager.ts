/**
 * BattleManager.ts
 * 戰鬥狀態機、金幣經濟、波次流轉、勝負結算與倍速暫停控制
 * 100% 精準對齊原版 BattleManager.gd 邏輯與回歸測試保護
 */

import { SoundManager } from "./SoundManager";

export enum GameState {
  WAITING_PAYLOAD = 0,
  PREP = 1,
  BATTLE = 2,
  RESULT = 3,
}

export interface BattleResultData {
  result: "WIN" | "LOSE";
  stage_id: string;
  battle_id: string;
  stars_earned: number;
  kills: number;
  time_seconds: number;
  loots: Array<{ item: string; count: number }>;
}

export interface StatsSyncData {
  battle_id: string;
  gold: number;
  wave: number;
  total_waves: number;
  hp: number;
  max_hp: number;
  game_state: number;
  auto_mode: boolean;
  auto_next_wave_pending: boolean;
  speed: number;
  time_scale: number;
  deploy_slow: boolean;
  paused: boolean;
}

export class BattleManager {
  public static readonly MAX_BASE_HP = 20;
  public static readonly INITIAL_GOLD = 5000;
  public static readonly GOLD_PER_KILL = 5;
  public static readonly AUTO_NEXT_WAVE_DELAY = 1.5;
  public static readonly DEPLOY_TIME_SCALE = 0.1;

  public gameState: GameState = GameState.WAITING_PAYLOAD;
  public baseHp = BattleManager.MAX_BASE_HP;
  public battleGold = BattleManager.INITIAL_GOLD;
  public kills = 0;
  public battleTime = 0.0;
  public currentWave = 0;
  public totalWaves = 0;
  public autoMode = false;

  public stageId = "";
  public battleId = "";

  // 速度與暫停控制
  public speedPref = 1; // 1 or 2
  public deployMenuId = 0;
  private deployMenuSeq = 0;
  public manualPaused = false;

  // 異步定時保護
  private lifecycle = 0;
  private autoWaveToken = 0;
  public autoWavePending = false;

  // 馬超首擊記錄
  private firstStrikeUsed = new Map<string, number>();

  // 事件回調
  public onStateChanged?: (state: GameState) => void;
  public onBaseHpChanged?: (hp: number, maxHp: number) => void;
  public onBattleGoldChanged?: (gold: number) => void;
  public onWaveChanged?: (current: number, total: number) => void;
  public onBattleEnded?: (result: BattleResultData) => void;
  public onWaveStartRejected?: (waveNum: number, reason: string) => void;
  public onStatsChanged?: (stats: StatsSyncData) => void;
  public onRequestSpawnWave?: (waveNum: number) => void;

  public initialize(totalWaves: number, stageId: string, battleId: string): void {
    this.lifecycle++;
    this.cancelAutoWave();
    this.totalWaves = totalWaves;
    this.stageId = stageId;
    this.battleId = battleId;

    this.firstStrikeUsed.clear();
    this.resetSpeed();
    this.resetPause();

    this.battleGold = BattleManager.INITIAL_GOLD;
    this.baseHp = BattleManager.MAX_BASE_HP;
    this.kills = 0;
    this.battleTime = 0.0;
    this.currentWave = 0;
    this.autoMode = false;

    this.gameState = GameState.PREP;
    this.emitAll();
  }

  public update(delta: number): void {
    if (this.gameState !== GameState.BATTLE || this.manualPaused) {
      return;
    }
    this.battleTime += delta;
  }

  public playerStartBattle(): void {
    if (this.gameState !== GameState.PREP || this.manualPaused) {
      return;
    }
    this.spawnNextWave();
  }

  public toggleAutoMode(): void {
    if (this.manualPaused) {
      this.syncStats();
      return;
    }
    this.autoMode = !this.autoMode;
    if (this.autoMode && this.gameState === GameState.PREP) {
      this.spawnNextWave();
      return;
    }
    if (!this.autoMode && this.autoWavePending) {
      this.cancelAutoWave();
      this.setState(GameState.PREP);
      return;
    }
    this.syncStats();
  }

  public canSpendGold(amount: number): boolean {
    return this.battleGold >= amount;
  }

  public spendGold(amount: number): boolean {
    if (!this.canSpendGold(amount)) return false;
    this.battleGold -= amount;
    this.onBattleGoldChanged?.(this.battleGold);
    this.syncStats();
    return true;
  }

  public earnGold(amount: number): void {
    this.battleGold += amount;
    this.onBattleGoldChanged?.(this.battleGold);
    this.syncStats();
  }

  public refundGold(amount: number): void {
    if (amount <= 0) return;
    this.battleGold += amount;
    this.onBattleGoldChanged?.(this.battleGold);
    this.syncStats();
  }

  public onEnemyReachedBase(): void {
    if (this.gameState === GameState.RESULT) return;
    this.baseHp -= 1;
    this.onBaseHpChanged?.(this.baseHp, BattleManager.MAX_BASE_HP);
    this.syncStats();
    if (this.baseHp <= 0) {
      this.endBattle(false);
    }
  }

  public onEnemyKilled(): void {
    if (this.gameState === GameState.RESULT) return;
    this.kills += 1;
    this.earnGold(BattleManager.GOLD_PER_KILL);
  }

  public onWaveAllEnemiesDead(): void {
    if (this.gameState !== GameState.BATTLE) return;

    if (this.currentWave >= this.totalWaves) {
      this.endBattle(true);
    } else if (this.autoMode) {
      this.scheduleAutoWave();
    } else {
      this.setState(GameState.PREP);
    }
  }

  private scheduleAutoWave(): void {
    if (this.autoWavePending) return;
    this.autoWavePending = true;
    this.autoWaveToken++;
    const token = this.autoWaveToken;
    const life = this.lifecycle;
    const fromWave = this.currentWave;
    this.syncStats();

    setTimeout(() => {
      if (token !== this.autoWaveToken || life !== this.lifecycle) return;
      this.autoWavePending = false;
      if (!this.autoMode || this.gameState !== GameState.BATTLE || this.currentWave !== fromWave) {
        this.syncStats();
        return;
      }
      this.spawnNextWave();
    }, (BattleManager.AUTO_NEXT_WAVE_DELAY / this.effectiveTimeScale()) * 1000);
  }

  private cancelAutoWave(): void {
    this.autoWaveToken++;
    this.autoWavePending = false;
  }

  public spawnNextWave(): void {
    const nextWave = this.currentWave + 1;
    if (nextWave > this.totalWaves && this.totalWaves > 0) return;

    this.currentWave = nextWave;
    this.gameState = GameState.BATTLE;
    this.emitAll();
    this.onRequestSpawnWave?.(nextWave);
  }

  public rejectWave(waveNum: number, reason: string): void {
    this.cancelAutoWave();
    if (this.autoMode) {
      this.autoMode = false;
    }
    this.onWaveStartRejected?.(waveNum, reason);
    this.setState(GameState.PREP);
  }

  public calcStars(): number {
    if (this.baseHp <= 0) return 0;
    const lost = BattleManager.MAX_BASE_HP - this.baseHp;
    if (lost <= 2) return 3;
    if (lost <= 10) return 2;
    return 1;
  }

  public calcBattlePoints(): number {
    const kp = this.kills * 10;
    const hpP = this.baseHp * 20;
    let starP = 0;
    const stars = this.calcStars();
    if (stars === 1) starP = 100;
    else if (stars === 2) starP = 300;
    else if (stars === 3) starP = 600;
    return kp + hpP + starP;
  }

  public endBattle(isWin: boolean): void {
    if (this.gameState === GameState.RESULT) return;

    const result: BattleResultData = {
      result: isWin ? "WIN" : "LOSE",
      stage_id: this.stageId,
      battle_id: this.battleId,
      stars_earned: isWin ? this.calcStars() : 0,
      kills: this.kills,
      time_seconds: Math.floor(this.battleTime),
      loots: [{ item: "battle_points", count: isWin ? this.calcBattlePoints() : 10 }],
    };

    this.cancelAutoWave();
    this.resetSpeed();
    this.resetPause();

    this.gameState = GameState.RESULT;
    this.onStateChanged?.(this.gameState);
    this.onBattleEnded?.(result);

    const soundMgr = SoundManager.getInstance();
    soundMgr.stopBgm();
    soundMgr.play(isWin ? "battle_win" : "battle_lose");
  }

  public effectiveTimeScale(): number {
    return this.deployMenuId !== 0 ? BattleManager.DEPLOY_TIME_SCALE : Number(this.speedPref);
  }

  public resetSpeed(): void {
    this.speedPref = 1;
    this.deployMenuId = 0;
  }

  public resetPause(): void {
    this.manualPaused = false;
  }

  public openDeployMenu(): number {
    if (this.gameState !== GameState.PREP && this.gameState !== GameState.BATTLE) {
      return 0;
    }
    if (this.manualPaused) return 0;
    this.deployMenuSeq++;
    this.deployMenuId = this.deployMenuSeq;
    this.syncStats();
    return this.deployMenuId;
  }

  public beginDeploySlow(): void {
    this.openDeployMenu();
  }

  public endDeploySlow(): void {
    this.deployMenuId = 0;
    this.syncStats();
  }

  public closeDeployMenu(pBattleId: string, menuId: number): boolean {
    if (
      !pBattleId ||
      pBattleId !== this.battleId ||
      menuId <= 0 ||
      menuId !== this.deployMenuId
    ) {
      return false;
    }
    this.deployMenuId = 0;
    this.syncStats();
    return true;
  }

  public setSpeed(pBattleId: string, speedRaw: unknown): string {
    if (!pBattleId || pBattleId !== this.battleId) return "stale_battle";
    if (this.gameState !== GameState.PREP && this.gameState !== GameState.BATTLE) {
      return "not_active";
    }
    const s = Number(speedRaw);
    if (s !== 1 && s !== 2) return "invalid_speed";
    this.speedPref = s;
    this.syncStats();
    return "";
  }

  public setPaused(pBattleId: string, pausedRaw: unknown): string {
    if (!pBattleId || pBattleId !== this.battleId) return "stale_battle";
    if (this.gameState !== GameState.PREP && this.gameState !== GameState.BATTLE) {
      return "not_active";
    }
    if (typeof pausedRaw !== "boolean") return "invalid_paused";
    if (pausedRaw !== this.manualPaused) {
      this.manualPaused = pausedRaw;
      this.syncStats();
    }
    return "";
  }

  public consumeFirstStrike(heroId: string, damage: number): boolean {
    if (!heroId || this.firstStrikeUsed.has(heroId)) return false;
    this.firstStrikeUsed.set(heroId, damage);
    return true;
  }

  public setState(newGameState: GameState): void {
    this.gameState = newGameState;
    this.onStateChanged?.(this.gameState);
    this.syncStats();
  }

  public syncStats(): void {
    this.onStatsChanged?.({
      battle_id: this.battleId,
      gold: this.battleGold,
      wave: this.currentWave,
      total_waves: this.totalWaves,
      hp: this.baseHp,
      max_hp: BattleManager.MAX_BASE_HP,
      game_state: this.gameState,
      auto_mode: this.autoMode,
      auto_next_wave_pending: this.autoWavePending,
      speed: this.speedPref,
      time_scale: this.effectiveTimeScale(),
      deploy_slow: this.deployMenuId !== 0,
      paused: this.manualPaused,
    });
  }

  private emitAll(): void {
    this.onStateChanged?.(this.gameState);
    this.onBaseHpChanged?.(this.baseHp, BattleManager.MAX_BASE_HP);
    this.onBattleGoldChanged?.(this.battleGold);
    this.onWaveChanged?.(this.currentWave, this.totalWaves);
    this.syncStats();
  }
}
