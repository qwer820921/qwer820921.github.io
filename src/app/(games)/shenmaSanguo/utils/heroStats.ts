import { HeroConfig, StaticConfig } from "../types";

/**
 * 武將屬性的共同規則（攻擊間隔）
 * 正式的 heroes_config 用 speed_growth 記攻速成長，程式內部（Web 與 Godot）一律用 atk_spd_growth：
 * 靜態設定進入 store 時（新的 API 回應、已存在的本機快取）都經過 normalizeStaticConfig，
 * 之後的畫面與送進 Godot 的 heroes_config 都只看 atk_spd_growth
 */

/** 有效的成長值：有限、非負的數字（或內容是這種數字的字串）；其他一律無效（回傳 null） */
function validGrowth(v: unknown): number | null {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim() !== ""
        ? Number(v)
        : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * 攻速成長：atk_spd_growth 有效（包含明確的 0）就用它，否則用有效的 speed_growth，兩者都沒有或無效時是 0
 * （不用 a || b，避免明確的 0 被蓋掉）
 */
export function normalizeHeroConfig(raw: HeroConfig): HeroConfig {
  const growth =
    validGrowth(raw.atk_spd_growth) ?? validGrowth(raw.speed_growth) ?? 0;
  return { ...raw, atk_spd_growth: growth };
}

export function normalizeStaticConfig(config: StaticConfig): StaticConfig {
  return {
    ...config,
    heroesConfig: (config.heroesConfig ?? []).map(normalizeHeroConfig),
  };
}

/**
 * 攻擊間隔（秒，數字越小越快）＝ max(0.1, attack_speed × (1 − (等級 − 1) × 攻速成長))
 * 和 Godot 的 Hero.gd 相同（初始化與 update_team 都從設定重新計算，不疊算）；技能不影響攻擊間隔
 */
export function attackIntervalSec(
  config: Pick<HeroConfig, "attack_speed" | "atk_spd_growth">,
  level: number
): number {
  return Math.max(
    0.1,
    config.attack_speed * (1 - (level - 1) * config.atk_spd_growth)
  );
}

/** 顯示用：最多 3 位小數（1.881、0.98、1），內部仍用完整精度 */
export function formatSec(sec: number): string {
  return String(Number(sec.toFixed(3)));
}
