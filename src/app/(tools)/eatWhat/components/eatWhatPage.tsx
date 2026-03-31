"use client";
import React, { useEffect, useState } from "react";
import SpinnerCanvas from "./spinnerCanvas";
import { Coordinates, Food } from "../types";
import { searchNearbyRestaurants } from "../api/googlePlaces";
import LoadingOverlay from "@/components/common/loadingOverlay";
import styles from "./eatWhat.module.css";

const EatWhatPage: React.FC = () => {
  // ====== 狀態管理 ======
  const [foods, setFoods] = useState<Food[]>([]);
  const [baseAddress, setBaseAddress] = useState<string>("");
  const [baseLatLng, setBaseLatLng] = useState<Coordinates | null>(null);
  const [searchRadius, setSearchRadius] = useState<number>(500); // 新增半徑狀態

  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("正在為您尋找美食...");

  // Tab 控制狀態
  const [activeTab, setActiveTab] = useState<"設定" | "轉盤" | "候選">("轉盤");
  const [isGeolocationDenied, setIsGeolocationDenied] = useState(false);

  // ====== 初始化定位與自動搜尋 ======
  useEffect(() => {
    // 只有在還沒有定位時才要
    if (!baseLatLng && !isGeolocationDenied && foods.length === 0) {
      handleInitialLocation();
    }
  }, []);

  const handleInitialLocation = () => {
    if (navigator.geolocation) {
      setIsLoading(true);
      setLoadingText("正在取得您的位置...");
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setBaseAddress("當前位置");
          const latLng = { lat: latitude, lng: longitude };
          setBaseLatLng(latLng);

          setIsGeolocationDenied(false);

          // 成功取得位置後，自動開始搜美食
          await handleSearchNearbyAction(latLng, searchRadius);

          // 如果還是找不到任何餐廳，就跳出提示
        },
        (error) => {
          setIsLoading(false);
          setIsGeolocationDenied(true);
          setActiveTab("設定"); // 定位失敗，自動跳出手動輸入選單
          console.error("定位失敗：", error);
        },
        { timeout: 10000 }
      );
    } else {
      setIsGeolocationDenied(true);
      setActiveTab("設定");
    }
  };

  // ====== 距離計算 ======
  function calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  const updateDistancesForFoods = (
    targetFoods: Food[],
    basePoint: Coordinates
  ) => {
    if (!basePoint) return targetFoods;
    return targetFoods.map((food) => {
      if (food.coordinates) {
        const dist = calculateDistance(
          basePoint.lat,
          basePoint.lng,
          food.coordinates.lat,
          food.coordinates.lng
        );
        return { ...food, distance: Math.round(dist * 10) / 10 };
      }
      return { ...food, distance: undefined };
    });
  };

  // ====== 核心搜尋邏輯 ======
  const handleSearchNearbyAction = async (
    latLng: Coordinates,
    radius: number
  ) => {
    setIsLoading(true);
    setLoadingText("正在為您尋找附近的美食...");
    try {
      const mockResults = await searchNearbyRestaurants(
        latLng,
        radius.toString()
      );
      const resultsWithDistance = updateDistancesForFoods(mockResults, latLng);
      setFoods(resultsWithDistance);
    } catch (error) {
      console.error("搜尋附近美食失敗:", error);
      alert("搜尋失敗，請確認 API 金鑰權限或稍後再試。");
    } finally {
      setIsLoading(false);
    }
  };

  const manuallySearch = () => {
    if (isLoading) return; // 防連點：如果正在搜尋中，直接阻擋
    if (baseLatLng) {
      handleSearchNearbyAction(baseLatLng, searchRadius);
      setActiveTab("轉盤");
    } else {
      alert("請先設定有效的座標位置！");
    }
  };

  // ====== 移除不想要的餐廳 ======
  const handleRemoveFood = (foodIndex: number) => {
    const updated = foods.filter((_, idx) => idx !== foodIndex);
    setFoods(updated);
  };

  // ====== 將地址轉成經緯度 ======
  const handleAddressToLatLng = async () => {
    if (!baseAddress.trim()) return;
    setIsLoading(true);
    setLoadingText("正在解析地址...");
    try {
      const latLng = await getLatLngFromAddress(baseAddress);
      if (latLng) {
        setBaseLatLng(latLng);
        alert("地址定位成功！請按下「開始搜尋附近美食」");
      } else {
        alert("找不到此地址，請確認後重試。");
      }
    } finally {
      setIsLoading(false);
    }
  };

  async function getLatLngFromAddress(
    address: string
  ): Promise<{ lat: number; lng: number } | null> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
        {
          headers: { "User-Agent": "EatWhatSpinner/1.0" },
        }
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  return (
    <div className={styles.container} style={{ paddingTop: "70px" }}>
      {/* 傳統 Loading 遮罩改用帶有狀態文字的提示 */}
      <LoadingOverlay isLoading={isLoading} />
      {/* 隱藏 SEO 專用標題 */}
      <div
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          opacity: 0,
        }}
      >
        <h1>吃甚麼</h1>
        <p>基於當前位置自動推薦附近美食並讓您隨機挑選！</p>
      </div>

      {/* 頂部操作列：設定、轉盤(標題)、清單 */}
      <div className={styles.modeSelector}>
        <button
          className={`${styles.modeTab} ${activeTab === "設定" ? styles.modeTabActive : ""}`}
          onClick={() => setActiveTab("設定")}
        >
          設定
        </button>
        <button
          className={`${styles.modeTab} ${activeTab === "轉盤" ? styles.modeTabActive : ""}`}
          onClick={() => setActiveTab("轉盤")}
        >
          轉盤
        </button>
        <button
          className={`${styles.modeTab} ${activeTab === "候選" ? styles.modeTabActive : ""}`}
          onClick={() => setActiveTab("候選")}
          disabled={foods.length === 0}
        >
          候選 ({foods.length})
        </button>
      </div>

      {/* 畫面中央霸主 */}
      <div className={styles.mainStage}>
        {activeTab === "設定" && (
          <div className={`${styles.glassPanel} text-start`}>
            <h4 className="fw-bold mb-4 text-center">搜尋設定</h4>
            <div className="mb-4">
              <label className="form-label fw-bold">1. 設定基準位置</label>
              <div className="input-group mb-2">
                <input
                  type="text"
                  className="form-control"
                  placeholder="例如: 台北車站"
                  value={baseAddress}
                  onChange={(e) => setBaseAddress(e.target.value)}
                />
                <button
                  className="btn btn-outline-secondary"
                  onClick={handleAddressToLatLng}
                  disabled={isLoading}
                >
                  抓取經緯度
                </button>
              </div>
              <button
                className="btn btn-sm btn-outline-warning w-100"
                onClick={handleInitialLocation}
              >
                重新自動取得當前位置
              </button>
            </div>

            <div className="mb-4">
              <label className="form-label fw-bold">2. 搜尋半徑範圍</label>
              <select
                className="form-select"
                value={searchRadius}
                disabled={isLoading}
                onChange={(e) => {
                  const newRadius = Number(e.target.value);
                  setSearchRadius(newRadius);
                }}
              >
                <option value={300}>近在一歨 (300m)</option>
                <option value={500}>走路會到 (500m)</option>
                <option value={1000}>騎車一下 (1km)</option>
                <option value={2000}>開車去吃 (2km)</option>
              </select>
            </div>

            <div className="mt-4 border-top pt-3 d-flex justify-content-end">
              <button
                className={`${styles.actionBtn} ${styles.primaryBtn} w-100 justify-content-center`}
                onClick={manuallySearch}
                disabled={!baseLatLng || isLoading}
              >
                {isLoading ? "🔍 搜尋中..." : "開始搜尋附近美食"}
              </button>
            </div>
          </div>
        )}

        {activeTab === "轉盤" &&
          (foods.length === 0 ? (
            <div className={`${styles.glassPanel} ${styles.emptyState}`}>
              <h4 className="fw-bold mb-3">還沒有任何候選清單</h4>
              <p>請允許定位，或手動設定一個基準點讓系統幫您找找附近好吃的。</p>
              <div className="d-flex justify-content-center">
                <button
                  className={`mt-3 ${styles.actionBtn} ${styles.primaryBtn}`}
                  onClick={() => setActiveTab("設定")}
                >
                  手動設定位置
                </button>
              </div>
            </div>
          ) : (
            <SpinnerCanvas foods={foods} />
          ))}

        {activeTab === "候選" && (
          <div className={`${styles.glassPanel} text-start`}>
            <h4 className="fw-bold mb-4 text-center">
              附近的美味佳餚 ({foods.length} 間)
            </h4>
            {foods.length === 0 ? (
              <p className="text-center text-muted my-5">
                清單空空如也，趕緊去搜尋吧！
              </p>
            ) : (
              <div>
                <p className="text-muted small mb-3 text-center">
                  不滿意嗎？點開打叉按鈕可以剔除不想吃的地雷喔！
                </p>
                {foods.map((food, idx) => (
                  <div key={idx} className={styles.restaurantCard}>
                    <div className={styles.restaurantInfo}>
                      <div className={styles.restaurantName}>{food.name}</div>
                      <div className={styles.restaurantAddress}>
                        {food.address}
                      </div>
                      <div className={styles.badges}>
                        {food.rating && (
                          <span className={styles.badgeStar}>
                            ★ {food.rating} ({food.userRatingsTotal})
                          </span>
                        )}
                        {food.distance !== undefined && (
                          <span className={styles.badgeDist}>
                            ~ {food.distance} km
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className={styles.removeBtn}
                      onClick={() => handleRemoveFood(idx)}
                      aria-label="移除此餐廳"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EatWhatPage;
