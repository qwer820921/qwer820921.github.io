/**
 * BattleEngine.ts
 * 戰鬥主引擎核心調度器
 * 1. 協同 GameMap, WaveManager, BattleManager, HeroEntity, TowerEntity, EnemyEntity
 * 2. 60 FPS 精準固定時間步長循環 (requestAnimationFrame)
 * 3. 完美同步倍速、暫停、部屬減速 (0.1x) 與阻擋戰鬥邏輯
 * 4. 產出解耦 BattleSnapshot 快照交由 IBattleRenderer 渲染
 */

import { GameMap, TileType } from "./GameMap";
import { BattleManager, GameState, StatsSyncData, BattleResultData } from "./BattleManager";
import { WaveManager, WaveConfigData } from "./WaveManager";
import { FloatingTextManager } from "./FloatingTextManager";
import { SoundManager } from "./SoundManager";
import { IBattleRenderer, BattleSnapshot, UnitRenderData, VisualFxData } from "../types/render";
import { CanvasRenderer } from "../render/CanvasRenderer";
import { AssetLoader } from "./AssetLoader";
import { HeroEntity, HeroConfigData, HeroStateData } from "./entities/HeroEntity";
import { TowerEntity, TOWER_CONFIGS } from "./entities/TowerEntity";
import { EnemyConfigData } from "./entities/EnemyEntity";

export interface StagePayload {
  stageId: string;
  battleId: string;
  totalWaves: number;
  pathJson: any;
  waves: WaveConfigData[];
  heroesConfig: HeroConfigData[];
  enemiesConfig: EnemyConfigData[];
  playerHeroes?: HeroStateData[];
}

export class BattleEngine {
  public canvas: HTMLCanvasElement | null = null;
  public renderer: IBattleRenderer;
  public gameMap: GameMap;
  public battleManager: BattleManager;
  public waveManager: WaveManager;
  public floatingTexts: FloatingTextManager;
  public soundManager: SoundManager;

  public heroes: HeroEntity[] = [];
  public towers: TowerEntity[] = [];
  public visualFxs: VisualFxData[] = [];
  private heroSeq = 0;
  private towerSeq = 0;
  private fxSeq = 0;

  private heroesConfig: HeroConfigData[] = [];
  private enemiesConfig: EnemyConfigData[] = [];

  // 選中與高亮狀態
  public selectedUnit: { type: "hero" | "tower"; id: string; col: number; row: number } | null = null;
  public highlightCell: { col: number; row: number; valid: boolean } | null = null;
  public dragGhost: {
    type: "hero" | "tower";
    name: string;
    x: number;
    y: number;
    color: string;
    rangePx: number;
  } | null = null;

  // 動畫循環
  private animFrameId: number | null = null;
  private lastTimestamp = 0;
  private isDestroyed = false;
  private eventsBound = false;

  // UI 事件回調
  public onStatsUpdated?: (stats: StatsSyncData) => void;
  public onShowPlacementMenu?: (col: number, row: number, isRoad: boolean, isBuild: boolean) => void;
  public onShowUpgradePanel?: (tower: TowerEntity) => void;
  public onShowHeroInfo?: (hero: HeroEntity) => void;
  public onBattleEnded?: (result: BattleResultData) => void;
  public onWaveRejected?: (wave: number, reason: string) => void;
  public onCellClicked?: (col: number, row: number) => void;

  constructor(renderer?: IBattleRenderer) {
    this.gameMap = new GameMap();
    this.battleManager = new BattleManager();
    this.waveManager = new WaveManager();
    this.floatingTexts = new FloatingTextManager();
    this.soundManager = SoundManager.getInstance();
    this.renderer = renderer || new CanvasRenderer();

    this.setupInternalBridges();
  }

  /**
   * 初始化畫布與渲染器
   */
  public init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.renderer.init(canvas);
    if (!this.eventsBound) {
      this.bindCanvasEvents(canvas);
      this.eventsBound = true;
    }

    const vpW = canvas.clientWidth || 800;
    const vpH = canvas.clientHeight || 580;
    this.resize(vpW, vpH);

    // 啟動主渲染循環
    this.lastTimestamp = performance.now();
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.animFrameId = requestAnimationFrame(this.gameLoop);
  }

  private setupInternalBridges(): void {
    // 綁定 BattleManager 事件
    this.battleManager.onStatsChanged = (stats) => {
      this.onStatsUpdated?.(stats);
    };
    this.battleManager.onBattleEnded = (result) => {
      this.onBattleEnded?.(result);
    };
    this.battleManager.onWaveStartRejected = (wave, reason) => {
      this.onWaveRejected?.(wave, reason);
    };
    this.battleManager.onRequestSpawnWave = (waveNum) => {
      const plans = this.waveManager.planWave(waveNum);
      const rep = this.waveManager.getLastPlanReport();
      if (rep.missing || (plans.length === 0 && rep.skipped.length > 0)) {
        const reason = rep.skipped[0]?.reason || (rep.missing ? "wave_missing" : "wave_empty");
        this.battleManager.rejectWave(waveNum, reason);
        return;
      }
      this.waveManager.startWave(waveNum, plans);
    };

    // 綁定 WaveManager 事件
    this.waveManager.onEnemyKilled = () => {
      this.battleManager.onEnemyKilled();
    };
    this.waveManager.onEnemyLeaked = () => {
      this.battleManager.onEnemyReachedBase();
    };
    this.waveManager.onWaveCleared = () => {
      this.battleManager.onWaveAllEnemiesDead();
    };
  }

  /**
   * 載入關卡資料與波次
   */
  public loadStage(payload: StagePayload): void {
    this.heroes = [];
    this.towers = [];
    this.visualFxs = [];
    this.selectedUnit = null;
    this.highlightCell = null;
    this.dragGhost = null;
    this.floatingTexts.clear();

    this.heroesConfig = payload.heroesConfig || [];
    this.enemiesConfig = payload.enemiesConfig || [];

    const vpW = this.canvas ? this.canvas.clientWidth : 720;
    const vpH = this.canvas ? this.canvas.clientHeight : 540;

    this.gameMap.setup(payload.pathJson, vpW, vpH);
    this.waveManager.setup(payload.waves, this.enemiesConfig, this.gameMap);
    this.battleManager.initialize(payload.totalWaves, payload.stageId, payload.battleId);

    // 預載貼圖資源以避免首次召喚延遲
    const assetLoader = AssetLoader.getInstance();
    const heroKeys = this.heroesConfig.map(
      (h) => h.image || `hero_${h.hero_id.replace(/^hero_/, "")}.webp`
    );
    const playerHeroKeys = (payload.playerHeroes || []).map(
      (h) => `hero_${h.hero_id.replace(/^hero_/, "")}.webp`
    );
    const towerKeys = Object.values(TOWER_CONFIGS)
      .map((t) => t.image)
      .filter((img): img is string => typeof img === "string");
    const enemyKeys = this.enemiesConfig.map(
      (e) => e.image || `enemy_${e.enemy_id}.webp`
    );
    assetLoader.preloadBatch([...heroKeys, ...playerHeroKeys, ...towerKeys, ...enemyKeys]);
  }

  /**
   * 核心 60 FPS 迴圈
   */
  private gameLoop = (timestamp: number): void => {
    if (this.isDestroyed) return;

    let delta = (timestamp - this.lastTimestamp) / 1000.0;
    this.lastTimestamp = timestamp;

    if (delta > 0.1) delta = 0.1;
    if (delta < 0) delta = 0.016;

    const timeScale = this.battleManager.effectiveTimeScale();
    const effectiveDelta = this.battleManager.manualPaused ? 0 : delta * timeScale;

    // 狀態機為 BATTLE 時更新遊戲邏輯
    if (this.battleManager.gameState === GameState.BATTLE && effectiveDelta > 0) {
      this.battleManager.update(effectiveDelta);
      this.waveManager.update(effectiveDelta);

      // 1. 更新敵人阻擋與位移
      const enemies = this.waveManager.activeEnemies;
      for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        if (enemy.isDead) continue;

        // 若地面敵人尚未有阻擋者，搜尋道路上阻擋之武將
        if (!enemy.isFlying && !enemy.blocker) {
          const grid = this.gameMap.worldToGrid(enemy.x, enemy.y);
          const hero = this.heroes.find(
            (h) => h.isOnRoad && !h.isDead && h.gridCell.col === grid.col && h.gridCell.row === grid.row
          );
          if (hero) {
            enemy.blocker = hero;
          }
        }

        enemy.update(effectiveDelta, this.gameMap, this.floatingTexts, this.soundManager);
      }

      // 2. 更新防禦塔攻擊
      for (let i = 0; i < this.towers.length; i++) {
        const tower = this.towers[i];
        if (!tower.sold) {
          tower.update(effectiveDelta, enemies, this.floatingTexts, this.soundManager);
        }
      }

      // 3. 更新武將技能與光環
      for (let i = this.heroes.length - 1; i >= 0; i--) {
        const hero = this.heroes[i];
        if (hero.isDead) {
          this.gameMap.clearOccupied(hero.gridCell.col, hero.gridCell.row);
          this.heroes.splice(i, 1);
          continue;
        }
        hero.update(effectiveDelta, enemies, this.heroes, this.battleManager, this.floatingTexts, this.soundManager);
      }

      // 4. 更新視覺特效 (橫掃光環)
      for (let i = this.visualFxs.length - 1; i >= 0; i--) {
        const fx = this.visualFxs[i];
        fx.elapsed += effectiveDelta;
        if (fx.elapsed >= fx.duration) {
          this.visualFxs.splice(i, 1);
        }
      }
    }

    // 飄字始終平滑上升
    this.floatingTexts.update(effectiveDelta > 0 ? effectiveDelta : delta);

    // 產生快照並繪製
    const snapshot = this.buildSnapshot();
    this.renderer.render(snapshot);

    this.animFrameId = requestAnimationFrame(this.gameLoop);
  };

  /**
   * 收集當前幀快照
   */
  public buildSnapshot(): BattleSnapshot {
    const tiles = this.gameMap.getAllTiles().map((t) => ({
      col: t.col,
      row: t.row,
      type: t.type,
      textureKey: t.textureKey,
    }));

    const heroesRender: UnitRenderData[] = this.heroes.map((h) => {
      const isSel = this.selectedUnit?.type === "hero" && this.selectedUnit.id === h.heroId;
      return {
        id: h.heroId,
        type: "hero",
        x: h.x,
        y: h.y,
        radius: h.heroHalf,
        currentHp: h.currentHp,
        maxHp: h.maxHp,
        textureKey: h.isAttacking && h.attackTextureKey ? h.attackTextureKey : h.textureKey,
        isAttacking: h.isAttacking,
        isSelected: isSel,
        color: h.bodyColor,
        label: h.heroName,
        rangeTiles: h.attackRange,
        rangePx: h.attackRange * h.tileSize,
        level: h.heroLevel,
        isOnRoad: h.isOnRoad,
        auras: {
          slow: h.slowAuraMult < 1.0,
          defense: h.defAuraMult > 1.0,
          attackSpeed: h.atkSpeedAuraMult > 1.0,
          attackDown: h.atkDownAuraMult < 1.0,
        },
      };
    });

    const towersRender: UnitRenderData[] = this.towers.map((tw) => {
      const isSel = this.selectedUnit?.type === "tower" && this.selectedUnit.id === tw.towerUid;
      return {
        id: tw.towerUid,
        type: "tower",
        x: tw.x,
        y: tw.y,
        radius: tw.tileSize * 0.42,
        currentHp: 1,
        maxHp: 1,
        textureKey: tw.isAttacking && tw.attackTextureKey ? tw.attackTextureKey : tw.textureKey,
        isAttacking: tw.isAttacking,
        isSelected: isSel,
        color: tw.bodyColor,
        label: tw.towerName,
        rangeTiles: tw.rangeTiles,
        rangePx: tw.rangeTiles * tw.tileSize,
        level: tw.towerLevel,
        auras: {
          slow: tw.slowMult < 1.0,
        },
      };
    });

    const enemiesRender: UnitRenderData[] = this.waveManager.activeEnemies.map((e) => ({
      id: e.enemyId,
      type: "enemy",
      x: e.x,
      y: e.y,
      radius: e.radius,
      currentHp: e.currentHp,
      maxHp: e.maxHp,
      textureKey: e.isFighting && e.attackTextureKey ? e.attackTextureKey : e.textureKey,
      isAttacking: e.isFighting,
      color: e.bodyColor,
      label: e.enemyName,
      isFlying: e.isFlying(),
      isFighting: e.isFighting,
      isBurning: e.isBurning(),
      isStunned: e.isStunned(),
      isSlowed: e.isSlowed(),
      stunAngle: e.stunAngle,
    }));

    return {
      timestamp: performance.now(),
      state: this.battleManager.gameState,
      cols: this.gameMap.cols,
      rows: this.gameMap.rows,
      tileSize: this.gameMap.tileSize,
      offsetX: this.gameMap.offsetX,
      offsetY: this.gameMap.offsetY,
      bgTextureKey: this.gameMap.backgroundTextureKey || undefined,
      tiles,
      heroes: heroesRender,
      towers: towersRender,
      enemies: enemiesRender,
      floatingTexts: this.floatingTexts.getSnapshot(),
      visualFxs: this.visualFxs,
      highlightCell: this.highlightCell,
      dragGhost: this.dragGhost,
    };
  }

  /**
   * 綁定畫布互動事件
   */
  private bindCanvasEvents(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("pointerdown", () => {
      this.soundManager.unlockAudio();
    });

    canvas.addEventListener("pointermove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      const grid = this.gameMap.worldToGrid(clientX, clientY);
      if (this.gameMap.isValidCell(grid.col, grid.row)) {
        const canBuild = this.gameMap.canPlaceTower(grid.col, grid.row);
        const canHero = this.gameMap.canPlaceHero(grid.col, grid.row);
        this.highlightCell = {
          col: grid.col,
          row: grid.row,
          valid: canBuild || canHero,
        };
      } else {
        this.highlightCell = null;
      }
    });

    canvas.addEventListener("pointerleave", () => {
      this.highlightCell = null;
    });

    canvas.addEventListener("click", (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      this.handleCellClick(clientX, clientY);
    });
  }

  /**
   * 點擊地圖格子處理
   */
  public handleCellClick(worldX: number, worldY: number): void {
    const grid = this.gameMap.worldToGrid(worldX, worldY);
    if (!this.gameMap.isValidCell(grid.col, grid.row)) {
      this.selectedUnit = null;
      return;
    }

    this.onCellClicked?.(grid.col, grid.row);

    // 檢查是否有防禦塔
    const tower = this.towers.find(
      (tw) => !tw.sold && tw.gridCell.col === grid.col && tw.gridCell.row === grid.row
    );
    if (tower) {
      this.selectedUnit = { type: "tower", id: tower.towerUid, col: grid.col, row: grid.row };
      this.onShowUpgradePanel?.(tower);
      return;
    }

    // 檢查是否有武將
    const hero = this.heroes.find(
      (h) => !h.isDead && h.gridCell.col === grid.col && h.gridCell.row === grid.row
    );
    if (hero) {
      this.selectedUnit = { type: "hero", id: hero.heroId, col: grid.col, row: grid.row };
      this.onShowHeroInfo?.(hero);
      return;
    }

    // 空格子：若為有效位置，跳出部署選單
    this.selectedUnit = null;
    const tileType = this.gameMap.getTileType(grid.col, grid.row);
    const isRoad = tileType === TileType.ROAD;
    const isBuild = tileType === TileType.BUILD;

    if ((isRoad || isBuild) && !this.gameMap.isOccupied(grid.col, grid.row)) {
      this.onShowPlacementMenu?.(grid.col, grid.row, isRoad, isBuild);
    }
  }

  /**
   * 放置武將
   */
  public placeHero(col: number, row: number, heroState: HeroStateData): boolean {
    if (!this.gameMap.canPlaceHero(col, row)) return false;

    // 武將召喚花費 (預設 100 金幣)
    const cost = 100;
    if (!this.battleManager.spendGold(cost)) {
      this.floatingTexts.spawn("金幣不足", "#ff5252", this.gameMap.gridToWorld(col, row).x, this.gameMap.gridToWorld(col, row).y);
      return false;
    }

    const pos = this.gameMap.gridToWorld(col, row);
    const isOnRoad = this.gameMap.getTileType(col, row) === TileType.ROAD;

    const hero = new HeroEntity(
      heroState,
      this.heroesConfig,
      { col, row },
      pos,
      isOnRoad,
      this.gameMap.tileSize
    );

    this.gameMap.setOccupied(col, row, hero);
    this.heroes.push(hero);
    this.soundManager.play("hero_place");
    return true;
  }

  /**
   * 放置防禦塔
   */
  public placeTower(col: number, row: number, towerTypeKey: string): boolean {
    if (!this.gameMap.canPlaceTower(col, row)) return false;

    const cfg = TOWER_CONFIGS[towerTypeKey];
    if (!cfg) return false;

    if (!this.battleManager.spendGold(cfg.cost)) {
      this.floatingTexts.spawn("金幣不足", "#ff5252", this.gameMap.gridToWorld(col, row).x, this.gameMap.gridToWorld(col, row).y);
      return false;
    }

    const pos = this.gameMap.gridToWorld(col, row);
    const uid = `tower_${++this.towerSeq}`;
    const tower = new TowerEntity(uid, towerTypeKey, { col, row }, pos, this.gameMap.tileSize);

    this.gameMap.setOccupied(col, row, tower);
    this.towers.push(tower);
    this.soundManager.play("tower_place");
    return true;
  }

  /**
   * 升級防禦塔
   */
  public upgradeTower(col: number, row: number): boolean {
    const tower = this.towers.find(
      (tw) => !tw.sold && tw.gridCell.col === col && tw.gridCell.row === row
    );
    if (!tower) return false;

    const cost = tower.getUpgradeCost();
    if (!this.battleManager.spendGold(cost)) {
      this.floatingTexts.spawn("金幣不足", "#ff5252", tower.x, tower.y);
      return false;
    }

    tower.upgrade();
    this.soundManager.play("upgrade");
    this.floatingTexts.spawn(`Lv.${tower.towerLevel}`, "#ffca28", tower.x, tower.y - 20, 1.3);
    return true;
  }

  /**
   * 拆除/出售防禦塔 (退款 50% 或準備階段 100%)
   */
  public sellTower(col: number, row: number): boolean {
    const idx = this.towers.findIndex(
      (tw) => !tw.sold && tw.gridCell.col === col && tw.gridCell.row === row
    );
    if (idx < 0) return false;

    const tower = this.towers[idx];
    const isPrep = this.battleManager.gameState === GameState.PREP;
    const refund = tower.getSellRefund(isPrep);

    tower.sell();
    this.gameMap.clearOccupied(col, row);
    this.towers.splice(idx, 1);
    this.selectedUnit = null;

    this.battleManager.refundGold(refund);
    this.floatingTexts.spawn(`+${refund} 金幣`, "#ffeb3b", tower.x, tower.y);
    return true;
  }

  /**
   * 設定防禦塔索敵目標優先級
   */
  public setTowerTargetMode(col: number, row: number, mode: string): void {
    const tower = this.towers.find(
      (tw) => !tw.sold && tw.gridCell.col === col && tw.gridCell.row === row
    );
    if (tower) {
      tower.setTargetMode(mode);
    }
  }

  /**
   * 觸發視覺衝擊特效
   */
  public spawnVisualFx(x: number, y: number, radius = 50, duration = 0.3): void {
    this.visualFxs.push({
      id: ++this.fxSeq,
      type: "sweep",
      x,
      y,
      radius,
      duration,
      elapsed: 0,
    });
  }

  /**
   * 縮放與適配
   */
  public resize(width: number, height: number): void {
    if (!this.canvas) return;
    const finalW = width > 0 ? width : (this.canvas.clientWidth || 800);
    const finalH = height > 0 ? height : (this.canvas.clientHeight || 580);
    this.renderer.resize(finalW, finalH);
    this.gameMap.updateLayout(finalW, finalH);

    // 重新校正所有單位世界坐標
    for (const h of this.heroes) {
      const p = this.gameMap.gridToWorld(h.gridCell.col, h.gridCell.row);
      h.x = p.x;
      h.y = p.y;
      h.tileSize = this.gameMap.tileSize;
    }
    for (const tw of this.towers) {
      const p = this.gameMap.gridToWorld(tw.gridCell.col, tw.gridCell.row);
      tw.x = p.x;
      tw.y = p.y;
      tw.tileSize = this.gameMap.tileSize;
    }
  }

  /**
   * 銷毀引擎與資源釋放
   */
  public destroy(): void {
    this.isDestroyed = true;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.soundManager.stopBgm();
    this.renderer.destroy();
    this.heroes = [];
    this.towers = [];
    this.visualFxs = [];
    this.canvas = null;
  }
}
