import React, { useEffect, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { mockColor } from "../lib/mock";

const AnimatorPage: React.FC = () => {
  // 🎨 設定目前選擇的顏色
  const [selectedColor, setSelectedColor] = useState("#000000");

  // 📌 畫布陣列 (可以存多個 16x16 畫布)
  const [canvasList, setCanvasList] = useState<string[][]>([
    Array(16 * 16).fill("#FFFFFF"), // 預設一個空白畫布
  ]);

  // 📌 當前選中的畫布索引
  const [activeCanvasIndex, setActiveCanvasIndex] = useState(0);

  // 📌 存複製的畫布
  const [copiedCanvas, setCopiedCanvas] = useState<string[] | null>(null);

  // 🖌 處理點擊格子變更顏色
  const handlePixelClick = (index: number) => {
    const newCanvasList = [...canvasList];
    const newCanvas = [...newCanvasList[activeCanvasIndex]];
    newCanvas[index] = selectedColor;
    newCanvasList[activeCanvasIndex] = newCanvas;
    setCanvasList(newCanvasList);
  };

  // 🎨 新增畫布
  const addNewCanvas = () => {
    setCanvasList([...canvasList, Array(16 * 16).fill("#FFFFFF")]);
    setActiveCanvasIndex(canvasList.length); // 切換到新畫布
  };

  // ❌ 刪除當前畫布
  const deleteCanvas = () => {
    if (canvasList.length > 1) {
      const newCanvasList = canvasList.filter(
        (_, i) => i !== activeCanvasIndex
      );
      setCanvasList(newCanvasList);
      setActiveCanvasIndex(Math.max(0, activeCanvasIndex - 1)); // 切換到上一個畫布
    }
  };

  // 📋 複製當前畫布
  const copyCanvas = () => {
    setCopiedCanvas([...canvasList[activeCanvasIndex]]);
  };

  // 📌 貼上複製的畫布
  const pasteCanvas = () => {
    if (copiedCanvas) {
      const newCanvasList = [...canvasList];
      newCanvasList[activeCanvasIndex] = [...copiedCanvas];
      setCanvasList(newCanvasList);
    }
  };

  // 動畫 => 預覽當前要顯示的畫布index
  const [previewIndex, setPreviewIndex] = useState(0);

  // 初始化預覽的刷新
  useEffect(() => {
    const interval = setInterval(() => {
      setPreviewIndex((prev) => (prev + 1) % canvasList.length);
    }, 100);
    return () => clearInterval(interval);
  }, [canvasList.length]);

  //匯入的字串
  const [importText, setImportText] = useState<string>(mockColor);

  // 匯入字串的處理
  const importCanvas = () => {
    try {
      const parsedCanvas = JSON.parse(importText);
      if (Array.isArray(parsedCanvas) && parsedCanvas.length === 16 * 16) {
        setCanvasList([...canvasList, parsedCanvas]);
        setActiveCanvasIndex(canvasList.length);
        setImportText("");
      } else {
        alert("格式錯誤，請輸入 16x16 的 string[] 陣列");
      }
    } catch (error) {
      alert("無效的 JSON 格式");
    }
  };

  // 匯出當前畫布的 string[]
  const exportCanvas = () => {
    const currentCanvas = canvasList[activeCanvasIndex];
    const canvasString = JSON.stringify(currentCanvas);
    setImportText(canvasString); // 顯示在textarea
  };

  return (
    <div className="container-fluid p-3">
      {/* 上方匯入區域 */}
      <div className="mb-3">
        <Form.Control
          as="textarea"
          rows={3}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="請輸入 16x16 的 JSON 格式 string[]"
        />
        <div className="d-flex gap-2 mt-2">
          <Button className="mt-2" variant="info" onClick={importCanvas}>
            匯入
          </Button>
          <Button className="mt-2" variant="secondary" onClick={exportCanvas}>
            匯出
          </Button>
        </div>
      </div>
      {/* 按鈕區域 */}
      <div className="d-flex justify-content-center align-items-center gap-2 mb-3">
        <Button
          variant="secondary"
          onClick={() =>
            setCanvasList(canvasList.map(() => Array(16 * 16).fill("#FFFFFF")))
          }
        >
          重置
        </Button>
        <Button variant="primary" onClick={addNewCanvas}>
          新增
        </Button>
        <Button
          variant="danger"
          onClick={deleteCanvas}
          disabled={canvasList.length <= 1}
        >
          刪除
        </Button>
        <Button variant="warning" onClick={copyCanvas}>
          複製
        </Button>
        <Button
          variant="success"
          onClick={pasteCanvas}
          disabled={!copiedCanvas}
        >
          貼上
        </Button>
      </div>

      {/* 主要工作區域 */}
      <div className="row d-flex">
        {/* 左側 - 顏色選擇 */}
        <div className="col-md-2 col-sm-12 d-flex flex-column align-items-center">
          <h5>顏色選擇</h5>
          <div className="d-flex flex-wrap gap-1">
            {[
              "#C0C0C0",
              "#D2B48C",
              "#8B4513",
              "#FF0000",
              "#FFA500",
              "#FFFF00",
              "#00FF00",
              "#00FFFF",
              "#0000FF",
              "#800080",
              "#000000",
              "#FFFFFF",
            ].map((color) => (
              <div
                key={color}
                className={`border border-light ${selectedColor === color ? "border-1" : "border-5"}`}
                style={{
                  width: "30px",
                  height: "30px",
                  backgroundColor: color,
                  cursor: "pointer",
                }}
                onClick={() => setSelectedColor(color)}
              ></div>
            ))}
          </div>
        </div>

        {/* 中間 - 畫布區域 */}
        <div className="col-md-7 col-sm-12 d-flex justify-content-center">
          <div
            className="border border-dark p-2"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(16, 20px)", // 每行 16 個元素，寬度 20px
              gridTemplateRows: "repeat(16, 20px)", // 每列 16 個元素，高度 20px
              gap: "2px", // 可以調整格子之間的間隙
            }}
          >
            {canvasList[activeCanvasIndex].map((color, index) => (
              <div
                key={index}
                onClick={() => handlePixelClick(index)}
                style={{
                  backgroundColor: color,
                  border: "1px solid #ddd",
                  cursor: "pointer",
                }}
              ></div>
            ))}
          </div>
        </div>

        {/* 右側 - 預覽區域 */}
        <div className="col-md-3 col-sm-12 d-flex flex-column align-items-center">
          <h5>預覽</h5>
          <div
            className="border border-dark"
            style={{
              width: "120px",
              height: "120px",
              display: "grid",
              gridTemplateColumns: "repeat(16, 1fr)",
              gridTemplateRows: "repeat(16, 1fr)",
              gap: "1px",
              backgroundColor: "#ffffff",
            }}
          >
            {canvasList[previewIndex].map((color, index) => (
              <div key={index} style={{ backgroundColor: color }}></div>
            ))}
          </div>
        </div>
      </div>

      {/* 下方 - 畫布序列 (選擇不同畫布) */}
      <div className="row mt-3">
        <div className="col-12 d-flex justify-content-center gap-2">
          {canvasList.map((canvas, index) => (
            <>
              <div
                key={index}
                onClick={() => setActiveCanvasIndex(index)}
                className={`border ${activeCanvasIndex === index ? "border-primary border-3" : "border-dark"}`}
                style={{
                  padding: "2px",
                  width: "85px",
                  height: "85px",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                  display: "grid",
                  gridTemplateColumns: "repeat(16, 1fr)", // 每行 16 個元素，寬度自動平均分配
                  gridTemplateRows: "repeat(16, 1fr)", // 每列 16 個元素，高度自動平均分配
                  gap: "1px", // 可以調整格子之間的間隙
                }}
              >
                {canvas.map((color, index) => (
                  <div
                    key={index}
                    style={{
                      backgroundColor: color,
                    }}
                  ></div>
                ))}
              </div>
            </>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AnimatorPage;
