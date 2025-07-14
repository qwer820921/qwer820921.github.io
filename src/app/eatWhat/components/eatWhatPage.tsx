"use client";
import React, { useEffect, useState } from "react";
import SpinnerCanvas from "./spinnerCanvas";
import { Coordinates, Food } from "../types";
import { addFoodData, deleteFoodData, getFoodData } from "../api/foodApi";
// import { printValue } from "../../utils/createElement";
import SlotMachine from "./slotMachine";
import CardFlip from "./cardFlip";
import LoadingOverlay from "@/components/common/loadingOverlay";

// ====== Tab 標題對應表 ======
const groupLabels = ["組合1", "組合2", "組合3", "組合4"];
const modeLabels = ["轉盤", "抽獎機", "卡牌翻轉"];

const EatWhatPage: React.FC = () => {
  // ====== 狀態管理 ======
  const [foods, setFoods] = useState<Food[]>([]); // 當前組別的資料
  const [activeGroupIndex, setActiveGroupIndex] = useState<number>(0); // 現在選中的分組 index
  const [newFoodName, setNewFoodName] = useState<string>(""); // 新增食物名稱
  const [newFoodAddress, setNewFoodAddress] = useState<string>(""); // 新增食物地址
  const [baseAddress, setBaseAddress] = useState<string>("亞太大樓"); // 預設基準點
  const [baseLatLng, setBaseLatLng] = useState<Coordinates | null>({
    lat: 24.1397996,
    lng: 120.6486454,
  }); // 基準點的經緯度
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<string>("轉盤");

  // 初始化當前組別資料
  useEffect(() => {
    const loadFoods = async () => {
      setIsLoading(true); // 開始載入

      try {
        const data = await getFoodData(activeGroupIndex); // 根據組別載入資料

        if (baseLatLng) {
          const updatedData = await updateCurrentTabFoodDistances(
            data,
            baseLatLng
          );
          setFoods(updatedData);
        } else {
          setFoods(data);
        }
      } catch (error) {
        console.error("Error loading food data:", error);
      } finally {
        setIsLoading(false); // 無論成功或失敗都要關閉載入狀態
      }
    };

    loadFoods();
  }, [activeGroupIndex, baseLatLng]);

  // ====== 新增食物到目前分組 ======
  const handleAddFood = async () => {
    const trimmedName = newFoodName.trim();
    const trimmedAddress = newFoodAddress.trim();
    if (!trimmedName) return;

    // 檢查名稱是否重複
    if (foods.some((f) => f.name === trimmedName)) {
      // 名稱重複時彈出提示
      alert("此名稱已經存在，請使用不同的名稱！");
      return; // 中止操作
    }

    setIsLoading(true);

    try {
      // 預設座標為 undefined
      let coordinates = undefined;

      // 如果有地址，則查詢座標
      if (trimmedAddress) {
        const latLng = await getCoordinatesFromAddress(trimmedAddress);
        if (latLng) {
          coordinates = latLng;
        }
      }

      const newFood = {
        name: trimmedName,
        address: trimmedAddress || undefined,
        coordinates: coordinates, // 使用查詢到的座標或保持 undefined
        group: `${activeGroupIndex}`,
      };

      // 呼叫新增 API，並傳入新食物資料
      await addFoodData(newFood, activeGroupIndex);

      //因為目前post API沒有回傳資料，所以這裡先模擬一個延遲, 再查詢資料的流程
      setTimeout(async () => {
        const updatedFoods = await getFoodData(activeGroupIndex); // 重新查詢當前分組資料

        // 更新狀態，將新的食物資料加入當前分組
        if (updatedFoods) {
          if (baseLatLng) {
            const foodsWithDistance = await updateCurrentTabFoodDistances(
              updatedFoods,
              baseLatLng
            );
            setFoods(foodsWithDistance);
          } else {
            setFoods(updatedFoods);
          }
        }
      }, 100); // 模擬載入時間

      // 清空輸入框
      setNewFoodName("");
      setNewFoodAddress("");
    } catch (error) {
      console.error("Error adding food:", error);
      // alert("新增食物資料失敗，請稍後再試！");
    } finally {
      setIsLoading(false); // 無論成功或失敗都要關閉 loading 狀態
    }
  };

  // ====== 刪除當前分組的食物 ======
  const handleDeleteFood = async (foodId: number) => {
    const confirmDelete = window.confirm("確定要刪除這筆資料嗎？");
    if (!confirmDelete) return;

    setIsLoading(true);

    try {
      // 呼叫刪除 API，傳入 foodId 與分組編號
      await deleteFoodData(foodId, activeGroupIndex);

      //因為目前post API沒有回傳資料，所以這裡先模擬一個延遲, 再查詢資料的流程
      setTimeout(async () => {
        const updatedFoods = await getFoodData(activeGroupIndex); // 重新查詢當前分組資料

        // 更新狀態，將新的食物資料加入當前分組
        if (updatedFoods) {
          setFoods(updatedFoods);
        }
      }, 100); // 模擬載入時間
    } catch (error) {
      console.error("Error deleting food:", error);
      alert("刪除失敗，請稍後再試！");
    } finally {
      setIsLoading(false); // 無論成功或失敗都要關閉 loading 狀態
    }
  };

  // ====== 切換分組 ======
  const handleGroupChange = (index: number) => {
    if (index >= foods.length) {
      // 如果分組不存在，則初始化為空陣列
      setFoods([]);
    }
    setActiveGroupIndex(index);
  };

  // 取得當前位置
  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          // 更新 baseAddress 與 baseLatLng
          setBaseAddress("當前位置");
          setBaseLatLng({ lat: latitude, lng: longitude });
        },
        (error) => {
          alert(`取得位置失敗，請檢查瀏覽器權限設定。" ${error}`);
        }
      );
    } else {
      console.error("此瀏覽器不支援定位功能");
    }
  };

  // 重新查詢指定地址的經緯度
  const getCoordinatesFromAddress = async (
    address: string
  ): Promise<{ lat: number; lng: number } | null> => {
    if (!address.trim()) return null;

    setIsLoading(true);
    const latLng = await getLatLngFromAddress(address);
    setTimeout(() => {
      setIsLoading(false);
    }, 100); // 模擬載入時間

    return latLng || null;
  };

  // 呼叫 Nominatim API 把地址轉成經緯度
  // 輸入地址，回傳經緯度物件或 null
  async function getLatLngFromAddress(
    address: string
  ): Promise<{ lat: number; lng: number } | null> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
        {
          headers: {
            "User-Agent": "EatWhatSpinner/1.0 (your.email@example.com)",
          },
        }
      );
      if (!response.ok) return null;
      const data = await response.json();
      if (data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        };
      }
      return null;
    } catch (error) {
      console.error("地址轉換失敗:", error);
      return null;
    }
  }

  // Haversine公式計算兩點間距離（單位：公里）
  // 輸入兩點的經緯度，回傳距離（公里）
  function calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // 地球半徑 (km)
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

  // 計算食物與基準點的距離
  const calculateFoodDistance = (
    coordinates: { lat: number; lng: number },
    baseLatLng: { lat: number; lng: number }
  ): number | undefined => {
    if (!coordinates) return undefined;

    const distance = calculateDistance(
      baseLatLng.lat,
      baseLatLng.lng,
      coordinates.lat,
      coordinates.lng
    );
    return Math.round(distance * 10) / 10; // 四捨五入到小數點一位
  };

  // 更新當前分組食物的距離
  const updateCurrentTabFoodDistances = async (
    foods: Food[],
    baseLatLng: Coordinates
  ) => {
    if (!baseLatLng) return foods; // 如果沒有 baseLatLng，直接返回原始 foods

    // 計算食物距離並生成新的食物分組資料
    const updatedFoods: Food[] = (foods ?? []).map((food) => {
      if (food.coordinates) {
        // 只有在有座標的情況下才計算距離
        const distance = calculateFoodDistance(food.coordinates, baseLatLng);
        return { ...food, distance };
      }
      // 若沒有座標則不計算距離
      return { ...food, distance: undefined };
    });

    return updatedFoods; // 返回適合 setFoods 的資料
  };

  // baseLatLng 改變時，會更新當前分組食物的距離
  useEffect(() => {
    const updateDistances = async () => {
      if (baseLatLng) {
        const updated = await updateCurrentTabFoodDistances(foods, baseLatLng);
        setFoods(updated);
      }
    };

    updateDistances();
  }, [baseLatLng]);

  // ====== 畫面渲染 ======
  return (
    <div className="container-fluid p-0">
      <>
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
          <p>不用煩惱吃甚麼...</p>
        </div>
      </>
      <div className="row">
        {/* Loading Spinner Overlay */}
        <LoadingOverlay isLoading={isLoading} />
        {/* 左邊：轉盤區域 */}
        <div className="col-md-6 col-sm-12 d-flex flex-column align-items-center my-3">
          <div className="row">
            <div className="col-12">
              {/* ====== 新增：切換分組 Tab 區塊 ====== */}
              <div className="btn-group mb-3">
                {modeLabels.map((label, index) => (
                  <button
                    key={index}
                    className={`btn btn-outline-primary ${mode === label ? "active" : ""}`}
                    onClick={() => setMode(label)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {mode === "轉盤" && <SpinnerCanvas foods={foods} />}
          {mode === "抽獎機" && <SlotMachine foods={foods} />}
          {mode === "卡牌翻轉" && <CardFlip foods={foods} />}
        </div>

        {/* 右邊：編輯食物清單 */}
        <div className="col-md-6 col-sm-12 d-flex flex-column align-items-center my-3 px-5">
          {/* ====== 新增：切換分組 Tab 區塊 ====== */}
          <div className="btn-group mb-3">
            {groupLabels.map((label, index) => (
              <button
                key={index}
                className={`btn btn-outline-primary ${activeGroupIndex === index ? "active" : ""}`}
                onClick={() => handleGroupChange(index)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 上方：基準點設定 */}
          <div className="input-group mb-2">
            <input
              type="text"
              value={baseAddress}
              onChange={(e) => setBaseAddress(e.target.value)}
              placeholder="請輸入基準地址"
              className="form-control"
            />
            <button
              className="btn btn-primary"
              onClick={async () => {
                const latLng = await getCoordinatesFromAddress(baseAddress);
                if (latLng) {
                  setBaseLatLng(latLng);
                }
              }}
              disabled={isLoading || !baseAddress}
            >
              {isLoading ? "查詢中..." : "更新基準點"}
            </button>
            <button
              onClick={handleGetCurrentLocation}
              className="btn btn-warning"
            >
              取得當前位置
            </button>
          </div>

          <h4 className="mb-3">食物選項 - {groupLabels[activeGroupIndex]}</h4>

          {/* 新增食物表單 */}
          <div className="input-group mb-2">
            <input
              type="text"
              value={newFoodName}
              onChange={(e) => setNewFoodName(e.target.value)}
              placeholder="食物名稱"
              className="form-control"
            />
          </div>

          <div className="input-group mb-2">
            <input
              type="text"
              value={newFoodAddress}
              onChange={(e) => setNewFoodAddress(e.target.value)}
              placeholder="地址"
              className="form-control"
            />
          </div>

          <button
            className="btn btn-success mb-3"
            onClick={handleAddFood}
            disabled={isLoading || !newFoodName}
          >
            {isLoading ? "查詢中..." : "新增"}
          </button>

          {/* 食物清單 */}
          {foods.length === 0 ? (
            <p className="text-muted fst-italic">目前尚無食物，請新增。</p>
          ) : (
            <ul className="list-group text-start w-100">
              {(foods ?? []).map((food, index) => (
                <li
                  key={index}
                  className="list-group-item d-flex justify-content-between align-items-center"
                >
                  <div>
                    <div>{food.name}</div>
                    {food.address && (
                      <small className="text-muted">{food.address}</small>
                    )}
                    {food.distance !== undefined && (
                      <div className="text-primary">
                        距離：{food.distance} km
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => handleDeleteFood(food.id)}
                    disabled={isLoading}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {/* <div className="text-start">
        {printValue(foods)}
      </div> */}
    </div>
  );
};

export default EatWhatPage;
