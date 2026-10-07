/**
 * AssetLoader.ts
 * 負責非同步載入地圖貼圖、單位立繪與攻擊幀，並進行記憶體快取。
 * 相容既有素材目錄 `/images/shenmaSanguo/`
 */

export class AssetLoader {
  private static instance: AssetLoader;
  private cache = new Map<string, HTMLImageElement>();
  private loadingPromises = new Map<string, Promise<HTMLImageElement | null>>();

  private constructor() {}

  public static getInstance(): AssetLoader {
    if (!AssetLoader.instance) {
      AssetLoader.instance = new AssetLoader();
    }
    return AssetLoader.instance;
  }

  /**
   * 正規化貼圖路徑
   * 範例：
   * "maps/bg_forest.webp" -> "/images/shenmaSanguo/maps/bg_forest.webp"
   * "tiles/tile_dirt1.webp" -> "/images/shenmaSanguo/tiles/tile_dirt1.webp"
   * "tile_dirt1.webp" -> "/images/shenmaSanguo/tiles/tile_dirt1.webp"
   * "hero_guan_yu.webp" -> "/images/shenmaSanguo/units/hero_guan_yu.webp"
   */
  public normalizeUrl(key: string): string {
    if (!key) return "";
    if (key.startsWith("http://") || key.startsWith("https://") || key.startsWith("/")) {
      return key;
    }
    let cleanKey = key;
    if (cleanKey.startsWith("res://assets/")) {
      cleanKey = cleanKey.replace("res://assets/", "");
    }
    // 若無副檔名，預設加上 .webp
    if (!cleanKey.includes(".") && !cleanKey.startsWith("http")) {
      cleanKey = `${cleanKey}.webp`;
    }

    if (cleanKey.startsWith("maps/")) {
      return `/images/shenmaSanguo/${cleanKey}`;
    }
    if (cleanKey.startsWith("tiles/")) {
      return `/images/shenmaSanguo/${cleanKey}`;
    }
    if (cleanKey.startsWith("units/")) {
      return `/images/shenmaSanguo/${cleanKey}`;
    }
    if (cleanKey.startsWith("tile_")) {
      return `/images/shenmaSanguo/tiles/${cleanKey}`;
    }
    if (
      cleanKey.startsWith("hero_") ||
      cleanKey.startsWith("enemy_") ||
      cleanKey.startsWith("tower_")
    ) {
      return `/images/shenmaSanguo/units/${cleanKey}`;
    }
    if (cleanKey.startsWith("bg_")) {
      return `/images/shenmaSanguo/maps/${cleanKey}`;
    }

    // 檢查是否為武將 bare ID (例如 ma_chao.webp)
    const KNOWN_HEROES = [
      "ma_chao", "zhao_yun", "huang_zhong", "zhou_yu", "guan_yu", "liu_bei",
      "zhang_fei", "wei_yan", "cao_cao", "xia_hou_dun", "liao_hua", "yan_liang",
      "sun_shang_xiang", "lv_bu", "diao_chan", "zhu_ge_liang", "dian_wei",
      "sun_quan", "gan_ning", "xu_chu", "pang_tong", "lu_su", "zhou_cang"
    ];
    const baseKey = cleanKey.replace(/\.webp$/, "").replace(/_atk$/, "");
    if (KNOWN_HEROES.includes(baseKey)) {
      const isAtk = cleanKey.includes("_atk");
      return `/images/shenmaSanguo/units/hero_${baseKey}${isAtk ? "_atk" : ""}.webp`;
    }

    return `/images/shenmaSanguo/tiles/${cleanKey}`;
  }

  /**
   * 載入單張貼圖並快取
   */
  public async load(key: string): Promise<HTMLImageElement | null> {
    if (!key) return null;
    const url = this.normalizeUrl(key);
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }
    if (this.loadingPromises.has(url)) {
      return this.loadingPromises.get(url)!;
    }

    const promise = new Promise<HTMLImageElement | null>((resolve) => {
      if (typeof window === "undefined" || typeof Image === "undefined") {
        resolve(null);
        return;
      }
      const img = new Image();
      img.src = url;
      img.onload = () => {
        this.cache.set(url, img);
        this.loadingPromises.delete(url);
        resolve(img);
      };
      img.onerror = () => {
        // 貼圖載入失敗時靜默忽略，由繪圖端使用純色 Fallback
        this.loadingPromises.delete(url);
        resolve(null);
      };
    });

    this.loadingPromises.set(url, promise);
    return promise;
  }

  /**
   * 批次預載貼圖清單
   */
  public async preloadBatch(keys: string[]): Promise<void> {
    const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
    await Promise.all(uniqueKeys.map((k) => this.load(k)));
  }

  /**
   * 同步讀取已快取之圖片，若尚未載入回傳 null
   */
  public get(key: string): HTMLImageElement | null {
    const url = this.normalizeUrl(key);
    return this.cache.get(url) ?? null;
  }

  /**
   * 同步讀取已快取之圖片，若尚未載入則觸發非同步載入並回傳 null
   */
  public getImage(key: string): HTMLImageElement | null {
    const img = this.get(key);
    if (!img) {
      this.load(key);
    }
    return img;
  }

  /**
   * 清除快取
   */
  public clear(): void {
    this.cache.clear();
    this.loadingPromises.clear();
  }
}
