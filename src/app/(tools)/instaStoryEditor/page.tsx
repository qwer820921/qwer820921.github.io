"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import * as fabric from "fabric";
import {
  Upload,
  Trash,
  XLg,
  Download,
  ArrowsAngleExpand,
  Type,
  Kanban,
} from "react-bootstrap-icons";
import { Modal, ButtonGroup, Button, Form, Dropdown } from "react-bootstrap";
import { printValue } from "@/utils/createElement";
import toast from "react-hot-toast";
import ColorSelectorChrome from "../animator/components/colorSelector";

type CanvasObject = {
  id: string;
  type: "image" | "video" | "text";
  object: fabric.Object;
  videoElement?: HTMLVideoElement;
  textContent?: string; //屬性為'text'時，文字的值
  color?: string; // 新增顏色屬性
  canChangeColor: boolean; // 是否允許調整顏色  'image' | 'video' 不允許
};

/**
 * 初始化畫布的長與寬
 */
const getInitialCanvasSize = () => {
  if (typeof window === "undefined") {
    return { width: 540, height: 960 }; // 預設值
  }

  const isDesktop = window.innerWidth >= 1080;
  console.log(window.innerWidth);

  // 電腦版尺寸
  if (isDesktop) {
    const maxWidth = window.innerWidth * 0.8; // 最大寬度不超過 1200px
    const maxHeight = window.innerHeight * 0.8; // 使用視窗高度的 80% 作為最大高度

    // 計算符合視窗高度的寬度
    // const widthBasedOnHeight = Math.floor((maxHeight * 9) / 16); // 16:9 比例

    return {
      width: maxWidth,
      height: maxHeight,
    };
  }

  // 手機版尺寸
  const mobileBaseWidth = 1080;
  const mobileBaseHeight = 1920;
  const maxMobileWidth = Math.min(window.innerWidth * 0.9, mobileBaseWidth);

  const scale = maxMobileWidth / mobileBaseWidth;
  return {
    width: Math.floor(mobileBaseWidth * scale),
    height: Math.floor(mobileBaseHeight * scale),
  };
};

/**
 * 影片編輯器組件
 * 提供上傳影片/圖片、顯示在畫布、自動播放影片、調整大小、刪除操作和下載功能
 */
export default function VideoEditor() {
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationRefs = useRef<Map<string, number>>(new Map());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [canvasObjects, setCanvasObjects] = useState<CanvasObject[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [downloadDuration, setDownloadDuration] = useState<string>("10");
  const [downloadFormat, setDownloadFormat] = useState<string>("webm");
  const [downloadFps, setDownloadFps] = useState<string>("30");
  const [downloadFileName, setDownloadFileName] =
    useState<string>("canvas-video");
  const [downloadImageFormat, setDownloadImageFormat] = useState<string>("png");
  const [downloadImageFileName, setDownloadImageFileName] =
    useState<string>("canvas-image");
  const [canvasSize, setCanvasSize] = useState(getInitialCanvasSize());
  const [textInput, setTextInput] = useState("");
  const [selectedObject, setSelectedObject] = useState<CanvasObject | null>(
    null
  );
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showObjectsModal, setShowObjectsModal] = useState(false);
  const processingToastId = useRef<string | undefined>(undefined); //使用 useRef 儲存 toast.loading 的 ID，以便後續移除

  // --- 浮動按鈕拖曳邏輯 ---
  const [floatingBtnPos, setFloatingBtnPos] = useState({ x: -1000, y: -1000 }); // 初始位置先藏起來
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // 初始位置：右上角
    setFloatingBtnPos({
      x: window.innerWidth - 32 - 60, // 右邊距 32px
      y: 125, // 避開 navbar
    });
  }, []);

  const handleFloatingBtnDown = (e: React.MouseEvent | React.TouchEvent) => {
    isDraggingRef.current = false;
    const clientX =
      "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY =
      "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    dragOffsetRef.current = {
      x: clientX - floatingBtnPos.x,
      y: clientY - floatingBtnPos.y,
    };

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      isDraggingRef.current = true;
      // 只有在拖曳時才阻止預設行為，避免點擊時無法觸發
      if (ev.cancelable) ev.preventDefault();

      const cx =
        "touches" in ev
          ? (ev as TouchEvent).touches[0].clientX
          : (ev as MouseEvent).clientX;
      const cy =
        "touches" in ev
          ? (ev as TouchEvent).touches[0].clientY
          : (ev as MouseEvent).clientY;

      let newX = cx - dragOffsetRef.current.x;
      let newY = cy - dragOffsetRef.current.y;

      // 邊界檢查
      const maxX = window.innerWidth - 60; // 60 是按鈕寬度
      const maxY = window.innerHeight - 60;
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      setFloatingBtnPos({ x: newX, y: newY });
    };

    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("touchend", handleUp);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    document.addEventListener("touchmove", handleMove, { passive: false });
    document.addEventListener("touchend", handleUp);
  };

  /**
   * 初始化畫布
   */
  useEffect(() => {
    if (!containerRef.current) return;

    const canvas = new fabric.Canvas("video-canvas", {
      width: canvasSize.width,
      height: canvasSize.height,
      backgroundColor: "#f0f0f0",
      preserveObjectStacking: true,
    });

    canvasRef.current = canvas;

    return () => {
      animationRefs.current.forEach((animationId) => {
        cancelAnimationFrame(animationId);
      });
      animationRefs.current.clear();
      canvas.dispose();
    };
  }, [canvasSize]);

  /**
   * 調整畫布大小
   */
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.setWidth(containerRef.current.clientWidth);
        canvasRef.current.renderAll();
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /**
   * 創建圖片物件
   */
  const createImageObject = (imageUrl: string): Promise<fabric.Image> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const fabricImg = new fabric.Image(img, {
            left: 100,
            top: 100,
            scaleX: 0.5,
            scaleY: 0.5,
            selectable: true,
            hasControls: true,
            lockUniScaling: false,
            lockRotation: false,
            borderColor: "#3f51b5",
            cornerColor: "#3f51b5",
            cornerSize: 12,
            transparentCorners: false,
          });
          const objectId = `obj-${Date.now()}`;
          fabricImg.set("data", { id: objectId });
          resolve(fabricImg);
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error("圖片加載失敗"));
      img.src = imageUrl;
    });
  };

  /**
   * 創建影片物件
   */
  const createVideoObject = (
    videoEl: HTMLVideoElement
  ): Promise<fabric.Image> => {
    return new Promise((resolve, reject) => {
      const tempCanvas = document.createElement("canvas");
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) {
        reject(new Error("無法獲取臨時畫布上下文"));
        return;
      }

      tempCanvas.width = videoEl.videoWidth;
      tempCanvas.height = videoEl.videoHeight;
      tempCtx.drawImage(videoEl, 0, 0, tempCanvas.width, tempCanvas.height);

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const fabricImg = new fabric.Image(img, {
            left: 100,
            top: 100,
            scaleX: 0.5,
            scaleY: 0.5,
            selectable: true,
            hasControls: true,
            lockUniScaling: false,
            lockRotation: false,
            borderColor: "#3f51b5",
            cornerColor: "#3f51b5",
            cornerSize: 12,
            transparentCorners: false,
          });
          const objectId = `vid-${Date.now()}`;
          fabricImg.set("data", { id: objectId });
          resolve(fabricImg);
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error("影片幀圖片加載失敗"));
      img.src = tempCanvas.toDataURL("image/png");
    });
  };

  /**
   * 處理檔案上傳
   */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setVideoUrl(url);

    try {
      if (file.type.startsWith("image/")) {
        const fabricImg = await createImageObject(url);
        setCanvasObjects((prev) => [
          ...prev,
          {
            id: fabricImg.get("data").id,
            type: "image" as const,
            object: fabricImg,
            canChangeColor: false,
          },
        ]);
      } else if (file.type.startsWith("video/")) {
        const video = document.createElement("video");
        video.style.display = "none";
        video.src = url;
        video.muted = true;
        video.loop = true;
        video.crossOrigin = "anonymous";
        video.playsInline = true;
        document.body.appendChild(video);

        video.addEventListener("error", (e) => {
          console.error("影片加載錯誤:", e);
        });

        await new Promise<void>((resolve) => {
          video.addEventListener("canplay", () => {
            resolve();
          });
          video.load();
        });

        const fabricImg = await createVideoObject(video);
        setCanvasObjects((prev) => [
          ...prev,
          {
            id: fabricImg.get("data").id,
            type: "video" as const,
            object: fabricImg,
            videoElement: video,
            canChangeColor: false,
          },
        ]);

        video.play().catch((error) => {
          console.error("自動播放失敗:", error);
        });
      }
    } catch (error) {
      console.error("處理檔案時發生錯誤:", error);
    }
  };

  /**
   * 監聽 canvasObjects 變化，更新畫布
   */
  useEffect(() => {
    if (!canvasRef.current) return;

    canvasRef.current.clear();
    canvasRef.current.backgroundColor = "#f0f0f0";
    canvasRef.current.renderAll();

    animationRefs.current.forEach((animationId) => {
      cancelAnimationFrame(animationId);
    });
    animationRefs.current.clear();

    canvasObjects.forEach((obj) => {
      canvasRef.current?.add(obj.object);
      if (obj.type === "video" && obj.videoElement) {
        const updateFrame = () => {
          if (!canvasRef.current || !obj.videoElement || !obj.object) return;

          const frameCanvas = document.createElement("canvas");
          const frameCtx = frameCanvas.getContext("2d");
          if (!frameCtx) return;

          frameCanvas.width = obj.videoElement.videoWidth;
          frameCanvas.height = obj.videoElement.videoHeight;
          frameCtx.drawImage(
            obj.videoElement,
            0,
            0,
            frameCanvas.width,
            frameCanvas.height
          );

          const frameImg = new Image();
          frameImg.onload = () => {
            if (!obj.object || !(obj.object instanceof fabric.Image)) return;
            obj.object.setElement(frameImg);
            canvasRef.current?.renderAll();
            if (!obj.videoElement?.paused) {
              const animationId = requestAnimationFrame(updateFrame);
              animationRefs.current.set(obj.id, animationId);
            }
          };
          frameImg.src = frameCanvas.toDataURL("image/png");
        };
        updateFrame();
      }
    });

    if (canvasObjects.length > 0) {
      canvasRef.current.setActiveObject(
        canvasObjects[canvasObjects.length - 1].object
      );
    }
    canvasRef.current.renderAll();

    return () => {
      animationRefs.current.forEach((animationId) => {
        cancelAnimationFrame(animationId);
      });
      animationRefs.current.clear();
    };
  }, [canvasObjects]);

  /**
   * 處理刪除操作
   */
  const handleDelete = useCallback(() => {
    if (!canvasRef.current) return;

    animationRefs.current.forEach((animationId) => {
      cancelAnimationFrame(animationId);
    });
    animationRefs.current.clear();

    canvasRef.current.clear();
    canvasRef.current.backgroundColor = "#f0f0f0";
    canvasRef.current.renderAll();

    canvasObjects.forEach((obj) => {
      if (obj.videoElement) {
        obj.videoElement.pause();
        const newVideo = obj.videoElement.cloneNode(false) as HTMLVideoElement;
        obj.videoElement.parentNode?.replaceChild(newVideo, obj.videoElement);
        newVideo.src = "";
        newVideo.remove();
      }
      if (obj.object instanceof fabric.Image) {
        obj.object.dispose();
      }
    });

    setVideoUrl(null);
    setCanvasObjects([]);
  }, [canvasObjects]);

  /**
   * 刪除物件
   */
  const handleRemoveObject = (objectId: string) => {
    if (!canvasRef.current) return;

    const obj = canvasObjects.find((o) => o.id === objectId);
    if (obj) {
      const animationId = animationRefs.current.get(obj.id);
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationRefs.current.delete(obj.id);
      }

      canvasRef.current.remove(obj.object);

      if (obj.videoElement) {
        obj.videoElement.pause();
        const newVideo = obj.videoElement.cloneNode(false) as HTMLVideoElement;
        obj.videoElement.parentNode?.replaceChild(newVideo, obj.videoElement);
        newVideo.src = "";
        newVideo.remove();
      }

      if (obj.object instanceof fabric.Image) {
        obj.object.dispose();
      }

      setCanvasObjects((prev) => prev.filter((o) => o.id !== objectId));
      canvasRef.current.renderAll();
    }
  };

  /**
   * 選擇物件
   */
  const handleSelectObject = (objectId: string) => {
    if (!canvasRef.current) return;

    const obj = canvasObjects.find((o) => o.id === objectId);
    if (obj) {
      canvasRef.current.setActiveObject(obj.object);
      canvasRef.current.renderAll();
    }
  };

  /**
   * 處理下載
   */
  const handleDownload = () => {
    if (!canvasRef.current || canvasObjects.length === 0) {
      toast.error("畫布為空，無法下載！");
      setIsProcessing(false);
      processingToastId.current = undefined;
      return;
    }

    const hasVideo = canvasObjects.some((obj) => obj.type === "video");
    if (hasVideo) {
      // 驗證時長
      const duration = parseFloat(downloadDuration);
      if (isNaN(duration) || duration < 1 || duration > 30) {
        toast.error("請輸入 1-30 秒的有效時長");
        toast.dismiss(processingToastId.current);
        processingToastId.current = undefined;
        setIsProcessing(false);
        return;
      }

      // 驗證檔案名稱
      if (!downloadFileName || /[\\/:*?"<>|]/.test(downloadFileName)) {
        toast.error("檔案名稱無效，請避免特殊字元");
        toast.dismiss(processingToastId.current);
        setIsProcessing(false);
        processingToastId.current = undefined;
        return;
      }

      // 重置所有影片到 0
      canvasObjects.forEach((obj) => {
        if (obj.videoElement) {
          obj.videoElement.currentTime = 0;
          obj.videoElement.play().catch((error) => {
            console.error("重新播放失敗:", error);
          });
        }
      });

      // 開始錄製
      const canvasElement = canvasRef.current.getElement() as HTMLCanvasElement;
      const stream = canvasElement.captureStream(parseInt(downloadFps));
      const chunks: Blob[] = [];
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: "video/webm",
      });

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${downloadFileName}.webm`;
        a.click();
        URL.revokeObjectURL(url);

        // 恢復影片播放
        canvasObjects.forEach((obj) => {
          if (obj.videoElement && obj.videoElement.paused) {
            obj.videoElement.play().catch((error) => {
              console.error("恢復播放失敗:", error);
            });
          }
        });

        toast.dismiss(processingToastId.current);
        toast.success("下載成功！");
        processingToastId.current = undefined;
        setIsProcessing(false); // 錄製完成，隱藏 Spinner
      };

      mediaRecorderRef.current.start();
      setTimeout(() => {
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state !== "inactive"
        ) {
          mediaRecorderRef.current.stop();
        }
      }, duration * 1000);
    } else {
      // 驗證檔案名稱
      if (
        !downloadImageFileName ||
        /[\\/:*?"<>|]/.test(downloadImageFileName)
      ) {
        toast.error("檔案名稱無效，請避免特殊字元");
        toast.dismiss(processingToastId.current);
        processingToastId.current = undefined;
        setIsProcessing(false);
        return;
      }

      // 下載圖片
      let dataUrl: string;
      if (downloadImageFormat === "jpeg") {
        dataUrl = canvasRef.current!.toDataURL({
          format: "jpeg",
          quality: 0.8,
          multiplier: 1,
        });
      } else {
        dataUrl = canvasRef.current!.toDataURL({
          format: "png",
          multiplier: 1,
        });
      }

      if (dataUrl) {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${downloadImageFileName}.${downloadImageFormat}`;
        a.click();
        toast.dismiss(processingToastId.current);
        toast.success("下載成功！");
        processingToastId.current = undefined;
        setIsProcessing(false);
      }

      setIsProcessing(false); // 圖片下載完成，隱藏 Spinner
    }
  };

  /**
   * 驗證輸入並觸發下載
   */
  const validateAndDownload = () => {
    setIsProcessing(true);
    processingToastId.current = toast.loading("處理中...");
    handleDownload();
    setShowModal(false);
  };

  /**
   * 下載
   */
  const handleDownloadClick = () => {
    if (canvasRef.current) {
      canvasRef.current.discardActiveObject(); // 取消聚焦
      canvasRef.current.renderAll(); // 更新畫布
    }
    setShowModal(true); // 打開 Modal
  };

  /**
   * 改變畫布大小
   */
  const handleCanvasSizeChange = (width: number, height: number) => {
    if (canvasRef.current && containerRef.current) {
      const newWidth = width || containerRef.current.clientWidth;
      canvasRef.current.setDimensions({
        width: newWidth,
        height: height,
      });
      setCanvasSize({ width: newWidth, height });
      canvasRef.current.renderAll();
    }
  };

  /**
   * 添加文字
   */
  const handleAddText = () => {
    if (!textInput.trim() || !canvasRef.current) return;

    const text = new fabric.IText(textInput, {
      left: 100,
      top: 100,
      fontFamily: "Arial",
      fontSize: 30,
      fill: "#000000",
      selectable: true,
      hasControls: true,
      lockUniScaling: false,
      lockRotation: false,
      borderColor: "#3f51b5",
      cornerColor: "#3f51b5",
      cornerSize: 12,
      transparentCorners: false,
    });

    const objectId = `text-${Date.now()}`;
    text.set("data", { id: objectId });

    canvasRef.current.add(text);
    setCanvasObjects((prev) => [
      ...prev,
      {
        id: objectId,
        type: "text",
        object: text,
        textContent: textInput,
        canChangeColor: true,
        color: "#000000",
      },
    ]);

    setTextInput("");
    // 關閉下拉選單
    document.body.click();
  };

  /**
   * 選擇物件並打開顏色選擇器
   */
  const handleObjectClick = (obj: CanvasObject) => {
    if (!canvasRef.current) return;

    // 聚焦到選中的物件
    canvasRef.current.setActiveObject(obj.object);
    canvasRef.current.renderAll();

    // 如果是可以調整顏色的物件，打開顏色選擇器
    if (obj.canChangeColor) {
      setSelectedObject(obj);
      handleSelectObject(obj.id);
      setShowColorPicker(true);
    }
  };

  /**
   * 改變顏色
   */
  const handleColorChange = (color: string) => {
    if (!selectedObject || !canvasRef.current) return;

    // 更新物件的顏色
    selectedObject.object.set("fill", color);
    canvasRef.current.renderAll();

    // 更新狀態，包括 selectedObject 的顏色
    setCanvasObjects((prev) =>
      prev.map((obj) =>
        obj.id === selectedObject.id ? { ...obj, color } : obj
      )
    );

    // 更新 selectedObject 的顏色
    setSelectedObject((prev) => (prev ? { ...prev, color } : null));
  };

  return (
    <div className="container-fluid">
      <div
        className="row justify-content-center"
        style={{ paddingTop: "70px" }}
      >
        <div className="col-12 col-lg-10">
          <div className="card mb-4">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-start mb-3 w-100">
                <div
                  className="d-flex flex-wrap gap-2 me-2"
                  style={{ maxWidth: "calc(100% - 100px)" }}
                >
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-outline-primary text-nowrap"
                  >
                    <Upload size={16} className="me-1" />
                    上傳
                  </button>
                  <button
                    className="btn btn-outline-success text-nowrap"
                    disabled={canvasObjects.length === 0 || isProcessing}
                    onClick={handleDownloadClick}
                  >
                    <Download size={16} className="me-1" />
                    下載
                  </button>
                  <Dropdown as={ButtonGroup} className="text-nowrap">
                    <Button variant="outline-secondary" className="text-nowrap">
                      <ArrowsAngleExpand size={16} className="me-1" />
                      尺寸
                    </Button>
                    <Dropdown.Toggle
                      split
                      variant="outline-secondary"
                      id="canvas-size-dropdown"
                    />
                    <Dropdown.Menu>
                      <Dropdown.Header>常用尺寸</Dropdown.Header>
                      <Dropdown.Item
                        onClick={() => handleCanvasSizeChange(1080, 1920)}
                      >
                        Instagram 動態 (1080x1920)
                      </Dropdown.Item>
                      <Dropdown.Item
                        onClick={() => handleCanvasSizeChange(1080, 1350)}
                      >
                        Instagram 貼文 (1080x1350)
                      </Dropdown.Item>
                      <Dropdown.Item
                        onClick={() => handleCanvasSizeChange(1080, 1080)}
                      >
                        Instagram 方形 (1080x1080)
                      </Dropdown.Item>
                      <Dropdown.Item
                        onClick={() =>
                          handleCanvasSizeChange(
                            getInitialCanvasSize().width,
                            getInitialCanvasSize().height
                          )
                        }
                      >
                        初始化尺寸
                      </Dropdown.Item>
                      <Dropdown.Divider />
                      <Dropdown.Header>自訂</Dropdown.Header>
                      <div className="px-3 py-2">
                        <Form.Group className="mb-2">
                          <Form.Label className="small mb-1">
                            寬度 (px)
                          </Form.Label>
                          <Form.Control
                            type="number"
                            size="sm"
                            value={canvasSize.width}
                            onChange={(e) =>
                              handleCanvasSizeChange(
                                Number(e.target.value),
                                canvasSize.height
                              )
                            }
                          />
                        </Form.Group>
                        <Form.Group>
                          <Form.Label className="small mb-1">
                            高度 (px)
                          </Form.Label>
                          <Form.Control
                            type="number"
                            size="sm"
                            value={canvasSize.height}
                            onChange={(e) =>
                              handleCanvasSizeChange(
                                canvasSize.width,
                                Number(e.target.value)
                              )
                            }
                          />
                        </Form.Group>
                      </div>
                    </Dropdown.Menu>
                  </Dropdown>
                  {/* 在按鈕組中添加文字下拉按鈕 */}
                  <Dropdown as={ButtonGroup} className="text-nowrap">
                    <Button variant="outline-secondary" className="text-nowrap">
                      <Type size={16} className="me-1" /> 文字
                    </Button>
                    <Dropdown.Toggle
                      split
                      variant="outline-secondary"
                      id="text-dropdown"
                    />
                    <Dropdown.Menu className="p-3" style={{ width: "250px" }}>
                      <Form.Group>
                        <Form.Label className="small mb-2">輸入文字</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={3}
                          value={textInput}
                          onChange={(e) => setTextInput(e.target.value)}
                          placeholder="輸入要顯示的文字..."
                          className="mb-2"
                        />
                        <div className="d-grid">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleAddText}
                            disabled={!textInput.trim()}
                          >
                            確認
                          </Button>
                        </div>
                      </Form.Group>
                    </Dropdown.Menu>
                  </Dropdown>
                </div>
                <div className="flex-shrink-0">
                  <button
                    onClick={handleDelete}
                    disabled={!videoUrl}
                    className="btn btn-outline-danger text-nowrap"
                  >
                    <Trash size={16} className="me-1" />
                    清除
                  </button>
                </div>
              </div>

              <div className="d-flex justify-content-center">
                <div
                  ref={containerRef}
                  className="border rounded overflow-hidden d-inline-flex justify-content-center align-items-center"
                >
                  <canvas id="video-canvas"></canvas>
                </div>
              </div>
            </div>
          </div>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*,video/*"
          className="d-none"
        />
      </div>

      {/* 下載 Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>
            {canvasObjects.some((obj) => obj.type === "video")
              ? "下載影片"
              : "下載圖片"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {canvasObjects.some((obj) => obj.type === "video") ? (
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>影片格式</Form.Label>
                <Form.Select
                  value={downloadFormat}
                  onChange={(e) => setDownloadFormat(e.target.value)}
                >
                  <option value="webm">WebM</option>
                  {/* MP4 需要外部編碼，暫時禁用 */}
                  {/* <option value="mp4">MP4</option> */}
                </Form.Select>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>錄製幀率 (FPS)</Form.Label>
                <Form.Select
                  value={downloadFps}
                  onChange={(e) => setDownloadFps(e.target.value)}
                >
                  <option value="24">24 FPS</option>
                  <option value="30">30 FPS</option>
                  <option value="60">60 FPS</option>
                </Form.Select>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>錄製時長 (秒)</Form.Label>
                <Form.Range
                  min="1"
                  max="30"
                  value={downloadDuration}
                  onChange={(e) => setDownloadDuration(e.target.value)}
                />
                <div className="text-center mt-2">{downloadDuration} 秒</div>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>檔案名稱</Form.Label>
                <Form.Control
                  type="text"
                  value={downloadFileName}
                  onChange={(e) => setDownloadFileName(e.target.value)}
                />
              </Form.Group>
            </Form>
          ) : (
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>圖片格式</Form.Label>
                <Form.Select
                  value={downloadImageFormat}
                  onChange={(e) => setDownloadImageFormat(e.target.value)}
                >
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                </Form.Select>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>檔案名稱</Form.Label>
                <Form.Control
                  type="text"
                  value={downloadImageFileName}
                  onChange={(e) => setDownloadImageFileName(e.target.value)}
                />
              </Form.Group>
            </Form>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={validateAndDownload}
            disabled={isProcessing}
          >
            確認下載
          </Button>
        </Modal.Footer>
      </Modal>

      {/* 顏色選擇器 Modal */}
      <Modal show={showColorPicker} onHide={() => setShowColorPicker(false)}>
        <Modal.Header closeButton>
          <Modal.Title>調整顏色</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <ColorSelectorChrome
            value={selectedObject?.color || "#000000"}
            onChange={handleColorChange}
          />
        </Modal.Body>
      </Modal>

      {/* 浮動物件列表按鈕 */}
      <button
        style={{
          position: "fixed",
          left: `${floatingBtnPos.x}px`,
          top: `${floatingBtnPos.y}px`,
          zIndex: 999,
          borderRadius: "50%",
          width: "60px",
          height: "60px",
          fontSize: "24px",
          background: "#0d6efd",
          color: "#fff",
          border: "none",
          boxShadow: "0 2px 8px rgba(0,0,0,.2)",
          display: floatingBtnPos.x === -1000 ? "none" : "flex", // 初始定位前隱藏
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          cursor: "grab",
          touchAction: "none", // 防止觸控時捲動頁面
        }}
        onMouseDown={handleFloatingBtnDown}
        onTouchStart={handleFloatingBtnDown}
        onClick={() => {
          if (!isDraggingRef.current) {
            setShowObjectsModal(true);
          }
        }}
        title="物件列表"
      >
        <Kanban />
      </button>

      {/* 物件列表模態框 */}
      <Modal
        show={showObjectsModal}
        onHide={() => setShowObjectsModal(false)}
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>物件列表</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex flex-wrap gap-3">
            {canvasObjects.map((obj) => {
              let icon;
              let label;
              const textColor = obj.color || "#000000"; // 預設黑色

              switch (obj.type) {
                case "image":
                  icon = <Upload size={24} className="mb-2" />;
                  label = "圖片";
                  break;
                case "video":
                  icon = <Trash size={24} className="mb-2" />;
                  label = "影片";
                  break;
                case "text":
                  icon = <Type size={24} className="mb-2" />;
                  label = obj.textContent || "文字";
                  break;
                default:
                  icon = null;
                  label = "未知";
              }

              return (
                <div
                  key={obj.id}
                  className="position-relative"
                  style={{ width: "100px", cursor: "pointer" }}
                  onClick={() => handleObjectClick(obj)}
                >
                  <div
                    className="card h-100"
                    style={{
                      borderColor: obj.color || "transparent",
                      borderWidth: "2px",
                      transition: "all 0.2s",
                    }}
                  >
                    <div
                      className="card-body p-2 text-center"
                      style={{ color: textColor }}
                    >
                      {icon}
                      <div
                        className="small text-truncate"
                        style={{
                          color: textColor,
                          fontWeight: "bold",
                        }}
                      >
                        {label}
                      </div>
                    </div>
                  </div>
                  <button
                    className="position-absolute top-0 end-0 btn btn-sm btn-outline-danger p-0"
                    style={{
                      width: "24px",
                      height: "24px",
                      zIndex: 10,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveObject(obj.id);
                    }}
                  >
                    <XLg size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </Modal.Body>
      </Modal>
    </div>
  );
}
