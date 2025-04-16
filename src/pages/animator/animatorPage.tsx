import React, { useEffect, useState, useRef } from "react";
import ImageCropModal from "../../components/ImageCropModal";
import { createRefManager } from "../../utils/createRefManager";
import PreviewCanvas from "./previewCanvas";
import ColorSelector from "./colorSelector";

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

  // 下方顯示列 框框大小
  const previewSize = 85;

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

  // 🔧 canvasRef：主畫布的參考（單一張，使用者目前正在編輯的畫布）
  // 這會用來操作主畫布 <canvas> 的繪圖內容，例如繪製像素方格、顯示格線等。
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 📦 thumbnailRefManager：縮圖用畫布的管理器（多張，對應 canvasList 中的每張畫布）
  // 這是一個動態管理多個 <canvas> DOM 元素的工具，用於下方畫布縮圖顯示區域
  // - 畫布數量不固定（可新增/刪除）
  // - 確保每個 <canvas> 正確對應到對應的畫布資料
  // - 提供安全的 get/set 操作，避免 ref 錯位或未掛載時出錯
  const thumbnailRefManager = createRefManager<HTMLCanvasElement>();

  // 🖼 控制圖片上傳彈窗的開關狀態
  const [isImageUploadModalOpen, setIsImageUploadModalOpen] =
    useState<boolean>(false);

  // 🖼 處理圖片裁剪後的資料，將其作為新畫布
  const handleImageCropConfirm = (pixelColors: string[]) => {
    setCanvasList([...canvasList, pixelColors]);
    setActiveCanvasIndex(canvasList.length);
    setIsImageUploadModalOpen(false);
  };

  // 🔄 重置畫布，清除所有畫布並新增一個空白畫布
  const resetCanvas = () => {
    setCanvasList([Array(canvasPixelCount).fill("#FFFFFF")]);
    setActiveCanvasIndex(0);
    thumbnailRefManager.reset(canvasList.length);
  };

  // ➕ 新增一個空白畫布並切換到它
  const addNewCanvas = () => {
    setCanvasList([...canvasList, Array(canvasPixelCount).fill("#FFFFFF")]);
    setActiveCanvasIndex(canvasList.length); // 切換到新畫布
    thumbnailRefManager.insert(canvasList.length);
  };

  // ❌ 刪除當前畫布（僅在有多於一個畫布時生效）
  const deleteCanvas = () => {
    if (canvasList.length > 1) {
      const newCanvasList = canvasList?.filter(
        (_, i) => i !== activeCanvasIndex
      ); // 移除當前畫布
      setCanvasList(newCanvasList);
      setActiveCanvasIndex(Math.max(0, activeCanvasIndex - 1)); // 切換到上一個畫布
      thumbnailRefManager.remove(activeCanvasIndex);
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

  // 點擊畫布以上色
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / pixelSize);
    const y = Math.floor((e.clientY - rect.top) / pixelSize);
    const index = y * pixelSizeInput + x;

    const newCanvasList = [...canvasList];
    const current = [...newCanvasList[activeCanvasIndex]];
    current[index] = selectedColor;
    newCanvasList[activeCanvasIndex] = current;
    setCanvasList(newCanvasList);
  };

  // 🎨 繪製主畫布內容
  const drawMainCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 清除畫布內容
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 取得當前畫布的像素色碼資料
    const currentCanvas = canvasList[activeCanvasIndex];

    // 每格像素逐一上色
    for (let i = 0; i < canvasPixelCount; i++) {
      const x = (i % pixelSizeInput) * pixelSize;
      const y = Math.floor(i / pixelSizeInput) * pixelSize;
      ctx.fillStyle = currentCanvas[i];
      ctx.fillRect(x, y, pixelSize, pixelSize);

      // 顯示格線（可選）
      ctx.strokeStyle = "#e0e0e0";
      ctx.strokeRect(x, y, pixelSize, pixelSize);
    }
  };

  // 🖼️ 繪製所有縮圖
  const drawThumbnails = () => {
    requestAnimationFrame(() => {
      canvasList.forEach((data, index) => {
        const canvas = thumbnailRefManager.get(index);
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const pixel = previewSize / pixelSizeInput;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < data.length; i++) {
          const x = (i % pixelSizeInput) * pixel;
          const y = Math.floor(i / pixelSizeInput) * pixel;
          ctx.fillStyle = data[i];
          ctx.fillRect(x, y, pixel, pixel);
        }
      });
    });
  };

  // 🎯 1. 每當 pixelSizeInput 改變，就重設整個畫布
  useEffect(() => {
    resetCanvas();
  }, [pixelSizeInput]);

  // 🎯 2. 每當 canvasList / activeCanvasIndex 等畫布內容相關資料變化時，重繪主畫布
  useEffect(() => {
    drawMainCanvas();
  }, [canvasList, activeCanvasIndex]);

  // 🎯 3. 每當所有畫布資料或解析度變更時，刷新所有縮圖
  useEffect(() => {
    drawThumbnails();
  }, [canvasList]);

  return (
    <>
      <div className="container-fluid p-3">
        {/* 上方匯入區域 */}
        <div className="mb-3">
          <button
            className="btn btn-primary"
            onClick={() => setIsImageUploadModalOpen(true)}
          >
            匯入圖片
          </button>
        </div>

        {/* 主要工作區域 */}
        <div className="row">
          {/* 左側 - 顏色選擇 */}
          <div className="col-md-3 col-sm-12 d-flex flex-column align-items-center mt-5">
            <ColorSelector value={selectedColor} onChange={setSelectedColor} />
          </div>

          {/* 中間 - 畫布區域 */}
          <div className="col-md-6 col-sm-12 d-flex justify-content-center">
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
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={400}
                  style={{ border: "1px solid #000", cursor: "pointer" }}
                  onClick={handleCanvasClick}
                />
              </div>
            </div>
          </div>

          {/* 右側 - 預覽區域 */}
          <div className="col-md-3 col-sm-12 d-flex flex-column align-items-center mt-5">
            <PreviewCanvas
              canvasList={canvasList}
              pixelSizeInput={pixelSizeInput}
            />
          </div>
        </div>

        {/* 下方 - 畫布序列 (選擇不同畫布) */}
        <div className="d-flex justify-content-center align-items-center mt-3">
          {canvasList?.map((canvas, index) => (
            <div
              key={index}
              style={{
                border:
                  activeCanvasIndex === index
                    ? "3px solid #007bff"
                    : "1px solid #ccc",
                padding: "2px",
                width: "auto",
                height: "auto",
                backgroundColor: "#ffffff",
                cursor: "pointer",
                display: "grid",
              }}
              onClick={() => setActiveCanvasIndex(index)}
            >
              <canvas
                ref={(el) => thumbnailRefManager.set(index, el)}
                width={previewSize}
                height={previewSize}
                style={{ display: "block" }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 選擇圖片範圍彈窗 */}
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
