/**
 * 簡單的音效播放工具 (使用 Web Audio API)
 */

// 避免每次都重新創建 AudioContext
let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioContext) {
    // @ts-ignore - 兼容舊版瀏覽器
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }
  return audioContext;
};

// 播放單一音調
const playTone = (frequency: number, type: OscillatorType, duration: number, startTime: number = 0) => {
  const ctx = getAudioContext();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  const now = ctx.currentTime + startTime;
  
  // 淡入淡出避免爆音
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.1, now + 0.05);
  gainNode.gain.linearRampToValueAtTime(0, now + duration);

  oscillator.start(now);
  oscillator.stop(now + duration + 0.1);
};

export const playWinSound = () => {
    // 成功音效：兩段高音 (Ding-Ding!)
    // 第一音: 880Hz (A5), 0.1s
    // 第二音: 1760Hz (A6), 0.4s
    playTone(880, 'sine', 0.1, 0);
    playTone(1760, 'sine', 0.4, 0.15);
};

export const playLoseSound = () => {
    // 失敗音效：低沈短促 (Bup)
    // 150Hz, 0.2s, 鋸齒波比較粗糙
    playTone(150, 'sawtooth', 0.15, 0);
};

export const playErrorSound = () => {
  // 錯誤音效：兩段低音 (Buzz-Buzz)
  playTone(100, 'sawtooth', 0.1, 0);
  playTone(100, 'sawtooth', 0.1, 0.2);
};
