/* eslint-disable prettier/prettier */
import React, { useState } from "react";
import EatWhatSpinnerCanvas from "./components/eatWhatSpinnerCanvas";

// Mock 資料：食物名稱陣列
const mockFoods: string[] = [
  "三鍋臭媽媽",
  "鐵哥",
  "麥當當",
  "香園",
  "十八燒",
  "麥味登",
  "八方",
  "what 泰",
];

const EatWhatSpinner: React.FC = () => {
  // 使用 useState 儲存食物陣列
  const [foods, setFoods] = useState<string[]>(mockFoods);
  // 使用 useState 儲存轉盤選擇的結果
  const [selectedFood, setSelectedFood] = useState<string | null>(null);
  const [newFood, setNewFood] = useState<string>("");

  const handleAddFood = () => {
    const trimmed = newFood.trim();
    if (trimmed && !foods.includes(trimmed)) {
      setFoods([...foods, trimmed]);
      setNewFood("");
    }
  };

  const handleDeleteFood = (foodToRemove: string) => {
    setFoods(foods.filter((f) => f !== foodToRemove));
    if (selectedFood === foodToRemove) setSelectedFood(null);
  };

  return (
    <div className="container-fluid p-3">
      <div className="row">
        {/* 左邊：轉盤區域 */}
        <div className="col-md-6 col-sm-12 d-flex flex-column align-items-center my-3">
          <EatWhatSpinnerCanvas foods={foods ?? []} />
        </div>

        {/* 右邊：編輯食物清單 */}
        <div className="col-md-6 col-sm-12 d-flex flex-column align-items-center my-3">
          <h4 className="mb-3">食物選項</h4>
          <div className="input-group mb-3">
            <input
              type="text"
              value={newFood}
              onChange={(e) => setNewFood(e.target.value)}
              placeholder="輸入食物名稱"
              className="form-control"
              style={{ width: "200px" }}
            />
            <button className="btn btn-success" onClick={handleAddFood}>
              新增
            </button>
          </div>

          {foods.length === 0 ? (
            <p className="text-muted fst-italic">目前尚無食物，請新增。</p>
          ) : (
            <ul className="list-group">
              {foods.map((food, index) => (
                <li
                  key={index}
                  className={`list-group-item d-flex justify-content-between align-items-center ${
                    selectedFood === food
                      ? "list-group-item-warning fw-bold"
                      : ""
                  }`}
                >
                  {food}
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
