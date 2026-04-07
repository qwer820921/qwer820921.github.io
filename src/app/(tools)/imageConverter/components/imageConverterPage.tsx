"use client";
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Button,
  Badge,
  ProgressBar,
} from "react-bootstrap";
import styles from "../styles/imageConverter.module.css";
import {
  OutputFormat,
  UploadItem,
  ConvertedItem,
  ConvertSettings,
  FORMAT_EXTENSIONS,
  FORMAT_LABELS,
  ACCEPTED_INPUT_TYPES,
  checkAvifSupport,
  generateId,
  formatFileSize,
  getFormatLabel,
  isHeicFile,
} from "../types";
import { wrapPngToIco, getIcoTargetSize } from "../utils/icoUtils";

const ImageConverterPage: React.FC = () => {
  // 上傳列表
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  // 轉換設定
  const [settings, setSettings] = useState<ConvertSettings>({
    targetFormat: "image/webp",
    quality: 0.85,
  });

  // AVIF 支援
  const [avifSupported, setAvifSupported] = useState(false);

  // 轉換結果
  const [results, setResults] = useState<ConvertedItem[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState(0);

  // 拖曳狀態
  const [isDragging, setIsDragging] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 檢測 AVIF 支援
  useEffect(() => {
    checkAvifSupport().then(setAvifSupported);
  }, []);

  /** 將 HEIC 檔案轉為 Blob */
  const convertHeicToBlob = useCallback(async (file: File): Promise<Blob> => {
    const heic2any = (await import("heic2any")).default;
    const result = await heic2any({
      blob: file,
      toType: "image/png",
      quality: 1,
    });
    return Array.isArray(result) ? result[0] : result;
  }, []);

  /** 載入圖片取得尺寸 */
  const getImageDimensions = (
    url: string
  ): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () =>
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("圖片載入失敗"));
      img.src = url;
    });
  };

  /** 批次處理上傳的檔案 */
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter(
        (f) => f.type.startsWith("image/") || isHeicFile(f)
      );
      if (fileArray.length === 0) return;

      // 清除舊結果
      results.forEach((r) => URL.revokeObjectURL(r.resultUrl));
      setResults([]);

      for (const file of fileArray) {
        const id = generateId();

        // 先加入列表（顯示 loading）
        const isHeic = isHeicFile(file);
        const placeholderItem: UploadItem = {
          id,
          file,
          previewUrl: "",
          format: isHeic ? "HEIC" : getFormatLabel(file.type),
          width: 0,
          height: 0,
          size: file.size,
          isLoading: isHeic,
        };
        setUploads((prev) => [...prev, placeholderItem]);

        try {
          let blob: Blob = file;
          if (isHeic) {
            blob = await convertHeicToBlob(file);
          }

          const previewUrl = URL.createObjectURL(blob);
          const dims = await getImageDimensions(previewUrl);

          setUploads((prev) =>
            prev.map((item) =>
              item.id === id
                ? {
                    ...item,
                    previewUrl,
                    width: dims.width,
                    height: dims.height,
                    size: file.size,
                    isLoading: false,
                  }
                : item
            )
          );
        } catch (err) {
          console.error("處理檔案失敗:", err);
          // 移除失敗的項目
          setUploads((prev) => prev.filter((item) => item.id !== id));
        }
      }
    },
    [results, convertHeicToBlob]
  );

  /** 移除單張圖片 */
  const removeUpload = useCallback((id: string) => {
    setUploads((prev) => {
      const item = prev.find((u) => u.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((u) => u.id !== id);
    });
  }, []);

  /** 清除全部上傳 */
  const clearAllUploads = useCallback(() => {
    uploads.forEach((u) => {
      if (u.previewUrl) URL.revokeObjectURL(u.previewUrl);
    });
    results.forEach((r) => URL.revokeObjectURL(r.resultUrl));
    setUploads([]);
    setResults([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [uploads, results]);

  /** 拖曳事件 */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles]
  );

  /** 批次轉換 */
  const handleConvertAll = useCallback(async () => {
    const validUploads = uploads.filter((u) => u.previewUrl && !u.isLoading);
    if (validUploads.length === 0) return;

    setIsConverting(true);
    setConvertProgress(0);

    // 清除舊結果
    results.forEach((r) => URL.revokeObjectURL(r.resultUrl));
    const newResults: ConvertedItem[] = [];

    const isIco = settings.targetFormat === "image/x-icon";
    const isPdf = settings.targetFormat === "application/pdf";

    for (let i = 0; i < validUploads.length; i++) {
      const upload = validUploads[i];

      try {
        const img = new Image();
        img.crossOrigin = "anonymous";

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("圖片載入失敗"));
          img.src = upload.previewUrl;
        });

        const canvas = canvasRef.current;
        if (!canvas) continue;

        // 特殊處理：ICO 限制尺寸 256x256
        let targetWidth = img.naturalWidth;
        let targetHeight = img.naturalHeight;

        if (isIco) {
          const icoSize = getIcoTargetSize(targetWidth, targetHeight);
          targetWidth = icoSize.width;
          targetHeight = icoSize.height;
        }

        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        ctx.clearRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        let blob: Blob | null = null;

        if (isPdf) {
          // PDF 處理
          const { jsPDF } = await import("jspdf");
          // 根據尺寸決定 PDF 方向
          const orientation = targetWidth > targetHeight ? "l" : "p";
          const pdf = new jsPDF({
            orientation,
            unit: "px",
            format: [targetWidth, targetHeight],
          });

          // 將畫布轉為高品質 JPEG 嵌入 PDF
          const imgData = canvas.toDataURL("image/jpeg", settings.quality);
          pdf.addImage(imgData, "JPEG", 0, 0, targetWidth, targetHeight);
          blob = pdf.output("blob");
        } else {
          // 一般圖片處理 (PNG, JPEG, WebP, AVIF, BMP)
          const convertFormat = isIco ? "image/png" : settings.targetFormat;
          const qualityParam =
            settings.targetFormat === "image/png" ||
            isIco ||
            settings.targetFormat === "image/bmp"
              ? undefined
              : settings.quality;

          blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, convertFormat, qualityParam);
          });

          // 如果是 ICO，進行二次包裝
          if (blob && isIco) {
            blob = await wrapPngToIco(blob);
          }
        }

        if (blob) {
          const ext = FORMAT_EXTENSIONS[settings.targetFormat];
          const baseName = upload.file.name.replace(/\.[^.]+$/, "");
          const resultUrl = URL.createObjectURL(blob);

          newResults.push({
            sourceId: upload.id,
            sourceName: upload.file.name,
            sourceFormat: upload.format,
            sourceSize: upload.size,
            sourceWidth: upload.width,
            sourceHeight: upload.height,
            resultUrl,
            resultName: `${baseName}${ext}`,
            resultFormat: FORMAT_LABELS[settings.targetFormat],
            resultSize: blob.size,
            resultWidth: targetWidth,
            resultHeight: targetHeight,
          });
        }
      } catch (err) {
        console.error(`轉換 ${upload.file.name} 失敗:`, err);
      }

      setConvertProgress(Math.round(((i + 1) / validUploads.length) * 100));
    }

    setResults(newResults);
    setIsConverting(false);
  }, [uploads, settings, results]);

  const [isZipping, setIsZipping] = useState(false);

  /** 下載單張 */
  const handleDownloadOne = useCallback((item: ConvertedItem) => {
    const a = document.createElement("a");
    a.href = item.resultUrl;
    a.download = item.resultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  /** 批次下載全部 (ZIP 打包) */
  const handleDownloadAll = useCallback(async () => {
    if (results.length === 0) return;

    setIsZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      // 將所有結果加入 ZIP
      for (const item of results) {
        const response = await fetch(item.resultUrl);
        const blob = await response.blob();
        zip.file(item.resultName, blob);
      }

      // 產生 ZIP 檔案
      const content = await zip.generateAsync({ type: "blob" });
      const zipUrl = URL.createObjectURL(content);

      // 下載 ZIP
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const a = document.createElement("a");
      a.href = zipUrl;
      a.download = `converted_images_${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // 釋放記憶體
      setTimeout(() => URL.revokeObjectURL(zipUrl), 60000);
    } catch (err) {
      console.error("打包 ZIP 失敗:", err);
      alert("打包失敗，請嘗試單獨下載圖片");
    } finally {
      setIsZipping(false);
    }
  }, [results]);

  /** 品質滑桿是否顯示 */
  const showQuality =
    settings.targetFormat !== "image/png" &&
    settings.targetFormat !== "image/x-icon" &&
    settings.targetFormat !== "image/bmp";

  /** 可用的輸出格式清單 */
  const availableOutputFormats = (
    Object.entries(FORMAT_LABELS) as [OutputFormat, string][]
  ).filter(([value]) => {
    if (value === "image/avif" && !avifSupported) return false;
    return true;
  });

  const hasUploads = uploads.length > 0;
  const readyCount = uploads.filter((u) => !u.isLoading && u.previewUrl).length;

  return (
    <Container className={styles.container}>
      {/* 標題區 */}
      <Row className="mb-4">
        <Col xs={12}>
          <h1 className="mb-2">圖檔轉檔</h1>
          <p className="text-muted mb-0">
            線上批次圖片格式轉換工具，支援 PNG、JPEG、WebP、AVIF、HEIC、SVG、ICO、BMP
          </p>
          <div className="d-flex flex-wrap gap-2 mt-2">
            <Badge bg="success" className={styles.privacyBadge}>
              純瀏覽器端處理，圖片不會上傳至伺服器
            </Badge>
            {avifSupported && (
              <Badge bg="info" className={styles.privacyBadge}>
                此瀏覽器支援 AVIF 輸出
              </Badge>
            )}
          </div>
        </Col>
      </Row>

      {/* ===== 區塊一：上傳 + 設定 ===== */}
      <Row className="mb-4 align-items-stretch">
        {/* 左側：整合上傳區 + 縮圖網格 */}
        <Col xs={12} md={8} className="mb-3 mb-md-0 d-flex flex-column">
          <div
            className={`${styles.dropZone} ${
              hasUploads ? styles.dropZoneHasContent : styles.dropZoneEmpty
            } ${isDragging ? styles.dropZoneDragging : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {/* 隱藏的 Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_INPUT_TYPES}
              className={styles.hiddenInput}
              onChange={handleFileInputChange}
              multiple
            />

            {!hasUploads ? (
              /* 空白狀態 */
              <div className={styles.dropZoneContent}>
                <div className={styles.dropZoneIcon}>📁</div>
                <div className={styles.dropZoneText}>
                  拖曳圖片到此處，或點擊選擇檔案
                </div>
                <div className={styles.dropZoneSubText}>
                  支援多選 · PNG、JPEG、WebP、AVIF、HEIC、SVG、ICO、BMP
                </div>
              </div>
            ) : (
              /* 已有圖片狀態：顯示網格 */
              <div className="w-100">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <Badge bg="primary">已選擇 {uploads.length} 張圖片</Badge>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-danger p-0 text-decoration-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearAllUploads();
                    }}
                  >
                    全部清除
                  </Button>
                </div>

                <div className={styles.thumbnailGrid}>
                  {uploads.map((item) => (
                    <div
                      key={item.id}
                      className={styles.thumbnailCard}
                      onClick={(e) => e.stopPropagation()} // 防止點擊卡片觸發上傳
                    >
                      {/* 刪除按鈕 */}
                      <button
                        className={styles.thumbnailRemove}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeUpload(item.id);
                        }}
                        title="移除"
                      >
                        ×
                      </button>

                      {/* 預覽圖 */}
                      <div className={styles.thumbnailImageWrapper}>
                        {item.isLoading || !item.previewUrl ? (
                          <div className="spinner-border spinner-border-sm text-primary" />
                        ) : (
                          <img
                            src={item.previewUrl}
                            alt={item.file.name}
                            className={styles.thumbnailImage}
                          />
                        )}
                      </div>

                      {/* 檔案資訊 */}
                      <div className={styles.thumbnailInfo}>
                        <span className={styles.thumbnailSize}>
                          {formatFileSize(item.size)}
                        </span>
                        {item.width > 0 && (
                          <span className={styles.thumbnailDim}>
                            {item.width}x{item.height}
                          </span>
                        )}
                      </div>
                      <div className={styles.thumbnailMeta}>
                        <span
                          className={styles.thumbnailName}
                          title={item.file.name}
                        >
                          {item.file.name}
                        </span>
                        <Badge
                          bg={
                            item.format === "HEIC" || item.format === "SVG"
                              ? "warning"
                              : "secondary"
                          }
                          text={
                            item.format === "HEIC" || item.format === "SVG"
                              ? "dark"
                              : undefined
                          }
                          className={styles.thumbnailFormatBadge}
                        >
                          {item.format}
                        </Badge>
                      </div>
                    </div>
                  ))}

                  {/* 新增圖片按鈕卡片 */}
                  <div
                    className={`${styles.thumbnailCard} d-flex flex-column align-items-center justify-content-center border-dashed`}
                    style={{
                      minHeight: "160px",
                      borderStyle: "dashed",
                      cursor: "pointer",
                      backgroundColor: "#fcfcfc",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    <div className="fs-2 text-primary">+</div>
                    <div className="small text-muted">新增圖片</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Col>

        {/* 右側：設定面板 */}
        <Col xs={12} md={4} className="d-flex flex-column">
          <Card className={`${styles.settingsCard} h-100`}>
            <Card.Header as="h6" className="fw-bold">
              匯出設定
            </Card.Header>
            <Card.Body>
              {/* 目標格式 */}
              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold">匯出格式</Form.Label>
                {availableOutputFormats.map(([value, label]) => (
                  <Form.Check
                    key={value}
                    type="radio"
                    id={`format-${label}`}
                    name="targetFormat"
                    label={
                      <span>
                        {label}
                        {value === "image/avif" && (
                          <Badge
                            bg="info"
                            className="ms-2"
                            style={{ fontSize: "0.7rem" }}
                          >
                            新一代
                          </Badge>
                        )}
                      </span>
                    }
                    value={value}
                    checked={settings.targetFormat === value}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        targetFormat: e.target.value as OutputFormat,
                      }))
                    }
                  />
                ))}
              </Form.Group>

              {/* 品質滑桿 */}
              {showQuality && (
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold">輸出品質</Form.Label>
                  <div className="d-flex align-items-center gap-2">
                    <Form.Range
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={settings.quality}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          quality: parseFloat(e.target.value),
                        }))
                      }
                    />
                    <span className={styles.qualityValue}>
                      {Math.round(settings.quality * 100)}%
                    </span>
                  </div>
                </Form.Group>
              )}

              {/* 開始轉換按鈕 */}
              <div className="d-grid">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleConvertAll}
                  disabled={isConverting || readyCount === 0}
                >
                  {isConverting ? "轉換中..." : `開始轉換 (${readyCount} 張)`}
                </Button>
              </div>

              {/* 轉換進度 */}
              {isConverting && (
                <ProgressBar
                  now={convertProgress}
                  label={`${convertProgress}%`}
                  animated
                  className="mt-3"
                />
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* ===== 區塊二：轉換結果 ===== */}
      {results.length > 0 && (
        <div className={styles.fadeIn}>
          <Row className="mb-3">
            <Col
              xs={12}
              className="d-flex justify-content-between align-items-center"
            >
              <h5 className="mb-0">
                轉換結果
                <Badge bg="secondary" className="ms-2">
                  {results.length}
                </Badge>
              </h5>
              <Button
                variant="success"
                onClick={handleDownloadAll}
                disabled={isZipping}
              >
                {isZipping ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    打包中...
                  </>
                ) : (
                  "⬇ 全部下載 (ZIP)"
                )}
              </Button>
            </Col>
          </Row>

          <Row className="g-3 mb-4">
            {results.map((item) => {
              const diff = item.resultSize - item.sourceSize;
              const percent = Math.round((diff / item.sourceSize) * 100);

              return (
                <Col xs={12} sm={6} lg={4} key={item.sourceId}>
                  <Card className={styles.resultCard}>
                    {/* 預覽圖 */}
                    <div className={styles.resultImageWrapper}>
                      <img
                        src={item.resultUrl}
                        alt={item.resultName}
                        className={styles.resultImage}
                      />
                    </div>

                    <Card.Body className="p-2">
                      {/* 箭頭對比 */}
                      <div className={styles.compareContainer}>
                        <span className={styles.compareLeft}>
                          {formatFileSize(item.sourceSize)}
                        </span>
                        <span className={styles.compareArrow}>→</span>
                        <span className={styles.compareRight}>
                          {formatFileSize(item.resultSize)}
                        </span>

                        <span className={styles.compareLeft}>
                          {item.sourceFormat}
                        </span>
                        <span className={styles.compareArrow}>→</span>
                        <span className={styles.compareRight}>
                          <span className={styles.compareFormatBadge}>
                            {item.resultFormat}
                          </span>
                        </span>
                      </div>

                      {/* 百分比 */}
                      <div className="text-center mb-2">
                        <span
                          className={
                            diff < 0
                              ? styles.fileSizeReduced
                              : diff > 0
                                ? styles.fileSizeIncreased
                                : ""
                          }
                          style={{ fontSize: "0.85rem" }}
                        >
                          {percent > 0 ? "+" : ""}
                          {percent}%
                        </span>
                      </div>

                      {/* 檔名 */}
                      <div
                        className={styles.resultFileName}
                        title={item.resultName}
                      >
                        {item.resultName}
                      </div>

                      {/* 下載 */}
                      <div className="d-grid mt-2">
                        <Button
                          variant="outline-success"
                          size="sm"
                          onClick={() => handleDownloadOne(item)}
                        >
                          ⬇ 下載
                        </Button>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </div>
      )}

      {/* 隱藏 Canvas */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </Container>
  );
};

export default ImageConverterPage;
