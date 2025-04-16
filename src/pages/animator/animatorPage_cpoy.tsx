import React, { useEffect, useState } from "react";
import { mockColor } from "../../lib/mock";
import ImageCropModal from "../../components/ImageCropModal";
import PreviewCanvas from "./previewCanvas";

const AnimatorPage: React.FC = () => {
  // 🎨 設定目前選擇的顏色，預設為黑色
  const [selectedColor, setSelectedColor] = useState("#000000");

  // 📏 設定最終的像素格數（畫布邊長）
  const [pixelSizeInput, setPixelSizeInput] = useState(16);

  // 📝 表單內的暫存像素格數，供用戶輸入時使用
  const [tempPixelSize, setTempPixelSize] = useState(16);

  // 🧮 計算畫布總格數（像素格數的平方）
  const canvasPixelCount = pixelSizeInput * pixelSizeInput;

  // 📐 計算每格像素的實際大小（以 400px 畫布為基準）
  const pixelSize = 400 / pixelSizeInput;

  // 📜 控制像素選擇下拉選單的開關狀態
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // 📌 畫布陣列，儲存多個畫布的像素顏色資料
  const [canvasList, setCanvasList] = useState<string[][]>([
    Array(canvasPixelCount).fill("#FFFFFF"), // 預設一個全白畫布
  ]);

  // 📌 當前選中的畫布索引，決定正在編輯哪個畫布
  const [activeCanvasIndex, setActiveCanvasIndex] = useState(0);

  // 📋 儲存複製的畫布資料，供貼上功能使用
  const [copiedCanvas, setCopiedCanvas] = useState<string[] | null>(null);

  // 🖌 處理點擊格子以變更顏色的事件
  const handlePixelClick = (index: number) => {
    const newCanvasList = [...canvasList]; // 複製畫布列表
    const newCanvas = [...newCanvasList[activeCanvasIndex]]; // 複製當前畫布
    newCanvas[index] = selectedColor; // 更新指定格子的顏色
    newCanvasList[activeCanvasIndex] = newCanvas; // 更新畫布列表
    setCanvasList(newCanvasList); // 儲存變更
  };

  // 🔄 重置畫布，清除所有畫布並新增一個空白畫布
  const resetCanvas = () => {
    setCanvasList([Array(canvasPixelCount).fill("#FFFFFF")]);
    setActiveCanvasIndex(0);
  };

  // ➕ 新增一個空白畫布並切換到它
  const addNewCanvas = () => {
    setCanvasList([...canvasList, Array(canvasPixelCount).fill("#FFFFFF")]);
    setActiveCanvasIndex(canvasList.length); // 切換到新畫布
  };

  // ❌ 刪除當前畫布（僅在有多於一個畫布時生效）
  const deleteCanvas = () => {
    if (canvasList.length > 1) {
      const newCanvasList = canvasList.filter(
        (_, i) => i !== activeCanvasIndex
      ); // 移除當前畫布
      setCanvasList(newCanvasList);
      setActiveCanvasIndex(Math.max(0, activeCanvasIndex - 1)); // 切換到上一個畫布
    }
  };

  // 📋 複製當前畫布的資料
  const copyCanvas = () => {
    setCopiedCanvas([...canvasList[activeCanvasIndex]]);
  };

  // 📌 貼上複製的畫布資料到當前畫布
  const pasteCanvas = () => {
    if (copiedCanvas) {
      const newCanvasList = [...canvasList];
      newCanvasList[activeCanvasIndex] = [...copiedCanvas];
      setCanvasList(newCanvasList);
    }
  };

  // // 🎞 動畫預覽的當前畫布索引
  // const [previewIndex, setPreviewIndex] = useState(0);

  // // 🔄 初始化動畫預覽，定時切換畫布
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     setPreviewIndex((prev) => (prev + 1) % canvasList.length); // 循環顯示畫布
  //   }, 500); // 每 500ms 切換一次
  //   return () => clearInterval(interval); // 清除計時器
  // }, [canvasList.length]);

  // 📥 儲存匯入的 JSON 字串，預設為 mockColor
  const [importText, setImportText] = useState<string>(mockColor);

  // 📤 處理匯入 JSON 字串，將其轉為畫布
  const importCanvas = () => {
    try {
      const parsedCanvas = JSON.parse(importText);
      if (
        Array.isArray(parsedCanvas) &&
        parsedCanvas.length === canvasPixelCount
      ) {
        setCanvasList([...canvasList, parsedCanvas]);
        setActiveCanvasIndex(canvasList.length);
        setImportText("");
      } else {
        alert(
          `格式錯誤，請輸入 ${pixelSizeInput}x${pixelSizeInput} 的 string[] 陣列`
        );
      }
    } catch (error) {
      alert("無效的 JSON 格式");
    }
  };

  // 📥 匯出當前畫布為 JSON 字串
  const exportCanvas = () => {
    const currentCanvas = canvasList[activeCanvasIndex];
    const canvasString = JSON.stringify(currentCanvas);
    setImportText(canvasString); // 顯示在textarea
  };

  // 🖼 控制圖片上傳彈窗的開關狀態
  const [isImageUploadModalOpen, setIsImageUploadModalOpen] =
    useState<boolean>(false);

  // 🖼 處理圖片裁剪後的資料，將其作為新畫布
  const handleImageCropConfirm = (pixelColors: string[]) => {
    setCanvasList([...canvasList, pixelColors]);
    setActiveCanvasIndex(canvasList.length);
    setIsImageUploadModalOpen(false);
  };

  // 🔄 當像素格數變更時，重新初始化畫布
  useEffect(() => {
    resetCanvas();
  }, [pixelSizeInput]);

  return (
    <>
      <div className="container-fluid p-3">
        {/* 上方匯入區域 */}
        <div className="mb-3">
          <textarea
            className="form-control w-100"
            rows={3}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={`請輸入 ${pixelSizeInput}x${pixelSizeInput} 的 JSON 格式 string[]`}
          />
          <div className="d-flex gap-2 mt-2">
            <button className="btn btn-info" onClick={importCanvas}>
              匯入
            </button>
            <button className="btn btn-secondary" onClick={exportCanvas}>
              匯出
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setIsImageUploadModalOpen(true)}
            >
              匯入圖片
            </button>
          </div>
        </div>

        {/* 主要工作區域 */}
        <div className="row">
          {/* 左側 - 顏色選擇 */}
          <div className="col-md-3 col-sm-12 d-flex flex-column align-items-center mt-5">
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
          <div className="col-md-6 col-sm-12 d-flex justify-content-center">
            {/* 按鈕區域 */}
            <div className="row d-flex">
              <div className="col-12">
                <div className="d-flex justify-content-center align-items-center gap-2 mb-3">
                  <button className="btn btn-secondary" onClick={resetCanvas}>
                    重置
                  </button>
                  <button className="btn btn-primary" onClick={addNewCanvas}>
                    新增
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={deleteCanvas}
                    disabled={canvasList.length <= 1}
                  >
                    刪除
                  </button>
                  <button className="btn btn-warning" onClick={copyCanvas}>
                    複製
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={pasteCanvas}
                    disabled={!copiedCanvas}
                  >
                    貼上
                  </button>
                  <div className="position-relative">
                    <button
                      type="button"
                      className="btn btn-primary dropdown-toggle"
                      onClick={() => {
                        setTempPixelSize(pixelSizeInput); // 每次打開先填入當前值
                        setIsDropdownOpen(!isDropdownOpen);
                      }}
                    >
                      像素
                    </button>

                    {isDropdownOpen && (
                      <form
                        className="p-3 shadow border position-absolute bg-white"
                        style={{
                          zIndex: 1000,
                          width: "200px",
                          top: "100%",
                          left: 0,
                        }}
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (tempPixelSize <= 0 || tempPixelSize > 100) {
                            alert("請輸入有效的數字（1 - 100）");
                          } else {
                            setPixelSizeInput(tempPixelSize); // 確定才更新正式值
                            setIsDropdownOpen(false); // 關閉 dropdown
                          }
                        }}
                      >
                        <div className="mb-3 text-start">
                          <label
                            className="form-check-label"
                            htmlFor="dropdownCheck2"
                          >
                            像素程度
                          </label>
                          <input
                            type="number"
                            className="form-control"
                            id="dropdownCheck2"
                            value={tempPixelSize}
                            onChange={(e) =>
                              setTempPixelSize(
                                parseInt(e.target.value, 10) || 1
                              )
                            }
                          />
                        </div>
                        <button type="submit" className="btn btn-primary">
                          確定
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
              <div className="d-flex justify-content-center align-items-center">
                <div
                  className="border border-dark p-2"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${pixelSizeInput}, ${pixelSize}px)`,
                    gridTemplateRows: `repeat(${pixelSizeInput}, ${pixelSize}px)`,
                    gap: "1px", // 可以調整格子之間的間隙
                  }}
                >
                  {canvasList[activeCanvasIndex]?.map((color, index) => (
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
            </div>
          </div>

          {/* 右側 - 預覽區域 */}
          <div className="col-md-3 col-sm-12 d-flex flex-column align-items-center mt-5">
            <PreviewCanvas
              canvasList={canvasList}
              pixelSizeInput={pixelSizeInput}
            ></PreviewCanvas>
          </div>
        </div>

        {/* 下方 - 畫布序列 (選擇不同畫布) */}
        <div className="row mt-3">
          <div className="col-12 d-flex justify-content-center gap-2">
            {canvasList?.map((canvas, index) => (
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
                    gridTemplateColumns: `repeat(${pixelSizeInput}, 1fr)`,
                    gridTemplateRows: `repeat(${pixelSizeInput}, 1fr)`,
                    gap: "1px", // 可以調整格子之間的間隙
                  }}
                >
                  {canvas?.map((color, index) => (
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
      {/********************* 選擇圖片範圍彈窗 *********************/}
      <ImageCropModal
        isOpen={isImageUploadModalOpen}
        onClose={() => setIsImageUploadModalOpen(false)}
        onConfirm={handleImageCropConfirm}
        pixelSizeInput={pixelSizeInput}
      />
    </>
  );
};

export default AnimatorPage;
