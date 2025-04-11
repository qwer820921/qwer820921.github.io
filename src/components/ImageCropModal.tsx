import React, { useRef, useState } from "react";
import CustomModal from "../components/modals/customModal";

// 型別定義
interface CropBox {
  x: number;
  y: number;
  size: number;
}

interface ImageCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (pixelColors: string[]) => void; // 回傳擷取的像素資料
}

const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  // 儲存上傳的圖片
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);

  // 儲存正方形框框的狀態
  const [cropBox, setCropBox] = useState<CropBox>({ x: 50, y: 50, size: 100 });

  // 檔案輸入框的 ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // canvas 參考用於圖片處理
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 處理圖片上傳
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith("image/")) {
        setUploadedImage(file);
        setCropBox({ x: 50, y: 50, size: 100 }); // 重置框框
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        alert("請上傳有效的圖片檔案（例如 PNG、JPG）");
      }
    }
  };

  // 處理框框拖動與調整大小
  const handleCropBoxMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    action: "move" | "resize"
  ) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const initialBox = { ...cropBox };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      if (action === "move") {
        setCropBox({
          ...cropBox,
          x: initialBox.x + deltaX,
          y: initialBox.y + deltaY,
        });
      } else if (action === "resize") {
        const newSize = initialBox.size + deltaX;
        if (newSize >= 50 && newSize <= 300) {
          setCropBox({
            ...cropBox,
            size: newSize,
          });
        }
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // 擷取框框內的圖片內容
  const handleCropConfirm = () => {
    if (!uploadedImage || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.src = URL.createObjectURL(uploadedImage);
    img.onload = () => {
      // 設置 canvas 大小為 16x16
      canvas.width = 16;
      canvas.height = 16;

      // 將框框內的圖片縮放到 16x16
      ctx.drawImage(
        img,
        cropBox.x,
        cropBox.y,
        cropBox.size,
        cropBox.size,
        0,
        0,
        16,
        16
      );

      // 取得 pixel 資料
      const imageData = ctx.getImageData(0, 0, 16, 16).data;
      const pixelColors: string[] = [];

      for (let i = 0; i < imageData.length; i += 4) {
        const r = imageData[i].toString(16).padStart(2, "0");
        const g = imageData[i + 1].toString(16).padStart(2, "0");
        const b = imageData[i + 2].toString(16).padStart(2, "0");
        pixelColors.push(`#${r}${g}${b}`);
      }

      // 回傳擷取的資料
      onConfirm(pixelColors);

      // 重置狀態
      setUploadedImage(null);
      setCropBox({ x: 50, y: 50, size: 100 });
    };
  };

  return (
    <CustomModal
      isOpen={isOpen}
      onConfirm={handleCropConfirm}
      onClose={() => {
        setUploadedImage(null);
        setCropBox({ x: 50, y: 50, size: 100 });
        onClose();
      }}
      isShowClose={true}
      hasWidth
    >
      <div style={{ position: "relative", width: "100%", height: "auto" }}>
        {uploadedImage && (
          <>
            <img
              src={URL.createObjectURL(uploadedImage)}
              alt="preview"
              style={{
                width: "100%",
                maxHeight: "400px",
                objectFit: "contain",
                display: "block",
              }}
            />
            {/* 正方形框框 */}
            <div
              style={{
                position: "absolute",
                top: `${cropBox.y}px`,
                left: `${cropBox.x}px`,
                width: `${cropBox.size}px`,
                height: `${cropBox.size}px`,
                border: "2px dashed red",
                cursor: "move",
              }}
              onMouseDown={(e) => handleCropBoxMouseDown(e, "move")}
            >
              {/* 右下角調整大小的控制點 */}
              <div
                style={{
                  position: "absolute",
                  bottom: "-5px",
                  right: "-5px",
                  width: "10px",
                  height: "10px",
                  backgroundColor: "red",
                  cursor: "se-resize",
                }}
                onMouseDown={(e) => handleCropBoxMouseDown(e, "resize")}
              />
            </div>
          </>
        )}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleImageUpload}
          style={{ marginTop: "10px", display: "block" }}
        />
        {/* 隱藏的 canvas 用於圖片處理 */}
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>
    </CustomModal>
  );
};

export default ImageCropModal;
