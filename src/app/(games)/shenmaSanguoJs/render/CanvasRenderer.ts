/**
 * CanvasRenderer.ts
 * 神馬三國 Canvas 2D 極致渲染器
 * 1. 支援高解析度 Retina 螢幕 (devicePixelRatio)
 * 2. 深度分層渲染 (背景 -> 地磚 -> 光環範圍 -> 特效 -> 單位 Y軸深度排序 -> 血條/狀態 -> 飄字 -> 拖曳預覽)
 * 3. 完美整合 AssetLoader 載入原版 WebP 貼圖與攻擊動畫幀
 * 4. 具備優雅的無素材降級向量繪圖，確保任何網路狀況皆能清晰流暢遊玩
 */

import { IBattleRenderer, BattleSnapshot, UnitRenderData } from "../types/render";
import { AssetLoader } from "../engine/AssetLoader";
import { TileType } from "../engine/GameMap";

export class CanvasRenderer implements IBattleRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private assetLoader: AssetLoader;
  private dpr = 1;
  private width = 800;
  private height = 600;

  // 動畫微步計時（用於光環呼吸波紋與飛行影子）
  private pulsePhase = 0;

  constructor() {
    this.assetLoader = AssetLoader.getInstance();
  }

  public init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.updateDpr();
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.updateDpr();
  }

  private updateDpr(): void {
    if (!this.canvas || !this.ctx) return;
    this.dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
  }

  public destroy(): void {
    this.canvas = null;
    this.ctx = null;
  }

  /**
   * 核心渲染迴圈
   */
  public render(snapshot: BattleSnapshot): void {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;

    this.pulsePhase = (this.pulsePhase + 0.05) % (Math.PI * 2);

    // 1. 清空畫布 (古戰場暗色基底)
    ctx.fillStyle = "#1e1b18";
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. 繪製背景地圖底圖
    this.renderBackground(ctx, snapshot);

    // 3. 繪製棋盤地磚
    this.renderTiles(ctx, snapshot);

    // 4. 繪製選中單位或拖曳時的射程光環與輔助光環
    this.renderAurasAndRanges(ctx, snapshot);

    // 5. 繪製高亮地塊 (放置選取)
    this.renderHighlightCell(ctx, snapshot);

    // 6. 繪製視覺特效 (震波、橫掃)
    this.renderVisualFxs(ctx, snapshot);

    // 7. 繪製單位 (依 Y 軸座標進行深度排序渲染)
    this.renderUnits(ctx, snapshot);

    // 8. 繪製戰鬥飄字
    this.renderFloatingTexts(ctx, snapshot);

    // 9. 繪製拖曳中單位影子與預覽
    this.renderDragGhost(ctx, snapshot);
  }

  /**
   * 繪製背景圖
   */
  private renderBackground(ctx: CanvasRenderingContext2D, snapshot: BattleSnapshot): void {
    const bgKey = snapshot.bgTextureKey || "maps/bg_forest.webp";
    const bgImg = this.assetLoader.getImage(bgKey);

    if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
      ctx.drawImage(bgImg, 0, 0, this.width, this.height);
      // 加一層柔和暗角濾鏡提升棋盤辨識度
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(0, 0, this.width, this.height);
    } else {
      // 典雅古樸漸層
      const grad = ctx.createLinearGradient(0, 0, 0, this.height);
      grad.addColorStop(0, "#2c2621");
      grad.addColorStop(1, "#181412");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  /**
   * 繪製地塊
   */
  private renderTiles(ctx: CanvasRenderingContext2D, snapshot: BattleSnapshot): void {
    const { tiles, tileSize, offsetX, offsetY } = snapshot;

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const px = offsetX + tile.col * tileSize;
      const py = offsetY + tile.row * tileSize;

      const img = tile.textureKey ? this.assetLoader.getImage(tile.textureKey) : null;

      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, px, py, tileSize, tileSize);
      } else {
        // 依據地磚型別繪製高品質向量底色
        switch (tile.type) {
          case TileType.ROAD: // 1: 道路
            ctx.fillStyle = "#c5ab80";
            ctx.fillRect(px, py, tileSize, tileSize);
            // 鋪路鵝卵石邊緣細節
            ctx.fillStyle = "rgba(0,0,0,0.06)";
            ctx.fillRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
            break;
          case TileType.BUILD: // 2: 塔防高台
            ctx.fillStyle = "#5c6b73";
            ctx.fillRect(px, py, tileSize, tileSize);
            // 平台立體高光
            ctx.fillStyle = "rgba(255,255,255,0.2)";
            ctx.fillRect(px, py, tileSize, 3);
            ctx.fillStyle = "rgba(0,0,0,0.35)";
            ctx.fillRect(px, py + tileSize - 3, tileSize, 3);
            break;
          case TileType.OBSTACLE: // 3: 障礙物
            ctx.fillStyle = "#3e4438";
            ctx.fillRect(px, py, tileSize, tileSize);
            break;
          case TileType.BASE: // 4: 大本營
            ctx.fillStyle = "#a8423f";
            ctx.fillRect(px, py, tileSize, tileSize);
            break;
          case TileType.SPAWN: // 5: 出生點
            ctx.fillStyle = "#7b1fa2";
            ctx.fillRect(px, py, tileSize, tileSize);
            break;
          case TileType.EMPTY: // 0: 空地
          default:
            // 空地保持透明，讓底圖 bgImg 完整透出！
            break;
        }
      }

      // 繪製棋盤格微光導引線
      if (tile.type !== TileType.EMPTY) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, tileSize - 1, tileSize - 1);
      } else {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px + 0.5, py + 0.5, tileSize - 1, tileSize - 1);
      }
    }
  }

  /**
   * 繪製光環與射程圈
   */
  private renderAurasAndRanges(ctx: CanvasRenderingContext2D, snapshot: BattleSnapshot): void {
    const allFriendly = [...snapshot.heroes, ...snapshot.towers];

    for (const unit of allFriendly) {
      const isSelected = unit.isSelected;
      const hasAura =
        unit.auras?.slow ||
        unit.auras?.defense ||
        unit.auras?.attackSpeed ||
        unit.auras?.attackDown;

      // 1. 若單位被選取，繪製主要攻擊射程圈
      if (isSelected && unit.rangePx && unit.rangePx > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(unit.x, unit.y, unit.rangePx, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(66, 165, 245, 0.15)";
        ctx.fill();

        ctx.strokeStyle = "rgba(100, 181, 246, 0.75)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = -this.pulsePhase * 8;
        ctx.stroke();
        ctx.restore();
      }

      // 2. 若有啟動光環，繪製呼吸波紋光環圈
      if (hasAura && unit.rangePx) {
        const pulse = Math.sin(this.pulsePhase) * 3;
        ctx.save();
        ctx.beginPath();
        ctx.arc(unit.x, unit.y, unit.rangePx + pulse, 0, Math.PI * 2);

        if (unit.auras?.slow) {
          ctx.strokeStyle = "rgba(79, 195, 247, 0.35)"; // 冰藍
        } else if (unit.auras?.defense) {
          ctx.strokeStyle = "rgba(255, 215, 64, 0.35)"; // 金黃
        } else if (unit.auras?.attackSpeed) {
          ctx.strokeStyle = "rgba(255, 112, 67, 0.35)"; // 熾橘
        } else {
          ctx.strokeStyle = "rgba(186, 104, 200, 0.35)"; // 紫羅蘭
        }

        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /**
   * 繪製格子選取高亮
   */
  private renderHighlightCell(ctx: CanvasRenderingContext2D, snapshot: BattleSnapshot): void {
    if (!snapshot.highlightCell) return;
    const { col, row, valid } = snapshot.highlightCell;
    const { tileSize, offsetX, offsetY } = snapshot;

    const px = offsetX + col * tileSize;
    const py = offsetY + row * tileSize;

    ctx.save();
    if (valid) {
      ctx.fillStyle = "rgba(76, 175, 80, 0.35)";
      ctx.strokeStyle = "#4caf50";
    } else {
      ctx.fillStyle = "rgba(244, 67, 54, 0.35)";
      ctx.strokeStyle = "#f44336";
    }

    ctx.lineWidth = 2.5;
    ctx.fillRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
    ctx.strokeRect(px + 2, py + 2, tileSize - 4, tileSize - 4);

    if (!valid) {
      // 繪製禁止紅叉
      ctx.beginPath();
      ctx.moveTo(px + 10, py + 10);
      ctx.lineTo(px + tileSize - 10, py + tileSize - 10);
      ctx.moveTo(px + tileSize - 10, py + 10);
      ctx.lineTo(px + 10, py + tileSize - 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 繪製橫掃/技能特效
   */
  private renderVisualFxs(ctx: CanvasRenderingContext2D, snapshot: BattleSnapshot): void {
    for (const fx of snapshot.visualFxs) {
      const progress = Math.min(1.0, fx.elapsed / fx.duration);
      const alpha = 1.0 - progress;

      ctx.save();
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.radius * (0.4 + progress * 0.6), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 235, 59, ${alpha * 0.8})`;
      ctx.lineWidth = 4 * (1.0 - progress);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * 繪製所有戰鬥單位 (Y 軸深度排序)
   */
  private renderUnits(ctx: CanvasRenderingContext2D, snapshot: BattleSnapshot): void {
    const allUnits = [...snapshot.towers, ...snapshot.heroes, ...snapshot.enemies];

    // 依 Y 座標從小到大排列，確保前方單位遮擋後方單位
    allUnits.sort((a, b) => a.y - b.y);

    for (const unit of allUnits) {
      this.renderSingleUnit(ctx, unit);
    }
  }

  /**
   * 繪製單一單位
   */
  private renderSingleUnit(ctx: CanvasRenderingContext2D, unit: UnitRenderData): void {
    const radius = unit.radius || 20;

    // 飛行單位高度位移
    const flyAltitude = unit.isFlying ? 16 + Math.sin(this.pulsePhase * 1.5) * 4 : 0;
    const renderY = unit.y - flyAltitude;

    // 1. 影子繪製
    ctx.save();
    ctx.beginPath();
    const shadowRadius = unit.isFlying ? radius * 0.75 : radius * 0.9;
    ctx.ellipse(unit.x, unit.y + 4, shadowRadius, shadowRadius * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = unit.isFlying ? "rgba(0, 0, 0, 0.2)" : "rgba(0, 0, 0, 0.4)";
    ctx.fill();
    ctx.restore();

    // 2. 獲取素材圖片 (考慮攻擊動作幀)
    let textureKey = unit.textureKey || "";
    if (unit.isAttacking) {
      // 轉換為攻擊動作幀鍵值
      if (textureKey.includes("tower_") && !textureKey.includes("attack") && !textureKey.includes("atk")) {
        textureKey = textureKey.replace(".webp", "_attack.webp").replace("scholar_attack", "scholar_atk");
      } else if (textureKey.includes("hero_") && !textureKey.includes("atk")) {
        textureKey = textureKey.replace(".webp", "_atk.webp");
      } else if (textureKey.includes("enemy_") && !textureKey.includes("atk")) {
        textureKey = textureKey.replace(".webp", "_atk.webp");
      }
    }

    const img = textureKey ? this.assetLoader.getImage(textureKey) : null;
    const isImgReady = img && img.complete && img.naturalWidth > 0;

    ctx.save();

    // 攻擊時微微震動與縮放
    if (unit.isAttacking) {
      ctx.translate(unit.x, renderY);
      ctx.scale(1.12, 1.12);
      ctx.translate(-unit.x, -renderY);
    }

    if (isImgReady && img) {
      // 貼圖居中繪製
      const drawSize = radius * 2.4;
      ctx.drawImage(img, unit.x - drawSize / 2, renderY - drawSize / 2, drawSize, drawSize);
    } else {
      // 無素材時的精緻英雄/塔/敵兵符號令牌
      ctx.beginPath();
      ctx.arc(unit.x, renderY, radius, 0, Math.PI * 2);
      ctx.fillStyle = unit.color || "#888";
      ctx.fill();

      // 金色/銀色令牌邊框
      ctx.strokeStyle = unit.type === "hero" ? "#ffd700" : "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 單位中文縮寫字樣
      if (unit.label) {
        ctx.fillStyle = "#ffffff";
        ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(unit.label.substring(0, 2), unit.x, renderY);
      }
    }

    // 選中時的光環光暈
    if (unit.isSelected) {
      ctx.beginPath();
      ctx.arc(unit.x, renderY, radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = "#42a5f5";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // 3. 狀態異常圖示 (燃燒、暈眩、減速)
    if (unit.isBurning) {
      ctx.fillStyle = "#ff5722";
      ctx.beginPath();
      ctx.arc(unit.x - 12, renderY - radius - 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (unit.isSlowed) {
      ctx.fillStyle = "#00bcd4";
      ctx.beginPath();
      ctx.arc(unit.x + 12, renderY - radius - 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (unit.isStunned) {
      ctx.fillStyle = "#ffeb3b";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("★", unit.x, renderY - radius - 10);
    }

    // 4. 血條繪製 (敵人與英雄)
    if (unit.maxHp > 0 && unit.currentHp >= 0) {
      const barW = Math.max(32, radius * 1.8);
      const barH = 5;
      const barX = unit.x - barW / 2;
      const barY = renderY - radius - 8;

      const hpRatio = Math.max(0, Math.min(1, unit.currentHp / unit.maxHp));

      // 底槽
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

      // 血量填充 (綠 -> 黃 -> 紅)
      if (hpRatio > 0.5) {
        ctx.fillStyle = "#4caf50";
      } else if (hpRatio > 0.2) {
        ctx.fillStyle = "#ff9800";
      } else {
        ctx.fillStyle = "#f44336";
      }
      ctx.fillRect(barX, barY, barW * hpRatio, barH);
    }

    // 5. 塔等級徽章
    if (unit.type === "tower" && unit.level) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.beginPath();
      ctx.arc(unit.x, renderY + radius + 4, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffca28";
      ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${unit.level}`, unit.x, renderY + radius + 4);
    }

    ctx.restore();
  }

  /**
   * 繪製飄字 (傷害數字、技能名稱、治療)
   */
  private renderFloatingTexts(ctx: CanvasRenderingContext2D, snapshot: BattleSnapshot): void {
    for (const item of snapshot.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = item.alpha;

      const scale = item.scale || 1.0;
      const fontSize = Math.round(15 * scale);
      ctx.font = `bold ${fontSize}px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // 黑色立體描邊
      ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
      ctx.lineWidth = 3;
      ctx.strokeText(item.text, item.x, item.y);

      // 原文字色彩
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, item.x, item.y);

      ctx.restore();
    }
  }

  /**
   * 繪製拖曳中單位影子與預覽
   */
  private renderDragGhost(ctx: CanvasRenderingContext2D, snapshot: BattleSnapshot): void {
    if (!snapshot.dragGhost) return;
    const { x, y, rangePx, color, name } = snapshot.dragGhost;

    ctx.save();
    // 預覽射程圈
    if (rangePx > 0) {
      ctx.beginPath();
      ctx.arc(x, y, rangePx, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(33, 150, 243, 0.15)";
      ctx.fill();
      ctx.strokeStyle = "rgba(33, 150, 243, 0.8)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
    }

    // 拖曳圖示幽靈半透明
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fillStyle = color || "#2196f3";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.substring(0, 2), x, y);
    ctx.restore();
  }
}
