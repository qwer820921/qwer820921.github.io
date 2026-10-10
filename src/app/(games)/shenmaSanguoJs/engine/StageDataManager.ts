/**
 * StageDataManager.ts
 * 關卡資料與 GAS 後端非同步資料整合器
 * 1. 優先自 localStorage ("shenma_static_config") 讀取全量 100 關地圖、武將與敵兵設定
 * 2. 若快取未命中，自動向 Google Apps Script (GAS) API 非同步抓取 get_all_maps, get_heroes_config, get_enemies_config
 * 3. 離線或網路異常時平滑降級至 BUILTIN_STAGES，保證 100% 可玩性
 */

import {
  StageData,
  BUILTIN_STAGES,
  BUILTIN_HEROES_CONFIG,
  BUILTIN_ENEMIES_CONFIG,
} from "./builtinData";
import { HeroConfigData } from "./entities/HeroEntity";
import { EnemyConfigData } from "./entities/EnemyEntity";

const STATIC_LOCAL_KEY = "shenma_static_config";
const STATIC_TS_KEY = "shenma_static_ts";
const CACHE_TTL_MS = 60_000; // 60 秒
/** 快取裡和 maps 一起保存的名稱來源資料版本 */
const MAPS_SOURCE_VERSION = 1;

/** 這份關卡清單的指紋（關數＋每關的 map_id 與名稱）：來源資料要和目前的 maps 對得上 */
function stagesFingerprint(stages: StageData[]): string {
  let h = 0x811c9dc5;
  for (const s of stages) {
    const part = `${s.map_id}\u0000${s.name}\u0001`;
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return `${stages.length}:${h.toString(16)}`;
}

const DEFAULT_GAS_URL =
  process.env.NEXT_PUBLIC_SHENMA_GAS_URL ||
  "https://script.google.com/macros/s/AKfycbwp4fh9r832zzUwY6x1HnvxrhuKxGAb0cluL_89ydsqSLQAwHHxMkUt_8mJQO1xDpue/exec";

export class StageDataManager {
  private static instance: StageDataManager;

  private stages: StageData[] = BUILTIN_STAGES;
  private heroesConfig: HeroConfigData[] = BUILTIN_HEROES_CONFIG;
  private enemiesConfig: EnemyConfigData[] = BUILTIN_ENEMIES_CONFIG;
  private isLoaded = false;
  private isLoading = false;
  /** 名稱來源已確認的那一份關卡清單（正式 get_all_maps 的正常回應，或帶著相符來源資料的快取）；換掉 stages 就不再相符 */
  private namesConfirmedFor: StageData[] | null = null;

  private constructor() {}

  public static getInstance(): StageDataManager {
    if (!StageDataManager.instance) {
      StageDataManager.instance = new StageDataManager();
    }
    return StageDataManager.instance;
  }

  /**
   * 取得所有關卡清單
   */
  public getStages(): StageData[] {
    return this.stages;
  }

  /**
   * 依據 map_id 取得單一關卡
   */
  public getStageById(mapId: string): StageData | null {
    return this.stages.find((s) => s.map_id === mapId) ?? null;
  }

  /**
   * 目前這份關卡清單的名稱是否確認來自後端（只給顯示用；內建資料、空或無效的回應、沒有來源資料的舊快取都不算）
   */
  public hasConfirmedStageNames(): boolean {
    return (
      this.namesConfirmedFor !== null && this.namesConfirmedFor === this.stages
    );
  }

  public getHeroesConfig(): HeroConfigData[] {
    return this.heroesConfig;
  }

  public getEnemiesConfig(): EnemyConfigData[] {
    return this.enemiesConfig;
  }

  /**
   * 初始化並載入關卡與靜態配置（localStorage + GAS）
   */
  public async loadAllStages(): Promise<{
    stages: StageData[];
    heroesConfig: HeroConfigData[];
    enemiesConfig: EnemyConfigData[];
    source: "cache" | "gas" | "builtin";
  }> {
    if (this.isLoaded && this.stages.length > 3) {
      return {
        stages: this.stages,
        heroesConfig: this.heroesConfig,
        enemiesConfig: this.enemiesConfig,
        source: "cache",
      };
    }

    // 1. 嘗試由 localStorage 快取讀取
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(STATIC_LOCAL_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.maps) && parsed.maps.length > 0) {
            this.stages = this.normalizeMaps(parsed.maps);
            // 名稱來源：同一份快取裡、版本可辨識、和這份 maps 對得上的來源資料才算確認（舊快取沒有就不確認）
            const src = parsed.mapsSource;
            this.namesConfirmedFor =
              this.stages !== BUILTIN_STAGES &&
              !!src &&
              src.v === MAPS_SOURCE_VERSION &&
              src.action === "get_all_maps" &&
              src.fp === stagesFingerprint(this.stages)
                ? this.stages
                : null;
            if (Array.isArray(parsed.heroesConfig)) {
              this.heroesConfig = this.normalizeHeroesConfig(
                parsed.heroesConfig
              );
            }
            if (Array.isArray(parsed.enemiesConfig)) {
              this.enemiesConfig = this.normalizeEnemiesConfig(
                parsed.enemiesConfig
              );
            }
            this.isLoaded = true;

            // 檢查快取是否新鮮
            const ts = Number(localStorage.getItem(STATIC_TS_KEY) || "0");
            const isFresh = Date.now() - ts < CACHE_TTL_MS;
            if (isFresh) {
              return {
                stages: this.stages,
                heroesConfig: this.heroesConfig,
                enemiesConfig: this.enemiesConfig,
                source: "cache",
              };
            }
          }
        }
      } catch {
        // 快取損毀靜默忽略
      }
    }

    // 2. 避免重複併發打 GAS
    if (this.isLoading) {
      return {
        stages: this.stages,
        heroesConfig: this.heroesConfig,
        enemiesConfig: this.enemiesConfig,
        source: "cache",
      };
    }

    this.isLoading = true;

    // 3. 向 GAS 呼叫讀取最新資料
    try {
      const [mapsRes, heroesRes, enemiesRes] = await Promise.all([
        this.fetchGas("get_all_maps"),
        this.fetchGas("get_heroes_config"),
        this.fetchGas("get_enemies_config"),
      ]);

      if (mapsRes && Array.isArray(mapsRes.maps) && mapsRes.maps.length > 0) {
        this.stages = this.normalizeMaps(mapsRes.maps);
        // 名稱來源：正常成功的回應（status 200、沒有 error）而且正規化出後端的關卡才確認；回退成內建資料不確認
        this.namesConfirmedFor =
          mapsRes.status === 200 &&
          mapsRes.error === undefined &&
          this.stages !== BUILTIN_STAGES
            ? this.stages
            : null;
      }
      if (
        heroesRes &&
        Array.isArray(heroesRes.heroes) &&
        heroesRes.heroes.length > 0
      ) {
        this.heroesConfig = this.normalizeHeroesConfig(heroesRes.heroes);
      }
      if (
        enemiesRes &&
        Array.isArray(enemiesRes.enemies) &&
        enemiesRes.enemies.length > 0
      ) {
        this.enemiesConfig = this.normalizeEnemiesConfig(enemiesRes.enemies);
      }

      this.isLoaded = true;

      // 寫入快取
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(
            STATIC_LOCAL_KEY,
            JSON.stringify({
              maps: this.stages,
              heroesConfig: this.heroesConfig,
              enemiesConfig: this.enemiesConfig,
              // 和這份 maps 一起保存的名稱來源資料（沒有確認時是 null）
              mapsSource: this.hasConfirmedStageNames()
                ? {
                    v: MAPS_SOURCE_VERSION,
                    action: "get_all_maps",
                    fp: stagesFingerprint(this.stages),
                  }
                : null,
            })
          );
          localStorage.setItem(STATIC_TS_KEY, String(Date.now()));
        } catch {
          // localStorage 存滿時靜默處理
        }
      }

      this.isLoading = false;
      return {
        stages: this.stages,
        heroesConfig: this.heroesConfig,
        enemiesConfig: this.enemiesConfig,
        source: "gas",
      };
    } catch {
      this.isLoading = false;
      // 網路或後端異常，回退至目前資料或內建預設
      return {
        stages: this.stages,
        heroesConfig: this.heroesConfig,
        enemiesConfig: this.enemiesConfig,
        source: this.stages.length > 3 ? "cache" : "builtin",
      };
    }
  }

  /**
   * GAS 通訊封裝 (符合無 preflight 純字串 POST 規格)
   */
  private async fetchGas(action: string): Promise<any> {
    const res = await fetch(DEFAULT_GAS_URL, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      throw new Error(`GAS error status: ${res.status}`);
    }
    return res.json();
  }

  /**
   * 正規化地圖資料結構
   */
  private normalizeMaps(rawMaps: any[]): StageData[] {
    const list: StageData[] = [];
    for (const m of rawMaps) {
      if (!m || !m.map_id) continue;

      let pathJson = m.path_json;
      if (typeof pathJson === "string") {
        try {
          pathJson = JSON.parse(pathJson);
        } catch {
          pathJson = {};
        }
      }

      list.push({
        map_id: String(m.map_id),
        chapter: Number(m.chapter) || 1,
        name: String(m.name || m.map_id),
        unlock_stage: String(m.unlock_stage || m.map_id),
        path_json: pathJson || {},
        waves: Array.isArray(m.waves) ? m.waves : [],
      });
    }

    return list.length > 0 ? list : BUILTIN_STAGES;
  }

  /**
   * 正規化武將配置（確保以 hero_ 開頭並具備有效圖片路徑）
   */
  private normalizeHeroesConfig(rawHeroes: any[]): HeroConfigData[] {
    return rawHeroes.map((h) => {
      const bareId = String(h.hero_id || "").replace(/^hero_/, "");
      const fullId = `hero_${bareId}`;
      const image = h.image || `${fullId}.webp`;
      const attackImage = h.attack_image || `${fullId}_atk.webp`;
      return {
        ...h,
        hero_id: fullId,
        name: h.name || bareId,
        image,
        attack_image: attackImage,
      };
    });
  }

  /**
   * 正規化敵兵配置
   */
  private normalizeEnemiesConfig(rawEnemies: any[]): EnemyConfigData[] {
    return rawEnemies.map((e) => {
      const eid = String(e.enemy_id || "");
      const image = e.image || `enemy_${eid}.webp`;
      const attackImage = e.attack_image || `enemy_${eid}_atk.webp`;
      return {
        ...e,
        enemy_id: eid,
        name: e.name || eid,
        image,
        attack_image: attackImage,
      };
    });
  }
}
