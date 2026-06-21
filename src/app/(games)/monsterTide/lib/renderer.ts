import type {
  Player,
  Base,
  Bullet,
  Enemy,
  Particle,
  Boss,
  GamePhase,
} from "../types";
import { CANVAS_WIDTH, CANVAS_HEIGHT, MAX_WEAPON_SLOTS } from "./constants";
import { ENEMY_COLORS } from "./entities/enemy";
import { getOrbitBladeCount, getOrbitBladeRadius } from "./skills";

const BG_THEMES = {
  graveyard: { sky: "#1a1a2e", ground: "#2d4a1e" },
  dungeon: { sky: "#0d0d0d", ground: "#3a2010" },
  castle: { sky: "#1c1825", ground: "#3a3428" },
} as const;

type BgTheme = keyof typeof BG_THEMES;

const WEAPON_ABBR: Record<string, string> = {
  basic_shot: "GUN",
  orbit_blade: "BLD",
  multi_arrow: "ARW",
  aoe_orb: "ORB",
};

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  player: Player,
  base: Base,
  bullets: Bullet[],
  enemyBullets: Bullet[],
  enemies: Enemy[],
  particles: Particle[],
  boss: Boss | null,
  waveCurrent: number,
  waveTotal: number,
  totalExp: number,
  expThreshold: number,
  bgTheme: BgTheme = "graveyard",
  phase: GamePhase = "PLAYING",
  waveTransitionMessage = ""
): void {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  renderBackground(ctx, bgTheme);
  renderBase(ctx, base);
  renderEnemies(ctx, enemies);
  if (boss?.isAlive) renderBoss(ctx, boss);
  renderBullets(ctx, bullets, false);
  renderBullets(ctx, enemyBullets, true);
  renderPlayer(ctx, player);
  renderOrbitBlades(ctx, player);
  renderParticles(ctx, particles);
  renderHUD(ctx, player, base, waveCurrent, waveTotal, totalExp, expThreshold);
  if (phase === "WAVE_TRANSITION")
    renderWaveTransition(ctx, waveTransitionMessage);
}

function renderBackground(ctx: CanvasRenderingContext2D, theme: BgTheme): void {
  const { sky, ground } = BG_THEMES[theme];
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT - 80);
  ctx.fillStyle = ground;
  ctx.fillRect(0, CANVAS_HEIGHT - 80, CANVAS_WIDTH, 80);
}

function renderBase(ctx: CanvasRenderingContext2D, base: Base): void {
  ctx.fillStyle = "#4a6fa5";
  ctx.fillRect(base.x, base.y, base.width, base.height);
  const hpRatio = base.currentHp / base.maxHp;
  const barY = base.y - 8;
  ctx.fillStyle = "#222";
  ctx.fillRect(base.x, barY, base.width, 6);
  ctx.fillStyle =
    hpRatio > 0.5 ? "#4caf50" : hpRatio > 0.25 ? "#ff9800" : "#f44336";
  ctx.fillRect(base.x, barY, base.width * hpRatio, 6);
}

function renderEnemies(ctx: CanvasRenderingContext2D, enemies: Enemy[]): void {
  for (const e of enemies) {
    if (!e.isAlive) continue;
    const { x, y, width, height } = e;

    ctx.fillStyle = ENEMY_COLORS[e.type];
    ctx.fillRect(x - width / 2, y - height / 2, width, height);

    if (e.flashTimer && e.flashTimer > 0) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - width / 2, y - height / 2, width, height);
      ctx.globalAlpha = 1;
    }

    if (e.type === "armored_knight") {
      const maxArmor = 30;
      const armorRatio = e.armor / maxArmor;
      ctx.fillStyle = "#222";
      ctx.fillRect(x - width / 2, y - height / 2 - 14, width, 4);
      ctx.fillStyle = "#8ab0d0";
      ctx.fillRect(x - width / 2, y - height / 2 - 14, width * armorRatio, 4);
    }

    const hpRatio = e.hp / e.maxHp;
    const barY = y - height / 2 - (e.type === "armored_knight" ? 22 : 8);
    ctx.fillStyle = "#333";
    ctx.fillRect(x - width / 2, barY, width, 4);
    ctx.fillStyle = "#4caf50";
    ctx.fillRect(x - width / 2, barY, width * Math.max(0, hpRatio), 4);
  }
}

function renderBoss(ctx: CanvasRenderingContext2D, boss: Boss): void {
  const { x, y, width, height } = boss;
  const isArmorBreak = boss.phase === "PHASE_ARMOR_BREAK";

  // 主體
  const bodyColor = boss.type === "dungeon_lord" ? "#7a1820" : "#4a2060";
  ctx.fillStyle = isArmorBreak ? "#ffffff" : bodyColor;
  ctx.fillRect(x - width / 2, y - height / 2, width, height);

  // 受擊閃白
  if ((boss.flashTimer ?? 0) > 0) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - width / 2, y - height / 2, width, height);
    ctx.globalAlpha = 1;
  }

  // 護甲破除震動效果
  if (isArmorBreak) {
    ctx.globalAlpha = 0.6 + Math.random() * 0.4;
    ctx.strokeStyle = "#80c0ff";
    ctx.lineWidth = 3;
    ctx.strokeRect(
      x - width / 2 - 2,
      y - height / 2 - 2,
      width + 4,
      height + 4
    );
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }

  // 護甲條（地城領主）
  if (boss.maxArmor > 0) {
    const armorRatio = boss.armor / boss.maxArmor;
    const aBarY = y - height / 2 - 22;
    ctx.fillStyle = "#222";
    ctx.fillRect(x - width / 2, aBarY, width, 6);
    ctx.fillStyle = "#8ab0d0";
    ctx.fillRect(x - width / 2, aBarY, width * Math.max(0, armorRatio), 6);
  }

  // HP 條
  const hpRatio = boss.hp / boss.maxHp;
  const hpBarY = y - height / 2 - (boss.maxArmor > 0 ? 12 : 12);
  ctx.fillStyle = "#222";
  ctx.fillRect(x - width / 2, hpBarY, width, 6);
  ctx.fillStyle =
    hpRatio > 0.5 ? "#c04040" : hpRatio > 0.25 ? "#ff6820" : "#ff2020";
  ctx.fillRect(x - width / 2, hpBarY, width * Math.max(0, hpRatio), 6);

  // Boss 名稱
  const bossLabel = boss.type === "dungeon_lord" ? "⚔ 地城領主" : "🕷 蜘蛛王";
  ctx.fillStyle = "#ffcc00";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.fillText(bossLabel, x, y - height / 2 - (boss.maxArmor > 0 ? 30 : 20));
  ctx.textAlign = "left";
}

function renderBullets(
  ctx: CanvasRenderingContext2D,
  bullets: Bullet[],
  isEnemy: boolean
): void {
  ctx.fillStyle = isEnemy ? "#e84040" : "#f0e040";
  for (const b of bullets) {
    if (!b.isAlive) continue;
    ctx.fillRect(b.x - b.width / 2, b.y - b.height / 2, b.width, b.height);
  }
}

function renderPlayer(ctx: CanvasRenderingContext2D, player: Player): void {
  const { x, y, width, height } = player;
  ctx.fillStyle = "#c8a860";
  ctx.fillRect(x - width / 2, y - height / 2, width, height);
  ctx.fillStyle = "#e8c880";
  ctx.fillRect(x - 8, y - height / 2, 16, 16);
}

function renderOrbitBlades(
  ctx: CanvasRenderingContext2D,
  player: Player
): void {
  const BLADE_W = 10;
  const BLADE_H = 26;

  for (const weapon of player.weapons) {
    if (weapon.type !== "orbit_blade") continue;
    const count = getOrbitBladeCount(weapon.level);
    const radius = getOrbitBladeRadius(weapon.level);
    const baseAngle = weapon.orbitAngle ?? 0;

    for (let b = 0; b < count; b++) {
      const angle = baseAngle + (b * Math.PI * 2) / count;
      const bx = player.x + Math.cos(angle) * radius;
      const by = player.y + Math.sin(angle) * radius;

      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = "#e8d050";
      ctx.fillRect(-BLADE_W / 2, -BLADE_H / 2, BLADE_W, BLADE_H);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(-BLADE_W / 2, -BLADE_H / 2, BLADE_W, BLADE_H);
      ctx.restore();
    }
  }
}

function renderParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[]
): void {
  for (const p of particles) {
    if (!p.isAlive) continue;
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function renderHUD(
  ctx: CanvasRenderingContext2D,
  player: Player,
  base: Base,
  waveCurrent: number,
  waveTotal: number,
  totalExp: number,
  expThreshold: number
): void {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, CANVAS_WIDTH, 36);

  ctx.font = "bold 14px monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";

  const waveText =
    waveCurrent > 0 ? `Wave ${waveCurrent}/${waveTotal}` : "Wave --/--";
  ctx.fillText(waveText, 10, 22);

  ctx.textAlign = "right";
  ctx.fillText(`HP ${base.currentHp}/${base.maxHp}`, CANVAS_WIDTH - 8, 22);
  ctx.textAlign = "left";

  // 武器槓位
  const slotSize = 40;
  const slotGap = 4;
  const totalSlotW = MAX_WEAPON_SLOTS * (slotSize + slotGap) - slotGap;
  const slotsX = (CANVAS_WIDTH - totalSlotW) / 2;
  const slotsY = CANVAS_HEIGHT - 52;

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(slotsX - 4, slotsY - 4, totalSlotW + 8, slotSize + 8);

  for (let i = 0; i < MAX_WEAPON_SLOTS; i++) {
    const sx = slotsX + i * (slotSize + slotGap);
    const weapon = player.weapons[i];

    ctx.fillStyle = weapon ? "#1e3a5f" : "#1a1a2a";
    ctx.fillRect(sx, slotsY, slotSize, slotSize);
    ctx.strokeStyle = weapon ? "#4a8ac4" : "#333344";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, slotsY, slotSize, slotSize);

    if (weapon) {
      ctx.fillStyle = "#aac8e8";
      ctx.font = "9px monospace";
      ctx.fillText(
        WEAPON_ABBR[weapon.type] ?? weapon.type.slice(0, 3).toUpperCase(),
        sx + 4,
        slotsY + 14
      );
      ctx.fillStyle = "#f0c040";
      ctx.font = "10px monospace";
      ctx.fillText(`Lv${weapon.level}`, sx + 4, slotsY + 30);
    }
  }

  // EXP 條（左側豎條）
  const expBarH = 180;
  const expBarW = 5;
  const expBarX = 6;
  const expBarY = (CANVAS_HEIGHT - expBarH) / 2;
  const expRatio = expThreshold > 0 ? Math.min(totalExp / expThreshold, 1) : 0;

  ctx.fillStyle = "#222";
  ctx.fillRect(expBarX, expBarY, expBarW, expBarH);
  ctx.fillStyle = "#7b42f5";
  ctx.fillRect(
    expBarX,
    expBarY + expBarH * (1 - expRatio),
    expBarW,
    expBarH * expRatio
  );
}

function renderWaveTransition(
  ctx: CanvasRenderingContext2D,
  message: string
): void {
  const centerY = CANVAS_HEIGHT / 2;
  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(0, centerY - 56, CANVAS_WIDTH, 112);
  ctx.fillStyle = "#f0e040";
  ctx.font = "bold 38px monospace";
  ctx.textAlign = "center";
  ctx.fillText(message, CANVAS_WIDTH / 2, centerY + 4);
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = "15px monospace";
  ctx.fillText("準備好了嗎...", CANVAS_WIDTH / 2, centerY + 34);
  ctx.textAlign = "left";
}
