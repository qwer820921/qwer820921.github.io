/* eslint-disable prettier/prettier */
import React, { useEffect, useState } from "react";
import EatWhatSpinnerCanvas from "./components/eatWhatSpinnerCanvas";
import { Food } from "./types";
import { printValue } from "../../utils/createElement";

// ====== Mock 食物資料（分成 3 組）======
const mockFoodsGroup: Food[][] = [
  [
    {
      id: 1,
      name: "三鍋臭媽媽",
      address: "408台中市南屯區南屯路二段83號",
      coordinates: { lat: 24.1362563, lng: 120.6524266 },
      distance: undefined,
    },
    {
      id: 2,
      name: "料鐵哥",
      address: "408台中市南屯區五權西路二段191號",
      coordinates: { lat: 24.1398153, lng: 120.6491736 },
      distance: undefined,
    },
    {
      id: 3,
      name: "麥當當",
      address: "1樓, No. 250號五權西路二段南屯區台中市408",
      coordinates: { lat: 24.1402758, lng: 120.6479278 },
      distance: undefined,
    },
    {
      id: 4,
      name: "麥味登",
      address: "408台中市南屯區大墩路80號",
      coordinates: { lat: 24.138988, lng: 120.6452261 },
      distance: undefined,
    },
    {
      id: 5,
      name: "富鼎旺豬腳-東興店",
      address: "408台中市南屯區東興路二段120號",
      coordinates: { lat: 24.1382804, lng: 120.6506522 },
      distance: undefined,
    },
    {
      id: 6,
      name: "八方雲集 台中東興店",
      address: "408台中市南屯區東興路二段114號",
      coordinates: { lat: 24.1394994, lng: 120.6511771 },
      distance: undefined,
    },
    {
      id: 7,
      name: "What泰 泰式咖喱所",
      address: "408台中市南屯區東興路二段78號",
      coordinates: { lat: 24.1381911, lng: 120.6496393 },
      distance: undefined,
    },
    {
      id: 8,
      name: "清水排骨麵",
      address: "408台中市南屯區東興路二段148號",
      coordinates: { lat: 24.1398814, lng: 120.6523474 },
      distance: undefined,
    },
    {
      id: 9,
      name: "龍品魚丸店-東興店",
      address: "408台中市南屯區東興路二段142號",
      coordinates: { lat: 24.1398814, lng: 120.6523474 },
      distance: undefined,
    },
    {
      id: 10,
      name: "阿爸的魯肉飯",
      address: "408台中市南屯區東興路二段30號",
      coordinates: { lat: 24.1364714, lng: 120.6523319 },
      distance: undefined,
    },
    {
      id: 11,
      name: "十八燒",
      address: "408台中市南屯區大墩路175號1樓",
      coordinates: { lat: 24.1404967, lng: 120.6490212 },
      distance: undefined,
    },
  ],
  [
    {
      id: 12,
      name: "我是測試嘿嘿",
      address: "還是測試嘿嘿",
      coordinates: { lat: 0, lng: 0 },
      distance: undefined,
    },
  ],
  [
    {
      id: 13,
      name: "我是測試嘿嘿",
      address: "還是測試嘿嘿",
      coordinates: { lat: 0, lng: 0 },
      distance: undefined,
    },
  ],
];

// ====== Tab 標題對應表 ======
const tabLabels = ["組合1", "組合2", "組合3", "組合4"];

const EatWhatSpinner: React.FC = () => {
  // ====== 狀態管理 ======
  const [foodsGroup, setFoodsGroup] = useState<Food[][]>(mockFoodsGroup); // 所有分組的資料
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0); // 現在選中的分組 index

  const [selectedFood, setSelectedFood] = useState<string | null>(null); // 轉盤選中的食物

  const [newFoodName, setNewFoodName] = useState<string>(""); // 新增食物名稱
  const [newFoodAddress, setNewFoodAddress] = useState<string>(""); // 新增食物地址

  const [baseAddress, setBaseAddress] = useState<string>("亞太大樓"); // 預設基準點
  const [baseLatLng, setBaseLatLng] = useState<{
    lat: number;
    lng: number;
  } | null>({ lat: 24.1397938, lng: 120.6305752 }); // 基準點的經緯度
  const [isLoading, setIsLoading] = useState(false);

  // ====== 新增食物到目前分組 ======
  const handleAddFood = async () => {
    const trimmedName = newFoodName.trim();
    const trimmedAddress = newFoodAddress.trim();
    if (!trimmedName) return;

    // 檢查目前分組有沒有重複
    if (foodsGroup[activeTabIndex].some((f) => f.name === trimmedName)) {
      // 名稱重複時彈出提示
      alert("此名稱已經存在，請使用不同的名稱！");
      return; // 中止操作
    }

    // 找到所有食物資料中的最大 id，並加 1
    const allFoods = foodsGroup.flat(); // 扁平化所有分組的食物資料
    const maxId = allFoods.reduce((max, food) => Math.max(max, food.id), 0); // 找到最大的 id
    const newId = maxId + 1; // 新食物的 id

    const newFood: Food = {
      id: newId, // 使用計算得到的唯一 id
      name: trimmedName,
      address: trimmedAddress || undefined,
    };

    const updatedGroup = [...foodsGroup];
    updatedGroup[activeTabIndex] = [...updatedGroup[activeTabIndex], newFood];

    setFoodsGroup(updatedGroup);
    setNewFoodName("");
    setNewFoodAddress("");

    // 如果有地址，則查詢經緯度
    if (trimmedAddress) {
      try {
        const coordinates = await updateCoordinatesForAddress(trimmedAddress);

        // 如果查詢成功，則將座標寫入該食物
        if (coordinates) {
          // 更新食物座標,計算並更新該食物的距離
          updateFoodCoordinatesAndDistance(
            newFood.id,
            coordinates,
            updatedGroup
          );
        } else {
          // 如果查詢失敗，設置默認座標
          const defaultCoordinates = { lat: 0, lng: 0 }; // 默認座標
          updateFoodCoordinatesAndDistance(
            newFood.id,
            defaultCoordinates,
            updatedGroup
          );
        }
      } catch (error) {
        // API 查詢錯誤時，設置默認座標
        const defaultCoordinates = { lat: 0, lng: 0 }; // 默認座標
        updateFoodCoordinatesAndDistance(
          newFood.id,
          defaultCoordinates,
          updatedGroup
        );
      }
    }
  };

  // 更新食物座標並計算距離
  const updateFoodCoordinatesAndDistance = async (
    foodId: number,
    coordinates: { lat: number; lng: number },
    updatedGroup: Food[][]
  ) => {
    // 更新座標
    const updatedFoodsGroup = updatedGroup.map((group) =>
      group.map((food) =>
        food.id === foodId ? { ...food, coordinates } : food
      )
    );

    setFoodsGroup(updatedFoodsGroup); // 更新食物分組資料

    // 如果座標為 0, 0，設置距離為 "無效"
    if (coordinates.lat === 0 && coordinates.lng === 0) {
      const updatedFoodsWithInvalidDistance = updatedFoodsGroup.map((group) =>
        group.map((food) => {
          if (food.id === foodId) {
            return { ...food, distance: "無效" }; // 設置距離為 "無效"
          }
          return food; // 其他食物不做變更
        })
      );

      setFoodsGroup(updatedFoodsWithInvalidDistance); // 更新食物分組資料
      return;
    }

    // 計算並更新距離
    if (baseLatLng) {
      // 計算距離
      const distance = calculateFoodDistance(coordinates, baseLatLng);

      // 更新食物的距離
      const updatedFoodsWithDistance = updatedFoodsGroup.map((group) =>
        group.map((food) => {
          if (food.id === foodId) {
            return { ...food, distance: distance?.toString() }; // 更新對應食物的距離，轉換成 string
          }
          return food; // 其他食物不做變更
        })
      );

      setFoodsGroup(updatedFoodsWithDistance); // 更新食物分組資料
    }
  };

  // ====== 刪除當前分組的食物 ======
  const handleDeleteFood = (foodToRemove: Food) => {
    const updatedGroup = [...foodsGroup];
    updatedGroup[activeTabIndex] = updatedGroup[activeTabIndex].filter(
      (f) => f.name !== foodToRemove.name
    );

    setFoodsGroup(updatedGroup);
    if (selectedFood === foodToRemove.name) setSelectedFood(null);
  };

  // ====== 切換分組 ======
  const handleTabChange = (index: number) => {
    if (index >= foodsGroup.length) {
      // 如果分組不存在，則初始化為空陣列
      const newGroup = [...foodsGroup, []];
      setFoodsGroup(newGroup);
    }
    setActiveTabIndex(index);
    setSelectedFood(null); // 切換時清除選中的食物
  };

  // 重新查詢基準點的經緯度
  const handleUpdateBasePoint = async () => {
    if (!baseAddress.trim()) return;
    setIsLoading(true);
    const latLng = await getLatLngFromAddress(baseAddress);
    if (latLng) {
      setBaseLatLng(latLng);
    }
    setTimeout(() => {
      setIsLoading(false);
    }, 1000); // 模擬載入時間
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
  const updateCurrentTabFoodDistances = async () => {
    if (!baseLatLng) return;

    setIsLoading(true);

    // 計算當前分組食物的距離並更新
    const updatedFoods = foodsGroup[activeTabIndex].map((food) => {
      if (food.coordinates) {
        // 只有在有座標的情況下才計算距離
        const distance = calculateFoodDistance(food.coordinates, baseLatLng);
        return { ...food, distance };
      }
      // 若沒有座標則不計算距離
      return { ...food, distance: undefined };
    });

    // 複製 foodsGroup 並更新當前分組的食物資料
    const updatedGroup = [...foodsGroup];
    updatedGroup[activeTabIndex] = updatedFoods;

    // 更新食物分組資料
    setFoodsGroup(updatedGroup);

    setIsLoading(false);
  };

  // 更新指定地址的食物座標
  const updateCoordinatesForAddress = async (address: string) => {
    // 查詢指定地址的座標
    const coordinates = await getLatLngFromAddress(address);
    return coordinates; // 返回查詢到的座標
  };

  // baseLatLng 改變時，會更新當前分組食物的距離
  // activeTabIndex 改變時，會更新當前分組食物的距離
  useEffect(() => {
    if (baseLatLng) {
      updateCurrentTabFoodDistances(); // 更新當前分組的食物距離
    }
  }, [baseLatLng, activeTabIndex]);

  // ====== 畫面渲染 ======
  return (
    <div className="container-fluid p-0">
      <div className="row">
        {/* 左邊：轉盤區域 */}
        <div className="col-md-6 col-sm-12 d-flex flex-column align-items-center my-3">
          <EatWhatSpinnerCanvas foods={foodsGroup[activeTabIndex]} />
        </div>

        {/* 右邊：編輯食物清單 */}
        <div className="col-md-6 col-sm-12 d-flex flex-column align-items-center my-3 px-5">
          {/* ====== 新增：切換分組 Tab 區塊 ====== */}
          <div className="btn-group mb-3">
            {tabLabels.map((label, index) => (
              <button
                key={index}
                className={`btn btn-outline-primary ${activeTabIndex === index ? "active" : ""}`}
                onClick={() => handleTabChange(index)}
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
              onClick={handleUpdateBasePoint}
              disabled={isLoading || !baseAddress}
            >
              {isLoading ? "查詢中..." : "更新基準點"}
            </button>
          </div>

          <h4 className="mb-3">食物選項 - {tabLabels[activeTabIndex]}</h4>

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
            disabled={!newFoodName}
          >
            新增
          </button>

          {/* 食物清單 */}
          {foodsGroup[activeTabIndex].length === 0 ? (
            <p className="text-muted fst-italic">目前尚無食物，請新增。</p>
          ) : (
            <ul className="list-group text-start w-100">
              {(foodsGroup[activeTabIndex] ?? []).map((food, index) => (
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
                    onClick={() => handleDeleteFood(food)}
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
        {printValue(foodsGroup)}
      </div> */}
    </div>
  );
};

export default EatWhatSpinner;
