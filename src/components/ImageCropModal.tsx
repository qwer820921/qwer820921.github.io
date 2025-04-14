import React, { useEffect, useRef, useState } from "react";
import CustomModal from "../components/modals/customModal";

interface ImageCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (pixelColors: string[]) => void;
}

const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropBoxPosition, setCropBoxPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [minImageSize, setMinImageSize] = useState(100);
  const [progress, setProgress] = useState(20);
  const cropBoxSize = (progress / 100) * minImageSize;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const img = new Image();
      img.onload = () => {
        setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = URL.createObjectURL(file);

      setUploadedImage(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      alert("請上傳有效的圖片檔案（例如 PNG、JPG）");
    }
  };

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const cropBoxSize = (progress / 100) * minImageSize;
    const halfBox = cropBoxSize / 2;

    const newX = e.clientX - rect.left - halfBox;
    const newY = e.clientY - rect.top - halfBox;

    const maxX = rect.width - cropBoxSize;
    const maxY = rect.height - cropBoxSize;

    const updatedPosition = {
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    };

    setCropBoxPosition(updatedPosition);
    generateLivePreview(updatedPosition);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const cropBoxSize = (progress / 100) * minImageSize;
    const halfBox = cropBoxSize / 2;

    const touch = e.touches[0];
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

  const generateLivePreview = (position = cropBoxPosition) => {
    const img = imgRef.current;
    if (!img || !canvasRef.current) return;

    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    const renderedWidth = img.clientWidth;
    const renderedHeight = img.clientHeight;

    const scaleX = naturalWidth / renderedWidth;
    const scaleY = naturalHeight / renderedHeight;

    const realX = position.x * scaleX;
    const realY = position.y * scaleY;
    const realSize = cropBoxSize * scaleX;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = 16;
    canvas.height = 16;

    ctx?.drawImage(img, realX, realY, realSize, realSize, 0, 0, 16, 16);

    setPreviewUrl(canvas.toDataURL());
  };

  const handleCropConfirm = () => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    const renderedWidth = img.clientWidth;
    const renderedHeight = img.clientHeight;

    const scaleX = naturalWidth / renderedWidth;
    const scaleY = naturalHeight / renderedHeight;

    const realX = cropBoxPosition.x * scaleX;
    const realY = cropBoxPosition.y * scaleY;
    const realSize = cropBoxSize * scaleX;

    canvas.width = 16;
    canvas.height = 16;

    ctx.clearRect(0, 0, 16, 16);
    ctx.drawImage(img, realX, realY, realSize, realSize, 0, 0, 16, 16);

    const imageData = ctx.getImageData(0, 0, 16, 16).data;
    const pixelColors: string[] = [];

    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i].toString(16).padStart(2, "0");
      const g = imageData[i + 1].toString(16).padStart(2, "0");
      const b = imageData[i + 2].toString(16).padStart(2, "0");
      pixelColors.push(`#${r}${g}${b}`);
    }

    onConfirm(pixelColors);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current) return;

    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    let percent = (x / width) * 100;
    percent = Math.max(0, Math.min(100, percent));

    setProgress(Math.round(percent));
  };

  useEffect(() => {
    if (imageSize) {
      setMinImageSize(Math.min(imageSize.width, imageSize.height));
    } else {
      setMinImageSize(100);
    }
  }, [imageSize]);

  useEffect(() => {
    if (uploadedImage) {
      setIsDragging(true);
      setTimeout(() => {
        generateLivePreview(cropBoxPosition);
      }, 0);

      setIsDragging(false);
    }
  }, [progress]); // 每次 progress 或位置改變時更新預覽

  return (
    <CustomModal
      isOpen={isOpen}
      onConfirm={handleCropConfirm}
      onClose={() => {
        setUploadedImage(null);
        setPreviewUrl(null);
        onClose();
      }}
      isShowClose={true}
      hasWidth
    >
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleImageUpload}
        style={{ marginTop: "10px", display: "block" }}
      />
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: imageSize ? `${Math.min(imageSize.width, 400)}px` : "auto",
          height: imageSize ? `${Math.min(imageSize.height, 400)}px` : "auto",
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
              objectFit: "contain", // 保證圖片不會超過容器
              margin: "0 auto", // 水平置中
            }}
          />
        )}

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
              pointerEvents: "none",
              zIndex: 10,
            }}
          />
        )}

        {/* 在圖片上層放一個透明層用來處理紅框的拖拉 */}
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

        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>

      {uploadedImage && (
        <div
          ref={progressRef}
          className="progress mt-3"
          style={{ width: "100%", height: "20px", cursor: "pointer" }}
          onClick={handleProgressClick}
        >
          <div
            className="progress-bar"
            role="progressbar"
            style={{ width: `${progress}%` }}
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {progress}%
          </div>
        </div>
      )}

      {previewUrl && (
        <div style={{ marginTop: "20px" }}>
          <h4>即時預覽</h4>
          <img
            src={previewUrl}
            alt="crop-preview"
            style={{
              width: "64px",
              height: "64px",
              imageRendering: "pixelated",
              border: "1px solid #ccc",
            }}
          />
        </div>
      )}
    </CustomModal>
  );
};

export default ImageCropModal;
