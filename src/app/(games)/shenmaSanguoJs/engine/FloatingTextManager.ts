/**
 * FloatingTextManager.ts
 * 戰鬥傷害數字、治療、閃避、技能觸發飄字系統
 * 100% 精準對齊原版 FloatingText.gd 物理運動與淡出時序
 */

import { FloatingTextData } from "../types/render";

export interface FloatingItem {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
  duration: number; // 0.8s
  timer: number;
  vy: number; // -60 px/s
  scale: number;
}

export class FloatingTextManager {
  private items: FloatingItem[] = [];
  private seq = 0;

  public static readonly COLOR_DAMAGE_ENEMY = "rgb(255, 102, 51)";
  public static readonly COLOR_DAMAGE_HERO = "rgb(255, 51, 51)";
  public static readonly COLOR_BURN = "rgb(255, 140, 13)";
  public static readonly COLOR_COUNTER = "rgb(255, 89, 204)";
  public static readonly COLOR_HEAL = "rgb(102, 255, 115)";
  public static readonly COLOR_DODGE = "rgb(153, 235, 255)";
  public static readonly COLOR_DOUBLE_SHOT = "rgb(255, 217, 51)";
  public static readonly COLOR_FIRST_STRIKE = "rgb(255, 217, 51)";
  public static readonly COLOR_SLOW = "rgb(51, 153, 230)";

  public spawn(text: string, color: string, startX: number, startY: number, scale = 1.0): void {
    const offsetX = (Math.random() - 0.5) * 30; // [-15, 15]
    const offsetY = (Math.random() - 0.5) * 20; // [-10, 10]

    this.items.push({
      id: ++this.seq,
      text,
      color,
      x: startX + offsetX,
      y: startY + offsetY,
      duration: 0.8,
      timer: 0.0,
      vy: -60,
      scale,
    });
  }

  public update(delta: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.timer += delta;
      item.y += item.vy * delta;

      if (item.timer >= item.duration) {
        this.items.splice(i, 1);
      }
    }
  }

  public getSnapshot(): FloatingTextData[] {
    return this.items.map((item) => {
      const alpha = Math.max(0, 1.0 - item.timer / item.duration);
      return {
        id: item.id,
        text: item.text,
        x: item.x,
        y: item.y,
        color: item.color,
        alpha,
        scale: item.scale,
      };
    });
  }

  public clear(): void {
    this.items = [];
  }
}
