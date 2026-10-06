/**
 * SoundManager.ts
 * 神馬三國音效與背景音樂管理器 (Web Audio API)
 * 1. 內建 Godot 原版 8 組 SFX (base64 解碼預載入)
 * 2. 跨平台相容（Safari ogg 降級回 Oscillator 合成音）
 * 3. 內建古風五音階 (宮商角徵羽) 戰鬥 BGM 合成引擎，零延遲循環播放
 * 4. 支援全局靜音、音量調節、手勢解鎖 (AudioContext resume)
 */

import { SFX_DATA } from "./sfxData";

export class SoundManager {
  private static instance: SoundManager;

  private audioCtx: AudioContext | null = null;
  private sfxBuffers: Map<string, AudioBuffer> = new Map();
  private isUnlocked = false;

  private sfxMuted = false;
  private bgmMuted = false;
  private sfxVolume = 0.8;
  private bgmVolume = 0.4;

  // BGM 相關
  private bgmIntervalId: number | null = null;
  private isBgmPlaying = false;
  private bgmGainNode: GainNode | null = null;

  private constructor() {
    // 延遲到第一次用戶點擊時初始化 AudioContext
  }

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  /**
   * 解鎖 Web Audio（需在使用者互動事件中觸發）
   */
  public unlockAudio(): void {
    if (this.isUnlocked && this.audioCtx && this.audioCtx.state === "running") {
      return;
    }

    try {
      if (!this.audioCtx) {
        const AudioCtxClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtxClass) {
          this.audioCtx = new AudioCtxClass();
        }
      }

      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
      }

      this.isUnlocked = true;
      this.preloadAllSfx();
    } catch {
      // 靜默處理
    }
  }

  /**
   * 預先非同步解碼所有 SFX
   */
  private async preloadAllSfx(): Promise<void> {
    if (!this.audioCtx) return;

    for (const [key, dataUri] of Object.entries(SFX_DATA)) {
      if (this.sfxBuffers.has(key)) continue;
      try {
        const response = await fetch(dataUri);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        this.sfxBuffers.set(key, audioBuffer);
      } catch {
        // 部分瀏覽器（如舊版 Safari）可能不支援 ogg 解碼，將自動走 synthesizeFallbackSfx
      }
    }
  }

  /**
   * 播放音效
   */
  public play(name: string): void {
    if (this.sfxMuted) return;
    this.unlockAudio();
    if (!this.audioCtx) return;

    const buffer = this.sfxBuffers.get(name);
    if (buffer) {
      try {
        const source = this.audioCtx.createBufferSource();
        source.buffer = buffer;
        const gain = this.audioCtx.createGain();
        gain.gain.value = this.sfxVolume;
        source.connect(gain);
        gain.connect(this.audioCtx.destination);
        source.start(0);
        return;
      } catch {
        // 播放失敗走合成音備援
      }
    }

    // 若未解碼完成或不支援 ogg，使用 Web Audio 合成音即時模擬原音
    this.synthesizeFallbackSfx(name);
  }

  /**
   * 瀏覽器未支援 ogg 或 buffer 尚未載入時的微秒級合成備援音效
   */
  private synthesizeFallbackSfx(name: string): void {
    if (!this.audioCtx || this.sfxMuted) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (name) {
      case "tower_shoot": {
        // 銳利射擊短音 (Arrow Whoosh / Zip)
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
        gain.gain.setValueAtTime(this.sfxVolume * 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.09);
        break;
      }
      case "enemy_hit": {
        // 打擊短音
        osc.type = "triangle";
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.06);
        gain.gain.setValueAtTime(this.sfxVolume * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.07);
        break;
      }
      case "enemy_die": {
        // 倒地消散 (低音滑音)
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);
        gain.gain.setValueAtTime(this.sfxVolume * 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.19);
        break;
      }
      case "tower_place":
      case "hero_place": {
        // 放置木石落定聲
        osc.type = "sine";
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.12);
        gain.gain.setValueAtTime(this.sfxVolume * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.13);
        break;
      }
      case "upgrade": {
        // 升級成功音階 (C5 -> E5 -> G5)
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((freq, idx) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "triangle";
          o.frequency.value = freq;
          o.connect(g);
          g.connect(ctx.destination);
          const t = now + idx * 0.08;
          g.gain.setValueAtTime(this.sfxVolume * 0.35, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
          o.start(t);
          o.stop(t + 0.13);
        });
        break;
      }
      case "battle_win": {
        // 勝利號角三和弦 (C5 -> G5 -> C6)
        const victory = [523.25, 659.25, 783.99, 1046.5];
        victory.forEach((freq, idx) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "sine";
          o.frequency.value = freq;
          o.connect(g);
          g.connect(ctx.destination);
          const t = now + idx * 0.14;
          g.gain.setValueAtTime(this.sfxVolume * 0.45, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
          o.start(t);
          o.stop(t + 0.36);
        });
        break;
      }
      case "battle_lose": {
        // 失敗低沉和弦
        const lose = [220, 196, 174.61, 146.83];
        lose.forEach((freq, idx) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "sawtooth";
          o.frequency.value = freq;
          o.connect(g);
          g.connect(ctx.destination);
          const t = now + idx * 0.16;
          g.gain.setValueAtTime(this.sfxVolume * 0.3, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
          o.start(t);
          o.stop(t + 0.26);
        });
        break;
      }
      default:
        break;
    }
  }

  /**
   * 啟動戰鬥背景音樂 (Procedural Ancient Chinese Pentatonic Battle Music)
   */
  public playBgm(): void {
    if (this.isBgmPlaying || this.bgmMuted) return;
    this.unlockAudio();
    if (!this.audioCtx) return;

    this.isBgmPlaying = true;
    this.bgmGainNode = this.audioCtx.createGain();
    this.bgmGainNode.gain.value = this.bgmVolume;
    this.bgmGainNode.connect(this.audioCtx.destination);

    // 三國五音階 (宮 C4, 商 D4, 角 E4, 徵 G4, 羽 A4 及高八度)
    const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];
    let step = 0;

    const playBeat = () => {
      if (!this.audioCtx || !this.isBgmPlaying || !this.bgmGainNode) return;
      const ctx = this.audioCtx;
      const now = ctx.currentTime;

      // 戰鼓節拍 (每拍一聲低鼓)
      if (step % 2 === 0) {
        const drumOsc = ctx.createOscillator();
        const drumGain = ctx.createGain();
        drumOsc.type = "sine";
        drumOsc.frequency.setValueAtTime(110, now);
        drumOsc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
        drumGain.gain.setValueAtTime(0.3, now);
        drumGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        drumOsc.connect(drumGain);
        drumGain.connect(this.bgmGainNode);
        drumOsc.start(now);
        drumOsc.stop(now + 0.16);
      }

      // 古風琴音 (每拍彈奏一個五聲音符)
      const noteFreq = scale[step % scale.length];
      const melodyOsc = ctx.createOscillator();
      const melodyGain = ctx.createGain();
      melodyOsc.type = "triangle";
      melodyOsc.frequency.value = noteFreq;
      melodyGain.gain.setValueAtTime(0.15, now);
      melodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      melodyOsc.connect(melodyGain);
      melodyGain.connect(this.bgmGainNode);
      melodyOsc.start(now);
      melodyOsc.stop(now + 0.23);

      step = (step + 1) % 16;
    };

    // 140 BPM 節奏
    const intervalMs = Math.round((60 / 140) * 1000);
    playBeat();
    this.bgmIntervalId = window.setInterval(playBeat, intervalMs);
  }

  /**
   * 停止背景音樂
   */
  public stopBgm(): void {
    if (this.bgmIntervalId !== null) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
    this.isBgmPlaying = false;
  }

  /**
   * 靜音控制
   */
  public setSfxMuted(muted: boolean): void {
    this.sfxMuted = muted;
  }

  public setBgmMuted(muted: boolean): void {
    this.bgmMuted = muted;
    if (muted) {
      this.stopBgm();
    } else {
      this.playBgm();
    }
  }

  public isSfxMuted(): boolean {
    return this.sfxMuted;
  }

  public isBgmMuted(): boolean {
    return this.bgmMuted;
  }

  public setSfxVolume(vol: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
  }

  public setBgmVolume(vol: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, vol));
    if (this.bgmGainNode) {
      this.bgmGainNode.gain.value = this.bgmVolume;
    }
  }
}
