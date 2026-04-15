// 神馬三國 GAS API Wrapper
// GAS 不支援 CORS preflight，所以不設定 Content-Type header
// body 傳純字串，GAS 用 e.postData.contents 讀取

const GAS_URL = process.env.NEXT_PUBLIC_SHENMA_SANGUO_GAS_URL!;

async function callGAS(action: string, key?: string, payload?: object) {
  const res = await fetch(GAS_URL, {
    method: "POST",
    // 不設 Content-Type，避免 CORS preflight（GAS 不處理 OPTIONS）
    body: JSON.stringify({ action, key, payload }),
  });
  const data = await res.json();
  if (data.status !== 200) {
    throw new Error(data.error || "GAS_ERROR");
  }
  return data;
}

export const gameApi = {
  // ── 玩家 ──
  createProfile: (key: string, nickname: string) =>
    callGAS("create_profile", key, {
      nickname,
      starter_heroes: [
        { hero_id: "guan_yu", star: 0, level: 1, atk: 120, def: 100, hp: 1200 },
        { hero_id: "zhou_cang", star: 0, level: 1, atk: 80, def: 60, hp: 600 },
      ],
    }),

  getProfile: (key: string) => callGAS("get_profile", key),
  getHeroes: (key: string) => callGAS("get_heroes", key),

  // ── 存檔 ──
  saveResult: (key: string, result: object) =>
    callGAS("save_result", key, result),

  saveManual: (key: string) => callGAS("save_manual", key),

  // ── 靜態設定 ──
  getHeroesConfig: () => callGAS("get_heroes_config"),
  getEnemiesConfig: () => callGAS("get_enemies_config"),
  getAllMaps: () => callGAS("get_all_maps"),
  getMapConfig: (map_id: string) =>
    callGAS("get_map_config", undefined, { map_id }),
};

// 取得或產生玩家 key（存入 localStorage）
export function getOrCreatePlayerKey(): string {
  const stored = localStorage.getItem("shenma_player_key");
  if (stored) return stored;
  const newKey = "player_" + Math.random().toString(36).slice(2, 10);
  localStorage.setItem("shenma_player_key", newKey);
  return newKey;
}
