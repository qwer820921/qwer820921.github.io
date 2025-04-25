/* eslint-disable prettier/prettier */
import React, { useState } from "react";
import EatWhatSpinnerCanvas from "./components/eatWhatSpinnerCanvas";
import { Food } from "./types";

// Mock 資料：食物名稱陣列
const mockFoods: Food[] = [
  { name: "三鍋臭媽媽", address: "台北市中山區長安東路1段23號" },
  { name: "鐵哥", address: "台北市信義區虎林街88號" },
  { name: "麥當當", address: "台北市大安區復興南路1段12號" },
  { name: "香園", address: "新北市板橋區文化路2段11號" },
  { name: "十八燒", address: "台中市西區忠明南路50號" },
  { name: "麥味登", address: "新竹市光復路一段58號" },
  { name: "八方", address: "桃園市中壢區中原路32號" },
  { name: "what 泰", address: "高雄市左營區自由三路99號" },
];

const EatWhatSpinner: React.FC = () => {
  // 使用 useState 儲存食物陣列
  const [foods, setFoods] = useState<Food[]>(mockFoods);
  // 使用 useState 儲存轉盤選擇的結果
  const [selectedFood, setSelectedFood] = useState<string | null>(null);
  const [newFoodName, setNewFoodName] = useState<string>("");
  const [newFoodAddress, setNewFoodAddress] = useState<string>("");

  const handleAddFood = () => {
    const trimmedName = newFoodName.trim();
    const trimmedAddress = newFoodAddress.trim();
    if (trimmedName && !foods.some((f) => f.name === trimmedName)) {
      setFoods([
        ...foods,
        { name: trimmedName, address: trimmedAddress || undefined },
      ]);
      setNewFoodName("");
      setNewFoodAddress("");
    }
  };

  const handleDeleteFood = (foodToRemove: Food) => {
    setFoods(foods.filter((f) => f.name !== foodToRemove.name));
    if (selectedFood === foodToRemove.name) setSelectedFood(null);
  };

  return (
    <div className="container-fluid p-3">
      <div className="row">
        {/* 左邊：轉盤區域 */}
        <div className="col-md-6 col-sm-12 d-flex flex-column align-items-center my-3">
          <EatWhatSpinnerCanvas foods={foods} />
        </div>

        {/* 右邊：編輯食物清單 */}
        <div className="col-md-6 col-sm-12 d-flex flex-column align-items-center my-3">
          <h4 className="mb-3">食物選項</h4>
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

          <button className="btn btn-success mb-3" onClick={handleAddFood}>
            新增
          </button>

          {foods.length === 0 ? (
            <p className="text-muted fst-italic">目前尚無食物，請新增。</p>
          ) : (
            <ul className="list-group w-100">
              {foods.map((food, index) => (
                <li
                  key={index}
                  className={`list-group-item d-flex justify-content-between align-items-center ${
                    selectedFood === food.name
                      ? "list-group-item-warning fw-bold"
                      : ""
                  }`}
                >
                  <div>
                    <div>{food.name}</div>
                    {food.address && (
                      <small className="text-muted">{food.address}</small>
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
    </div>
  );
};

export default EatWhatSpinner;
