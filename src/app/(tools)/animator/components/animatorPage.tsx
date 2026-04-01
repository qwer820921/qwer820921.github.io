"use client";

import React, { useEffect, useState, useRef } from "react";
import ImageCropModal from "./ImageCropModal";
import { CreateRefManager } from "@/utils/createRefManager";
import PreviewCanvas from "./previewCanvas";
import ColorSelector from "./colorSelector";
import PixelCanvas from "./pixelCanvas";
import { CanvasList, PixelMap } from "../types";
import styles from "./animator.module.css";

const AnimatorPage: React.FC = () => {
  // 🎨 設定目前選擇的顏色，預設為黑色
  const [selectedColor, setSelectedColor] = useState("#000000");

  // 📏 設定最終的像素格數（畫布邊長）
  const [pixelSizeInput, setPixelSizeInput] = useState(100);

  // 📝 表單內的暫存像素格數，供用戶輸入時使用
  const [tempPixelSize, setTempPixelSize] = useState(100);

  // 🧮 計算畫布總格數（像素格數的平方）
  // const canvasPixelCount = pixelSizeInput * pixelSizeInput;

  // 📐 計算每格像素的實際大小（以 400px 畫布為基準）
  const pixelSize = 400 / pixelSizeInput;

  // 下方顯示列 框框大小
  const previewSize = 85;

  // 📜 控制像素選擇下拉選單的開關狀態
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // 📌 畫布陣列，儲存多個畫布的像素顏色資料
  const [canvasList, setCanvasList] = useState<CanvasList>([new Map()]);

  // 📌 當前選中的畫布索引，決定正在編輯哪個畫布
  const [activeCanvasIndex, setActiveCanvasIndex] = useState(0);

  // 📋 儲存複製的畫布資料，供貼上功能使用
  const [copiedCanvas, setCopiedCanvas] = useState<PixelMap | null>(null);

  // 記錄是否正在拖動畫布
  // isDragging 為布林值，表示使用者是否正在拖動鼠標來繪製或填充顏色
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // 🖌️ 暫存拖動期間的像素變更
  const [pendingPixels, setPendingPixels] = useState<Map<number, string>>(
    new Map()
  );

  // 🔧 canvasRef：主畫布的參考（單一張，使用者目前正在編輯的畫布）
  // 這會用來操作主畫布 <canvas> 的繪圖內容，例如繪製像素方格、顯示格線等。
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 📦 thumbnailRefManager：縮圖用畫布的管理器（多張，對應 canvasList 中的每張畫布）
  // 這是一個動態管理多個 <canvas> DOM 元素的工具，用於下方畫布縮圖顯示區域
  // - 畫布數量不固定（可新增/刪除）
  // - 確保每個 <canvas> 正確對應到對應的畫布資料
  // - 提供安全的 get/set 操作，避免 ref 錯位或未掛載時出錯
  const thumbnailRefManager = CreateRefManager<HTMLCanvasElement>();

  // 🖼 控制圖片上傳彈窗的開關狀態
  const [isImageUploadModalOpen, setIsImageUploadModalOpen] =
    useState<boolean>(false);

  // 🔘 互動模式：'pencil' (繪圖，禁用捲動) | 'hand' (模式，允許捲動)
  const [interactionMode, setInteractionMode] = useState<"pencil" | "hand">(
    "pencil"
  );

  // 🖼 處理圖片裁剪後的資料，將其作為新畫布
  const handleImageCropConfirm = (pixelMap: Map<number, string>) => {
    setCanvasList((prev) => [...prev, pixelMap]);
    setActiveCanvasIndex(canvasList.length);
    thumbnailRefManager.insert(canvasList.length);
    setIsImageUploadModalOpen(false);
    // 圖片匯入後需要完整重繪
    drawMainCanvasFull(pixelMap);
  };

  // 🔄 重置畫布，清除所有畫布並新增一個空白畫布
  const resetCanvas = () => {
    setCanvasList([new Map()]);
    setActiveCanvasIndex(0);
    thumbnailRefManager.reset(canvasList.length);
    // 重置後需要完整重繪
    drawMainCanvasFull(new Map());
  };

  // ➕ 新增一個空白畫布並切換到它
  const addNewCanvas = () => {
    setCanvasList([...canvasList, new Map()]);
    setActiveCanvasIndex(canvasList.length); // 切換到新畫布
    thumbnailRefManager.insert(canvasList.length);
    // 新增畫布後需要完整重繪（因為是空白畫布）
    drawMainCanvasFull(new Map());
  };

  // ❌ 刪除當前畫布（僅在有多於一個畫布時生效）
  const deleteCanvas = () => {
    if (canvasList.length > 1) {
      const newCanvasList = canvasList?.filter(
        (_, i) => i !== activeCanvasIndex
      ); // 移除當前畫布
      setCanvasList(newCanvasList);
      const newIndex = Math.max(0, activeCanvasIndex - 1);
      setActiveCanvasIndex(newIndex); // 切換到上一個畫布
      thumbnailRefManager.remove(activeCanvasIndex);
      // 刪除後切換到其他畫布，需要完整重繪
      drawMainCanvasFull(newCanvasList[newIndex]);
    }
  };

  // 📋 複製當前畫布的資料
  const copyCanvas = () => {
    setCopiedCanvas(new Map(canvasList[activeCanvasIndex]));
  };

  // 📌 貼上複製的畫布資料到當前畫布
  const pasteCanvas = () => {
    if (copiedCanvas) {
      const newCanvasList = [...canvasList];
      newCanvasList[activeCanvasIndex] = new Map(copiedCanvas);
      setCanvasList(newCanvasList);
      // 貼上畫布後需要完整重繪
      drawMainCanvasFull(newCanvasList[activeCanvasIndex]);
    }
  };

  // 全圖重繪：清除畫布並繪製所有像素
  const drawMainCanvasFull = (pixelMap: Map<number, string>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const [index, color] of pixelMap.entries()) {
      const x = (index % pixelSizeInput) * pixelSize;
      const y = Math.floor(index / pixelSizeInput) * pixelSize;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, pixelSize, pixelSize);
      ctx.strokeStyle = "#ffffff";
      ctx.strokeRect(x, y, pixelSize, pixelSize);
    }
  };

  // 局部繪製：只繪製指定像素
  const drawMainCanvasPartial = (pixelMap: Map<number, string>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (pixelMap.size === 0) return;
    for (const [index, color] of pixelMap.entries()) {
      const x = (index % pixelSizeInput) * pixelSize;
      const y = Math.floor(index / pixelSizeInput) * pixelSize;
      ctx.clearRect(x, y, pixelSize, pixelSize);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, pixelSize, pixelSize);
      ctx.strokeStyle = "#ffffff";
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

        for (const [i, color] of data.entries()) {
          const x = (i % pixelSizeInput) * pixel;
          const y = Math.floor(i / pixelSizeInput) * pixel;
          ctx.fillStyle = color;
          ctx.fillRect(x, y, pixel, pixel);
        }
      });
    });
  };

  // 🎯 1. 每當 pixelSizeInput 改變，就重設整個畫布
  useEffect(() => {
    resetCanvas();
  }, [pixelSizeInput]);

  // 🎯 3. 每當所有畫布資料變更時，刷新所有縮圖
  useEffect(() => {
    drawThumbnails();
  }, [canvasList]);

  // 更新畫布像素顏色的邏輯
  // 這個函數會根據鼠標的當前位置來更新畫布的顏色
  const updateCanvasPixel = (x: number, y: number) => {
    const index = y * pixelSizeInput + x;
    const newCanvasList = [...canvasList];
    const currentCanvas = new Map(newCanvasList[activeCanvasIndex]);

    // 只有當顏色實際改變時才更新
    if (currentCanvas.get(index) !== selectedColor) {
      currentCanvas.set(index, selectedColor);
      newCanvasList[activeCanvasIndex] = currentCanvas;
      // 拖動時只更新 pendingPixels 和畫布顯示
      if (isDragging) {
        setPendingPixels((prev) => new Map(prev).set(index, selectedColor));
      } else {
        // 非拖動（單一點擊）時直接更新 canvasList
        setCanvasList(newCanvasList);
      }
      // 更新 畫布
      const changedPixels = new Map<number, string>().set(index, selectedColor);
      drawMainCanvasPartial(changedPixels);
    }
  };

  // 共用的座標計算邏輯
  const calculatePixelCoordinates = (
    clientX: number,
    clientY: number
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas || pixelSize <= 0) return null;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / pixelSize);
    const y = Math.floor((clientY - rect.top) / pixelSize);

    if (x >= 0 && x < pixelSizeInput && y >= 0 && y < pixelSizeInput) {
      return { x, y };
    }
    return null;
  };

  // 處理鼠標事件的像素更新
  const handleMousePixelUpdate = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = calculatePixelCoordinates(e.clientX, e.clientY);
    if (coords) {
      updateCanvasPixel(coords.x, coords.y);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    handleMousePixelUpdate(e);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      handleMousePixelUpdate(e);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    applyPendingPixels();
  };

  // 處理觸控事件的像素更新
  const handleTouchPixelUpdate = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) return;

    // 只有在繪圖模式下才阻止捲動並執行繪圖
    if (interactionMode === "pencil") {
      if (e.cancelable) e.preventDefault();
      const coords = calculatePixelCoordinates(
        e.touches[0].clientX,
        e.touches[0].clientY
      );
      if (coords) {
        updateCanvasPixel(coords.x, coords.y);
      }
    }
    // 若為 'hand' 模式，則不執行 preventDefault，讓瀏覽器執行原生捲動
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    handleTouchPixelUpdate(e);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      handleTouchPixelUpdate(e);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    applyPendingPixels();
  };

  // 應用 pendingPixels 的變更到 canvasList
  const applyPendingPixels = () => {
    if (pendingPixels.size > 0) {
      const newCanvasList = [...canvasList];
      const currentCanvas = new Map(newCanvasList[activeCanvasIndex]);
      for (const [index, color] of pendingPixels.entries()) {
        currentCanvas.set(index, color);
      }
      newCanvasList[activeCanvasIndex] = currentCanvas;
      setCanvasList(newCanvasList);
      setPendingPixels(new Map());
    }
  };

  // 切換
  const handleCanvasSwitch = (index: number) => {
    // 應用當前畫布的 pendingPixels（若有）
    if (pendingPixels.size > 0) {
      applyPendingPixels();
    }
    // 切換畫布
    setActiveCanvasIndex(index);
    // 繪製新畫布
    if (canvasList[index]) {
      drawMainCanvasFull(canvasList[index]);
    } else {
      console.warn(`Invalid canvas index: ${index}`);
    }
  };

  return (
    <>
      <div className="container py-5" style={{ marginTop: "30px" }}>
        {/* SEO 隱藏區 */}
        <div
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            opacity: 0,
          }}
        >
          <h1>像素動畫編輯器</h1>
          <p>製作屬於你的像素動畫...</p>
        </div>

        {/* 頂部全域工具列 */}
        <div className="d-flex justify-content-center mb-4">
          <div className={styles.toolbarActions}>
            <button
              className="btn btn-primary px-4"
              onClick={() => setIsImageUploadModalOpen(true)}
            >
              匯入圖片
            </button>
            <button
              className="btn btn-outline-secondary px-4 me-2"
              onClick={resetCanvas}
            >
              全新重置
            </button>

            {/* 互動模式切換 (手機優化) */}
            <div className="btn-group me-3 shadow-sm">
              <button
                className={`btn btn-sm ${
                  interactionMode === "pencil"
                    ? "btn-primary"
                    : "btn-outline-primary"
                }`}
                onClick={() => setInteractionMode("pencil")}
                title="繪圖模式 (禁用捲動)"
              >
                <i className="bi bi-pencil-fill me-1"></i> 繪圖
              </button>
              <button
                className={`btn btn-sm ${
                  interactionMode === "hand"
                    ? "btn-primary"
                    : "btn-outline-primary"
                }`}
                onClick={() => setInteractionMode("hand")}
                title="移動模式 (允許捲動)"
              >
                <i className="bi bi-hand-index-thumb me-1"></i> 移動
              </button>
            </div>
            <div className="position-relative">
              <button
                type="button"
                className="btn btn-outline-primary dropdown-toggle px-4"
                onClick={() => {
                  setTempPixelSize(pixelSizeInput);
                  setIsDropdownOpen(!isDropdownOpen);
                }}
              >
                解析度: {pixelSizeInput}x{pixelSizeInput}
              </button>

              {isDropdownOpen && (
                <form
                  className="p-3 shadow border position-absolute bg-white rounded-3"
                  style={{
                    zIndex: 1000,
                    width: "220px",
                    top: "110%",
                    left: "50%",
                    transform: "translateX(-50%)",
                  }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (tempPixelSize <= 0 || tempPixelSize > 100) {
                      alert("請輸入有效的數字（1 - 100）");
                    } else {
                      setPixelSizeInput(tempPixelSize);
                      setIsDropdownOpen(false);
                    }
                  }}
                >
                  <div className="mb-3 text-start">
                    <label className="form-label" htmlFor="pixelInput">
                      像素格數 (1-100)
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      id="pixelInput"
                      value={tempPixelSize}
                      onChange={(e) =>
                        setTempPixelSize(parseInt(e.target.value, 10) || 1)
                      }
                    />
                  </div>
                  <button type="submit" className="btn btn-primary w-100">
                    套用設定
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        <div className="row g-4">
          {/* 左側 - 畫布主區域 */}
          <div className="col-lg-9 col-md-12">
            <div className={styles.glassCard}>
              <h5 className="w-100 text-start mb-3 fw-bold">編輯畫布</h5>
              <div className={styles.cardBody}>
                <div className={styles.canvasWrapper}>
                  <PixelCanvas
                    canvasRef={canvasRef}
                    handleCanvasClick={handleMousePixelUpdate}
                    handleMouseDown={handleMouseDown}
                    handleMouseMove={handleMouseMove}
                    handleMouseUp={handleMouseUp}
                    handleTouchStart={handleTouchStart}
                    handleTouchMove={handleTouchMove}
                    handleTouchEnd={handleTouchEnd}
                    className={`${styles.responsiveCanvas} ${
                      interactionMode === "pencil"
                        ? styles.canvasPencil
                        : styles.canvasHand
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 右側 - 控制與預覽區域 */}
          <div className="col-lg-3 col-md-12">
            <div className="d-flex flex-column gap-4 h-100">
              {/* 預覽卡片 */}
              <div className={styles.glassCard}>
                <h5 className="w-100 text-start mb-3 fw-bold">動畫預覽</h5>
                <div className={styles.cardBody}>
                  <PreviewCanvas
                    canvasList={canvasList}
                    pixelSizeInput={pixelSizeInput}
                    className={styles.previewCanvas}
                  />
                </div>
              </div>

              {/* 色彩卡片 */}
              <div className={styles.glassCard}>
                <h5 className="w-100 text-start mb-3 fw-bold">調色盤</h5>
                <div className={styles.cardBody}>
                  <ColorSelector
                    value={selectedColor}
                    onChange={setSelectedColor}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 下方 - 影格時間軸區域 */}
          <div className="col-12 mt-4">
            <div className={styles.timelineCard}>
              <div className={styles.timelineHeader}>
                <h5 className="mb-0 fw-bold">影格序列</h5>
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-sm btn-primary px-3"
                    onClick={addNewCanvas}
                  >
                    新增影格
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger px-3"
                    onClick={deleteCanvas}
                    disabled={canvasList.length <= 1}
                  >
                    刪除
                  </button>
                  <button
                    className="btn btn-sm btn-outline-warning px-3"
                    onClick={copyCanvas}
                  >
                    複製
                  </button>
                  <button
                    className="btn btn-sm btn-outline-success px-3"
                    onClick={pasteCanvas}
                    disabled={!copiedCanvas}
                  >
                    貼上
                  </button>
                </div>
              </div>
              <div className={styles.timelineContent}>
                {canvasList?.map((canvas, index) => (
                  <div
                    key={index}
                    className={`${styles.frameItem} ${
                      activeCanvasIndex === index ? styles.frameActive : ""
                    }`}
                    onClick={() => handleCanvasSwitch(index)}
                  >
                    <canvas
                      ref={(el) => thumbnailRefManager.set(index, el)}
                      width={previewSize}
                      height={previewSize}
                      style={{ display: "block", borderRadius: "4px" }}
                    />
                    <div
                      className="text-center mt-1"
                      style={{
                        fontSize: "11px",
                        fontWeight: activeCanvasIndex === index ? "700" : "400",
                        color:
                          activeCanvasIndex === index ? "#007bff" : "#6c757d",
                      }}
                    >
                      #{index + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

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
