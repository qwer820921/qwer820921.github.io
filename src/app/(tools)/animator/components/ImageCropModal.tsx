/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef, useState } from "react";
import CustomModal from "@/components/modals/customModal";

// 定義 ImageCropModal 組件的屬性介面
interface ImageCropModalProps {
  isOpen: boolean; // 控制彈窗是否顯示
  onClose: () => void; // 關閉彈窗的回調函數
  onConfirm: (pixelMap: Map<number, string>) => void; // 確認裁剪後回傳像素顏色的回調函數
  pixelSizeInput: number; // 畫布的像素格數（邊長）
}

// ImageCropModal 組件：用於上傳圖片並選擇裁剪區域，生成像素化結果
const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  pixelSizeInput,
}) => {
  // 📁 儲存用戶上傳的圖片檔案
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);

  // 🖼 儲存即時預覽的圖片 URL
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // 📍 裁剪框的位置座標（x, y）
  const [cropBoxPosition, setCropBoxPosition] = useState({ x: 0, y: 0 });

  // 🚀 控制是否正在拖曳裁剪框
  const [isDragging, setIsDragging] = useState(false);

  // 📏 儲存圖片的實際尺寸（寬高）
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // 📐 圖片的最小邊長，用於計算裁剪框大小
  const [minImageSize, setMinImageSize] = useState(100);

  // 📊 裁剪框大小的進度百分比（0-100）
  const [progress, setProgress] = useState(40);

  // 🧮 根據進度計算裁剪框的實際大小
  const cropBoxSize = (progress / 100) * minImageSize;

  // 📎 參考 DOM 元素
  const fileInputRef = useRef<HTMLInputElement>(null); // 文件輸入框
  const canvasRef = useRef<HTMLCanvasElement>(null); // 用於繪製裁剪結果的畫布
  const imgRef = useRef<HTMLImageElement>(null); // 顯示上傳圖片的元素
  const containerRef = useRef<HTMLDivElement>(null); // 圖片容器的父元素
  const progressRef = useRef<HTMLDivElement>(null); // 進度條元素

  // 📤 處理圖片上傳事件
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const img = new Image();
      img.onload = () => {
        const naturalWidth = img.naturalWidth;
        const naturalHeight = img.naturalHeight;

        // 取得 modal 實際寬度
        const containerWidth =
          containerRef.current?.getBoundingClientRect().width ||
          window.innerWidth;
        const containerHeight =
          containerRef.current?.getBoundingClientRect().height ||
          window.innerHeight;

        // 安全邊距
        const maxWidth = containerWidth - 40;
        const maxHeight = containerHeight - 80;

        // 計算縮放比例
        const widthRatio = maxWidth / naturalWidth;
        const heightRatio = maxHeight / naturalHeight;
        const ratio = Math.min(widthRatio, heightRatio, 1);

        setImageSize({
          width: Math.round(naturalWidth * ratio),
          height: Math.round(naturalHeight * ratio),
        });
      };
      img.src = URL.createObjectURL(file); // 創建圖片的臨時 URL

      setUploadedImage(file); // 儲存上傳的檔案
      if (fileInputRef.current) fileInputRef.current.value = ""; // 清空輸入框
    } else {
      alert("請上傳有效的圖片檔案（例如 PNG、JPG）");
    }
  };

  // 🖱 處理滑鼠按下事件，啟動拖曳
  const handleMouseDown = () => setIsDragging(true);

  // 🖱 處理滑鼠放開事件，結束拖曳
  const handleMouseUp = () => setIsDragging(false);

  // 🖱 處理滑鼠移動事件，更新裁剪框位置並生成預覽
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect(); // 獲取容器範圍
    const cropBoxSize = (progress / 100) * minImageSize; // 計算裁剪框大小
    const halfBox = cropBoxSize / 2; // 裁剪框中心偏移量

    // 計算新位置（相對於容器左上角）
    const newX = e.clientX - rect.left - halfBox;
    const newY = e.clientY - rect.top - halfBox;

    // 限制裁剪框在容器內
    const maxX = rect.width - cropBoxSize;
    const maxY = rect.height - cropBoxSize;

    const updatedPosition = {
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    };

    setCropBoxPosition(updatedPosition); // 更新裁剪框位置
    generateLivePreview(updatedPosition); // 生成即時預覽
  };

  // 📱 處理觸控開始事件，啟動拖曳
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  // 📱 處理觸控結束事件，結束拖曳
  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // 📱 處理觸控移動事件，更新裁剪框位置並生成預覽
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const cropBoxSize = (progress / 100) * minImageSize;
    const halfBox = cropBoxSize / 2;

    const touch = e.touches[0]; // 獲取第一個觸控點
    const newX = touch.clientX - rect.left - halfBox;
    const newY = touch.clientY - rect.top - halfBox;

    const maxX = rect.width - cropBoxSize;
    const maxY = rect.height - cropBoxSize;

    const updatedPosition = {
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    };

    setCropBoxPosition(updatedPosition);
    generateLivePreview(updatedPosition);
  };

  // 🖼 生成即時預覽，根據裁剪框位置繪製像素化結果
  const generateLivePreview = (position = cropBoxPosition) => {
    const img = imgRef.current;
    if (!img || !canvasRef.current) return;

    const naturalWidth = img.naturalWidth; // 圖片實際寬度
    const naturalHeight = img.naturalHeight; // 圖片實際高度
    const renderedWidth = img.clientWidth; // 圖片渲染寬度
    const renderedHeight = img.clientHeight; // 圖片渲染高度

    // 計算縮放比例
    const scaleX = naturalWidth / renderedWidth;
    const scaleY = naturalHeight / renderedHeight;

    // 轉換為圖片實際座標
    const realX = position.x * scaleX;
    const realY = position.y * scaleY;
    const realSize = cropBoxSize * scaleX;

    // 創建臨時畫布
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // 設定畫布尺寸為像素格數
    canvas.width = pixelSizeInput;
    canvas.height = pixelSizeInput;

    // 繪製裁剪區域到畫布
    ctx?.drawImage(
      img,
      realX,
      realY,
      realSize,
      realSize,
      0,
      0,
      pixelSizeInput,
      pixelSizeInput
    );

    setPreviewUrl(canvas.toDataURL()); // 儲存預覽圖片的 URL
  };

  // ✅ 處理裁剪確認，生成最終像素顏色陣列
  const handleCropConfirm = () => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 計算圖片縮放比例
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;

    const realX = cropBoxPosition.x * scaleX;
    const realY = cropBoxPosition.y * scaleY;
    const realSize = cropBoxSize * scaleX;

    // 設定 Canvas 大小並繪製裁切區域
    canvas.width = pixelSizeInput;
    canvas.height = pixelSizeInput;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      img,
      realX,
      realY,
      realSize,
      realSize,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // 取得像素資料
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixelMap: Map<number, string> = new Map();

    // 轉換 RGBA 為 HEX，排除純白像素
    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      const a = imageData[i + 3];

      if (r === 255 && g === 255 && b === 255 && a === 255) {
        // 白色像素 -> 略過
        continue;
      }

      const hex = `#${r.toString(16).padStart(2, "0")}${g
        .toString(16)
        .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      const pixelIndex = i / 4;
      pixelMap.set(pixelIndex, hex);
    }

    onConfirm(pixelMap); // ✅ 回傳非白色像素的 Map
  };

  // 📊 處理進度條點擊事件，調整裁剪框大小
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current) return;

    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left; // 點擊位置相對進度條
    const width = rect.width;

    let percent = (x / width) * 100; // 計算百分比
    percent = Math.max(0, Math.min(100, percent)); // 限制範圍

    setProgress(Math.round(percent)); // 更新進度
  };

  // 🔄 當圖片尺寸變更時，更新最小邊長
  useEffect(() => {
    if (imageSize) {
      setMinImageSize(Math.min(imageSize.width, imageSize.height));
    } else {
      setMinImageSize(100); // 預設值
    }
  }, [imageSize]);

  // 🔄 當進度變更時，更新預覽
  useEffect(() => {
    if (uploadedImage) {
      setIsDragging(true);
      setTimeout(() => {
        generateLivePreview(cropBoxPosition); // 生成即時預覽
      }, 0);
      setIsDragging(false);
    }
  }, [progress]);

  return (
    // 🖼 自訂彈窗，包含圖片裁剪功能
    <CustomModal
      isOpen={isOpen}
      onConfirm={handleCropConfirm} // 確認裁剪
      onClose={() => {
        setUploadedImage(null); // 清除圖片
        setPreviewUrl(null); // 清除預覽
        onClose(); // 關閉彈窗
      }}
      isShowClose={true} // 顯示關閉按鈕
      hasWidth // 設定寬度
    >
      <div className="row w-100">
        <div className="col-md-9 col-xs-12">
          {/* 📁 圖片上傳輸入框 */}
          <div className="p-3 bg-info bg-opacity-10 border border-info rounded">
            <div className="text-start">
              <label className="form-label">上傳檔案</label>
            </div>

            <input
              id="file"
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleImageUpload}
              className="form-control"
              style={{ display: "block" }}
            />
          </div>

          {/* 📊 進度條，調整裁剪框大小 */}
          {uploadedImage && (
            <div
              ref={progressRef}
              className="progress my-3 border border-info rounded"
              style={{ width: "100%", height: "60px", cursor: "pointer" }}
              onClick={handleProgressClick}
            >
              <div
                className="progress-bar fs-6"
                role="progressbar"
                style={{ width: `${progress}%` }}
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                點擊調整裁剪框大小 {progress}%
              </div>
            </div>
          )}
          {/* 🖼 圖片容器，包含裁剪框與拖曳功能 */}
          <div
            ref={containerRef}
            style={{
              position: "relative",
              width: imageSize ? `${Math.min(imageSize.width, 400)}px` : "auto", // 限制最大寬度
              height: imageSize
                ? `${Math.min(imageSize.height, 400)}px`
                : "auto", // 限制最大高度
              overflow: "hidden",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {uploadedImage && (
              <img
                ref={imgRef}
                src={URL.createObjectURL(uploadedImage)}
                alt="preview"
                style={{
                  display: "block",
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain", // 保證圖片不變形
                  margin: "0 auto", // 水平置中
                }}
              />
            )}

            {/* 🔲 裁剪框，顯示紅色虛線框 */}
            {uploadedImage && (
              <div
                style={{
                  position: "absolute",
                  top: cropBoxPosition.y,
                  left: cropBoxPosition.x,
                  width: cropBoxSize,
                  height: cropBoxSize,
                  border: "2px dashed red",
                  boxSizing: "border-box",
                  pointerEvents: "none", // 不阻擋滑鼠事件
                  zIndex: 10,
                }}
              />
            )}

            {/* 🛡 透明層，用於處理拖曳事件 */}
            {uploadedImage && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  backgroundColor: "transparent",
                  zIndex: 5,
                }}
              />
            )}

            {/* 🖼 隱藏的畫布，用於生成裁剪結果 */}
            <canvas ref={canvasRef} style={{ display: "none" }} />
          </div>
        </div>
        <div className="col-md-3 col-xs-12">
          {/* 🖼 即時預覽區域，顯示像素化結果 */}
          <h4>即時預覽</h4>
          {previewUrl && (
            <div
              style={{
                width: "100%",
                height: "100%",
              }}
            >
              <img
                src={previewUrl}
                alt="crop-preview"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain", // 保證圖片不變形
                  margin: "0 auto", // 水平置中
                  imageRendering: "pixelated", // 保持像素化效果
                }}
              />
            </div>
          )}
        </div>
      </div>
    </CustomModal>
  );
};

export default ImageCropModal;
