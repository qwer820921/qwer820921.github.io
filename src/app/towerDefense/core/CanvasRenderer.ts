/**
 * Canvas 渲染器
 */

import {
  Enemy,
  Tower,
  Projectile,
  GridCell,
  CellType,
  TowerType,
} from "../types";
import { CANVAS, GRID, COLORS } from "../config/constants";
import { PATH_POINTS } from "../config/mapConfig";
import { TOWER_CONFIGS } from "../config/gameData";
import { gridToWorld } from "../config/mapConfig";

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }
    this.ctx = ctx;
  }

  /**
   * 清空畫布
   */
  clear() {
    this.ctx.fillStyle = CANVAS.BACKGROUND_COLOR;
    this.ctx.fillRect(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT);
  }

  /**
   * 渲染格子
   */
  renderGrid(
    grid: GridCell[][],
    hoveredCell: { row: number; col: number } | null
  ) {
    for (let row = 0; row < GRID.ROWS; row++) {
      for (let col = 0; col < GRID.COLS; col++) {
        const cell = grid[row][col];
        const x = col * GRID.CELL_SIZE;
        const y = row * GRID.CELL_SIZE;

        // 填充顏色
        switch (cell.type) {
          case CellType.PATH:
            this.ctx.fillStyle = COLORS.PATH;
            break;
          case CellType.BUILDABLE:
            this.ctx.fillStyle = COLORS.BUILDABLE;
            break;
          case CellType.BLOCKED:
            this.ctx.fillStyle = COLORS.BLOCKED;
            break;
          case CellType.SPAWN:
            this.ctx.fillStyle = COLORS.SPAWN;
            break;
          case CellType.EXIT:
            this.ctx.fillStyle = COLORS.EXIT;
            break;
        }

        this.ctx.fillRect(x, y, GRID.CELL_SIZE, GRID.CELL_SIZE);

        // 懸停效果
        if (hoveredCell && hoveredCell.row === row && hoveredCell.col === col) {
          const canBuild = cell.type === CellType.BUILDABLE && !cell.towerId;
          this.ctx.fillStyle = canBuild
            ? COLORS.HOVER_VALID
            : COLORS.HOVER_INVALID;
          this.ctx.fillRect(x, y, GRID.CELL_SIZE, GRID.CELL_SIZE);
        }

        // 格子邊框
        this.ctx.strokeStyle = CANVAS.GRID_LINE_COLOR;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, GRID.CELL_SIZE, GRID.CELL_SIZE);
      }
    }
  }

  /**
   * 渲染路徑
   */
  renderPath() {
    if (PATH_POINTS.length < 2) return;

    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    this.ctx.lineWidth = 40;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";

    this.ctx.beginPath();
    this.ctx.moveTo(PATH_POINTS[0].x, PATH_POINTS[0].y);

    for (let i = 1; i < PATH_POINTS.length; i++) {
      this.ctx.lineTo(PATH_POINTS[i].x, PATH_POINTS[i].y);
    }

    this.ctx.stroke();
  }

  /**
   * 渲染敵人
   */
  renderEnemies(enemies: Enemy[]) {
    enemies.forEach((enemy) => {
      if (enemy.isDead) return;

      const { x, y } = enemy.position;

      // 繪製敵人圓形
      this.ctx.fillStyle = enemy.color;
      this.ctx.beginPath();
      this.ctx.arc(x, y, enemy.size, 0, Math.PI * 2);
      this.ctx.fill();

      // 繪製血條背景
      const barWidth = enemy.size * 2;
      const barHeight = 4;
      const barX = x - barWidth / 2;
      const barY = y - enemy.size - 10;

      this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      this.ctx.fillRect(barX, barY, barWidth, barHeight);

      // 繪製血條
      const healthPercent = enemy.health / enemy.maxHealth;
      const healthColor =
        healthPercent > 0.5
          ? "#48bb78"
          : healthPercent > 0.2
            ? "#ed8936"
            : "#e53e3e";
      this.ctx.fillStyle = healthColor;
      this.ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
    });
  }

  /**
   * 渲染塔
   */
  renderTowers(towers: Tower[]) {
    towers.forEach((tower) => {
      const { x, y } = tower.position;
      const config = TOWER_CONFIGS[tower.type];

      // 繪製塔基座陰影
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      this.ctx.beginPath();
      this.ctx.ellipse(x, y + 8, 28, 12, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // 繪製光暈效果
      const glowGradient = this.ctx.createRadialGradient(x, y, 0, x, y, 35);
      glowGradient.addColorStop(0, tower.color + "40");
      glowGradient.addColorStop(1, "transparent");
      this.ctx.fillStyle = glowGradient;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 35, 0, Math.PI * 2);
      this.ctx.fill();

      // 根據塔類型繪製不同造型
      switch (tower.type) {
        case "basic":
          this.renderBasicTower(x, y, tower);
          break;
        case "archer":
          this.renderArcherTower(x, y, tower);
          break;
        case "cannon":
          this.renderCannonTower(x, y, tower);
          break;
        case "magic":
          this.renderMagicTower(x, y, tower);
          break;
        default:
          this.renderDefaultTower(x, y, tower);
      }

      // 繪製等級指示器
      if (tower.level > 1) {
        this.ctx.fillStyle = "#fbbf24";
        this.ctx.strokeStyle = "#000000";
        this.ctx.lineWidth = 2;
        this.ctx.font = "bold 14px Arial";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.strokeText(`Lv${tower.level}`, x, y - 30);
        this.ctx.fillText(`Lv${tower.level}`, x, y - 30);
      }

      // 繪製塔的 icon
      this.ctx.font = "20px Arial";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(config.icon, x, y);
    });
  }

  /**
   * 渲染基礎塔 - 圓形設計
   */
  private renderBasicTower(x: number, y: number, tower: Tower) {
    // 外圈
    this.ctx.fillStyle = tower.color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 24, 0, Math.PI * 2);
    this.ctx.fill();

    // 內圈
    this.ctx.fillStyle = "#4c51bf";
    this.ctx.beginPath();
    this.ctx.arc(x, y, 18, 0, Math.PI * 2);
    this.ctx.fill();

    // 邊框
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // 脈衝環
    const pulseTime = (Date.now() % 2000) / 2000;
    this.ctx.strokeStyle = `rgba(102, 126, 234, ${0.5 - pulseTime * 0.5})`;
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 24 + pulseTime * 10, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  /**
   * 渲染弓箭塔 - 三角形設計
   */
  private renderArcherTower(x: number, y: number, tower: Tower) {
    // 底座圓形
    this.ctx.fillStyle = "#2d3748";
    this.ctx.beginPath();
    this.ctx.arc(x, y, 22, 0, Math.PI * 2);
    this.ctx.fill();

    // 三角形塔身
    this.ctx.fillStyle = tower.color;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - 20);
    this.ctx.lineTo(x - 18, y + 15);
    this.ctx.lineTo(x + 18, y + 15);
    this.ctx.closePath();
    this.ctx.fill();

    // 邊框
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // 瞄準指示器
    this.ctx.strokeStyle = "#48bb78";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - 25);
    this.ctx.lineTo(x, y - 35);
    this.ctx.stroke();
  }

  /**
   * 渲染火砲塔 - 方形設計
   */
  private renderCannonTower(x: number, y: number, tower: Tower) {
    // 底座
    this.ctx.fillStyle = "#1a202c";
    this.ctx.fillRect(x - 24, y - 24, 48, 48);

    // 主體方形
    this.ctx.fillStyle = tower.color;
    this.ctx.fillRect(x - 20, y - 20, 40, 40);

    // 砲管
    this.ctx.fillStyle = "#2d3748";
    this.ctx.fillRect(x - 6, y - 30, 12, 20);

    // 邊框
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x - 20, y - 20, 40, 40);

    // 裝飾線條
    this.ctx.strokeStyle = "#c53030";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x - 15, y);
    this.ctx.lineTo(x + 15, y);
    this.ctx.stroke();
  }

  /**
   * 渲染魔法塔 - 星形設計
   */
  private renderMagicTower(x: number, y: number, tower: Tower) {
    // 旋轉的魔法陣
    const rotation = ((Date.now() % 3000) / 3000) * Math.PI * 2;

    // 外圈魔法陣
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(rotation);
    this.ctx.strokeStyle = "rgba(159, 122, 234, 0.4)";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 28, 0, Math.PI * 2);
    this.ctx.stroke();

    // 魔法符文
    for (let i = 0; i < 6; i++) {
      const angle = ((Math.PI * 2) / 6) * i;
      const rx = Math.cos(angle) * 25;
      const ry = Math.sin(angle) * 25;
      this.ctx.fillStyle = "#9f7aea";
      this.ctx.beginPath();
      this.ctx.arc(rx, ry, 3, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();

    // 中心星形
    this.ctx.fillStyle = tower.color;
    this.ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = ((Math.PI * 2) / 5) * i - Math.PI / 2;
      const radius = i % 2 === 0 ? 20 : 10;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) {
        this.ctx.moveTo(px, py);
      } else {
        this.ctx.lineTo(px, py);
      }
    }
    this.ctx.closePath();
    this.ctx.fill();

    // 星形邊框
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // 中心光球
    const centerGlow = this.ctx.createRadialGradient(x, y, 0, x, y, 8);
    centerGlow.addColorStop(0, "#ffffff");
    centerGlow.addColorStop(1, tower.color);
    this.ctx.fillStyle = centerGlow;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 8, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /**
   * 渲染預設塔樣式
   */
  private renderDefaultTower(x: number, y: number, tower: Tower) {
    // 繪製塔主體
    this.ctx.fillStyle = tower.color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 20, 0, Math.PI * 2);
    this.ctx.fill();

    // 繪製塔邊框
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }

  /**
   * 渲染塔的攻擊範圍
   */
  renderTowerRange(tower: Tower) {
    const { x, y } = tower.position;

    // 範圍圓圈 - 使用漸層效果
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, tower.range);
    gradient.addColorStop(0, "rgba(102, 126, 234, 0.15)");
    gradient.addColorStop(0.7, "rgba(102, 126, 234, 0.08)");
    gradient.addColorStop(1, "rgba(102, 126, 234, 0.02)");

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, tower.range, 0, Math.PI * 2);
    this.ctx.fill();

    // 範圍邊框 - 虛線
    this.ctx.strokeStyle = COLORS.TOWER_RANGE_BORDER;
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([5, 5]); // 虛線效果
    this.ctx.beginPath();
    this.ctx.arc(x, y, tower.range, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]); // 重置為實線
  }

  /**
   * 渲染投射物
   */
  renderProjectiles(projectiles: Projectile[]) {
    projectiles.forEach((projectile) => {
      if (projectile.hasHit) return;

      const { x, y } = projectile.position;

      // 繪製投射物
      this.ctx.fillStyle = projectile.color;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 5, 0, Math.PI * 2);
      this.ctx.fill();

      // 繪製光暈效果
      const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, 10);
      gradient.addColorStop(0, projectile.color);
      gradient.addColorStop(1, "transparent");
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 10, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  /**
   * 渲染放置預覽
   */
  renderPlacementPreview(
    towerType: string,
    hoveredCell: { row: number; col: number }
  ) {
    const config = TOWER_CONFIGS[towerType as TowerType];
    if (!config) return;

    const position = gridToWorld(hoveredCell.row, hoveredCell.col);
    const { x, y } = position;

    // 繪製攻擊範圍預覽 - 使用不同顏色
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, config.range);
    gradient.addColorStop(0, "rgba(72, 187, 120, 0.2)");
    gradient.addColorStop(0.7, "rgba(72, 187, 120, 0.1)");
    gradient.addColorStop(1, "rgba(72, 187, 120, 0.02)");

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, config.range, 0, Math.PI * 2);
    this.ctx.fill();

    // 範圍邊框 - 綠色虛線
    this.ctx.strokeStyle = "rgba(72, 187, 120, 0.6)";
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.ctx.arc(x, y, config.range, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // 繪製半透明的塔預覽
    this.ctx.globalAlpha = 0.5;

    // 塔基座陰影
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    this.ctx.beginPath();
    this.ctx.ellipse(x, y + 8, 28, 12, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // 根據塔類型繪製預覽
    const previewTower = {
      type: towerType,
      color: config.color,
      level: 1,
      position: { x, y },
    } as Tower;

    switch (towerType) {
      case "basic":
        this.renderBasicTower(x, y, previewTower);
        break;
      case "archer":
        this.renderArcherTower(x, y, previewTower);
        break;
      case "cannon":
        this.renderCannonTower(x, y, previewTower);
        break;
      case "magic":
        this.renderMagicTower(x, y, previewTower);
        break;
      default:
        this.renderDefaultTower(x, y, previewTower);
    }

    // 繪製塔的 icon
    this.ctx.font = "20px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(config.icon, x, y);

    this.ctx.globalAlpha = 1.0; // 重置透明度
  }
}
