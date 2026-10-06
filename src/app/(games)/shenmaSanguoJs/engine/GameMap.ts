/**
 * GameMap.ts
 * 地圖網格、坐標系統與路徑管理器
 * 100% 精準對齊原版 GameMap.gd 邏輯與多路徑折線算法
 */

export enum TileType {
  EMPTY = 0,
  ROAD = 1,
  BUILD = 2,
  OBSTACLE = 3,
  BASE = 4,
  SPAWN = 5,
}

export interface GridCoord {
  col: number;
  row: number;
}

export interface WorldCoord {
  x: number;
  y: number;
}

export class GameMap {
  public cols = 14;
  public rows = 11;
  public tileSize = 48;
  public offsetX = 0;
  public offsetY = 0;

  private grid = new Map<string, TileType>(); // "col,row" -> TileType
  private occupied = new Map<string, any>(); // "col,row" -> Unit
  private paths = new Map<string, GridCoord[]>(); // path_id -> waypoints
  private spawnPoints = new Map<string, GridCoord>(); // path_id -> spawn
  private basePos: GridCoord = { col: 0, row: 0 };

  public backgroundTextureKey: string | null = null;
  public cellTextures = new Map<string, string>(); // "col,row" -> texture_key

  public setup(pathJsonInput: any, viewportWidth = 540, viewportHeight = 720): void {
    let pj = pathJsonInput;
    if (typeof pj === "string") {
      try {
        pj = JSON.parse(pj);
      } catch {
        pj = {};
      }
    }
    if (!pj || typeof pj !== "object") {
      pj = {};
    }

    this.grid.clear();
    this.occupied.clear();
    this.paths.clear();
    this.spawnPoints.clear();
    this.cellTextures.clear();
    this.backgroundTextureKey = null;

    this.cols = Number(pj.cols) || 14;
    this.rows = Number(pj.rows) || 11;

    // 1. 解析路徑
    if (pj.paths && typeof pj.paths === "object") {
      if (Array.isArray(pj.paths)) {
        // 單一路徑相容格式
        this.parsePathPoints("path_a", pj.paths);
      } else {
        // 多路徑格式
        for (const [pid, pts] of Object.entries(pj.paths)) {
          if (Array.isArray(pts)) {
            this.parsePathPoints(pid, pts);
          }
        }
      }
    } else if (Array.isArray(pj.waypoints)) {
      // 舊版 waypoints 相容
      this.parsePathPoints("path_a", pj.waypoints);
    }

    // 2. 基地座標
    if (Array.isArray(pj.base) && pj.base.length >= 2) {
      this.basePos = { col: Number(pj.base[0]) || 0, row: Number(pj.base[1]) || 0 };
      this.grid.set(this.cellKey(this.basePos.col, this.basePos.row), TileType.BASE);
    }

    // 3. 高台建築區
    if (Array.isArray(pj.build_zones)) {
      for (const bz of pj.build_zones) {
        if (Array.isArray(bz) && bz.length >= 2) {
          const col = Number(bz[0]);
          const row = Number(bz[1]);
          const key = this.cellKey(col, row);
          if (!this.grid.has(key)) {
            this.grid.set(key, TileType.BUILD);
          }
        }
      }
    }

    // 4. 障礙物
    if (Array.isArray(pj.obstacles)) {
      for (const ob of pj.obstacles) {
        if (Array.isArray(ob) && ob.length >= 2) {
          const col = Number(ob[0]);
          const row = Number(ob[1]);
          const key = this.cellKey(col, row);
          if (!this.grid.has(key)) {
            this.grid.set(key, TileType.OBSTACLE);
          }
        }
      }
    }

    // 5. 貼圖
    if (pj.background_texture && typeof pj.background_texture === "string") {
      this.backgroundTextureKey = pj.background_texture;
    }
    if (pj.cell_textures && typeof pj.cell_textures === "object") {
      for (const [coordStr, tex] of Object.entries(pj.cell_textures)) {
        if (typeof tex === "string") {
          this.cellTextures.set(coordStr, tex);
        }
      }
    }

    // 6. 計算佈局網格尺寸與置中偏移
    this.updateLayout(viewportWidth, viewportHeight);
  }

  private parsePathPoints(pathId: string, rawPts: any[]): void {
    const wps: GridCoord[] = [];
    for (const p of rawPts) {
      if (Array.isArray(p) && p.length >= 2) {
        const c = Number(p[0]);
        const r = Number(p[1]);
        if (Number.isFinite(c) && Number.isFinite(r)) {
          wps.push({ col: Math.trunc(c), row: Math.trunc(r) });
        }
      }
    }
    if (wps.length === 0) return;

    this.paths.set(pathId, wps);
    this.spawnPoints.set(pathId, wps[0]);

    // 填滿折線格子為 ROAD
    for (let i = 0; i < wps.length - 1; i++) {
      this.fillSegment(wps[i], wps[i + 1]);
    }
    this.grid.set(this.cellKey(wps[wps.length - 1].col, wps[wps.length - 1].row), TileType.ROAD);

    // 出生點標記 SPAWN
    const spKey = this.cellKey(wps[0].col, wps[0].row);
    if (!this.grid.has(spKey) || this.grid.get(spKey) === TileType.ROAD) {
      this.grid.set(spKey, TileType.SPAWN);
    }
  }

  private fillSegment(from: GridCoord, to: GridCoord): void {
    const dc = Math.sign(to.col - from.col);
    const dr = Math.sign(to.row - from.row);
    let curCol = from.col;
    let curRow = from.row;
    while (curCol !== to.col || curRow !== to.row) {
      this.grid.set(this.cellKey(curCol, curRow), TileType.ROAD);
      curCol += dc;
      curRow += dr;
    }
  }

  public updateLayout(viewportWidth = 540, viewportHeight = 720): void {
    this.tileSize = Math.max(
      16,
      Math.min(
        Math.floor(viewportWidth / Math.max(1, this.cols)),
        Math.floor(viewportHeight / Math.max(1, this.rows))
      )
    );
    const mapW = this.cols * this.tileSize;
    const mapH = this.rows * this.tileSize;
    this.offsetX = Math.floor((viewportWidth - mapW) * 0.5);
    this.offsetY = Math.floor((viewportHeight - mapH) * 0.5);
  }

  public cellKey(col: number, row: number): string {
    return `${col},${row}`;
  }

  public getTileType(col: number, row: number): TileType {
    return this.grid.get(this.cellKey(col, row)) ?? TileType.EMPTY;
  }

  public isValidCell(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  public gridToWorld(col: number, row: number): WorldCoord {
    return {
      x: this.offsetX + (col + 0.5) * this.tileSize,
      y: this.offsetY + (row + 0.5) * this.tileSize,
    };
  }

  public worldToGrid(x: number, y: number): GridCoord {
    return {
      col: Math.floor((x - this.offsetX) / this.tileSize),
      row: Math.floor((y - this.offsetY) / this.tileSize),
    };
  }

  public canPlaceHero(col: number, row: number): boolean {
    if (!this.isValidCell(col, row)) return false;
    const t = this.getTileType(col, row);
    return (t === TileType.ROAD || t === TileType.BUILD) && !this.isOccupied(col, row);
  }

  public canPlaceTower(col: number, row: number): boolean {
    if (!this.isValidCell(col, row)) return false;
    return this.getTileType(col, row) === TileType.BUILD && !this.isOccupied(col, row);
  }

  public setOccupied(col: number, row: number, occupant: any): void {
    this.occupied.set(this.cellKey(col, row), occupant);
  }

  public clearOccupied(col: number, row: number): void {
    this.occupied.delete(this.cellKey(col, row));
  }

  public getOccupant(col: number, row: number): any {
    return this.occupied.get(this.cellKey(col, row)) ?? null;
  }

  public isOccupied(col: number, row: number): boolean {
    return this.occupied.has(this.cellKey(col, row));
  }

  public getWaypointsWorld(pathId: string): WorldCoord[] {
    const wps = this.paths.get(pathId) || [];
    return wps.map((p) => this.gridToWorld(p.col, p.row));
  }

  public getSpawnWorld(pathId: string): WorldCoord {
    const sp = this.spawnPoints.get(pathId);
    return sp ? this.gridToWorld(sp.col, sp.row) : { x: 0, y: 0 };
  }

  public getBaseWorld(): WorldCoord {
    return this.gridToWorld(this.basePos.col, this.basePos.row);
  }

  public getAllTiles(): Array<{ col: number; row: number; type: TileType; textureKey?: string }> {
    const list: Array<{ col: number; row: number; type: TileType; textureKey?: string }> = [];
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows; r++) {
        const key = this.cellKey(c, r);
        list.push({
          col: c,
          row: r,
          type: this.getTileType(c, r),
          textureKey: this.cellTextures.get(key),
        });
      }
    }
    return list;
  }
}
