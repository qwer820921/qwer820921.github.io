"use client";
import React, { useState, useEffect } from "react";
import { Food } from "../types";
import { Modal, Button } from "react-bootstrap";

interface CardFlipProps {
  foods: Food[];
}

const CardFlip: React.FC<CardFlipProps> = ({ foods }) => {
  const [shuffledFoods, setShuffledFoods] = useState<Food[]>([]);
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [result, setResult] = useState<Food | null>(null);
  const [showModal, setShowModal] = useState(false);

  // 打亂卡牌組的函數（Fisher-Yates 洗牌算法）
  const shuffleCards = (array: Food[]) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // 初始化或重新打亂卡牌
  const initializeDraw = () => {
    const shuffled = shuffleCards(foods);
    setShuffledFoods(shuffled);
    setSelectedCard(null);
    setResult(null);
    setIsFlipping(false);
    setShowModal(false); // 關閉 Modal
  };

  // 點擊卡牌時觸發
  const handleCardClick = (index: number) => {
    if (isFlipping || selectedCard !== null) return;
    setIsFlipping(true);
    setSelectedCard(index);
    setResult(shuffledFoods[index]); // 直接設置選中的卡牌為結果
    setShowModal(true); // 顯示 Modal

    // 模擬翻轉動畫
    setTimeout(() => {
      setIsFlipping(false);
    }, 1000); // 翻轉動畫持續 1 秒
  };

  // 當 foods 變化或初次載入時觸發打亂
  useEffect(() => {
    initializeDraw();
  }, [foods]);

  return (
    <div className="container d-flex flex-column align-items-center justify-content-center bg-light p-4">
      <style jsx>{`
        .card-flipped {
          transform: rotateY(180deg);
        }
        .card {
          transform-style: preserve-3d;
        }
        .card-body {
          transition: transform 1s;
        }
      `}</style>
      <h1 className="text-center mb-4">卡牌翻轉抽獎</h1>
      <div className="row row-cols-2 row-cols-sm-3 row-cols-md-2 row-cols-lg-3 row-cols-xl-4 row-cols-xxl-5 m-0 mb-5">
        {shuffledFoods.map((food, index) => (
          <div key={food.id} className="col p-0">
            <div
              className={`card h-100 shadow-sm position-relative ${selectedCard === index ? "card-flipped" : ""}`}
              style={{
                perspective: "1000px",
                cursor:
                  isFlipping || selectedCard !== null ? "default" : "pointer",
                transition: "transform 1s",
                zIndex: selectedCard === index ? 100 : 1, // 確保翻轉卡牌在最上層
              }}
              onClick={() => handleCardClick(index)}
            >
              {/* 卡牌正面 */}
              <div
                className="card-body text-center bg-primary text-white d-flex align-items-center justify-content-center position-absolute w-100 h-100"
                style={{ backfaceVisibility: "hidden" }}
              >
                <span className="fs-5">翻我！</span>
              </div>
              {/* 卡牌背面 */}
              <div
                className="card-body d-flex flex-column align-items-center justify-content-center"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                  backgroundColor: "white", // 明確設置白色背景
                  border: "2px solid #6c757d", // 添加外邊框
                  padding: "2px", // 增加內邊距
                  // overflow: "auto", // 內容過多時顯示滾動條
                  boxSizing: "border-box", // 確保邊框和內邊距不影響尺寸
                }}
              >
                <p
                  className="m-2"
                  style={{
                    whiteSpace: "nowrap", // 防止文字換行
                    maxWidth: "100%", // 確保不超出容器
                    display: "inline-block", // 讓寬度由內容決定
                  }}
                >
                  {food.name}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* react-bootstrap Modal 作為結果彈出視窗 */}
      <Modal
        show={showModal}
        onHide={() => setShowModal(false)}
        centered
        aria-labelledby="resultModalLabel"
      >
        <Modal.Header closeButton>
          <Modal.Title id="resultModalLabel" className="text-success">
            抽獎結果
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
          {result && (
            <>
              <p className="fs-5">恭喜你抽到：{result.name}</p>
              {result.address && (
                <p className="text-muted small">地址：{result.address}</p>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="primary"
            onClick={() => {
              setShowModal(false); // 關閉 Modal
              initializeDraw(); // 重新打亂卡牌
            }}
          >
            再抽一次
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default CardFlip;
