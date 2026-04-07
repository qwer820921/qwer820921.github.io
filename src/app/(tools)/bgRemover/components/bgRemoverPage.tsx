"use client";

import React, { useState, useRef } from "react";
import {
  Container,
  Row,
  Col,
  Button,
  Card,
  Spinner,
  Alert,
} from "react-bootstrap";
import * as imgly from "@imgly/background-removal";
import styles from "../styles/bgRemover.module.css";

const BgRemoverPage: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = async (file: File) => {
    // 重置狀態
    setError(null);
    setProcessedImage(null);
    setProgress(0);

    // 預覽原始圖片
    const url = URL.createObjectURL(file);
    setOriginalImage(url);

    setIsProcessing(true);
    setStatus("正在載入 AI 模型...");

    try {
      // 執行去背
      const resultBlob = await imgly.removeBackground(
        file as any,
        {
          debug: true,
          progress: (step: string, current: number, total: number) => {
            const percent = Math.round((current / total) * 100);
            setProgress(percent);
            setStatus(step);
          },
        } as any
      );

      const processedUrl = URL.createObjectURL(resultBlob);
      setProcessedImage(processedUrl);
      setStatus("完成！");
    } catch (err) {
      console.error("Background removal error:", err);
      setError(
        "去背過程中發生錯誤。請確認您的瀏覽器支援 SharedArrayBuffer，且網路連線正常。"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!processedImage) return;
    const link = document.createElement("a");
    link.href = processedImage;
    link.download = `bg-removed-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const reset = () => {
    setOriginalImage(null);
    setProcessedImage(null);
    setProgress(0);
    setStatus("");
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Container className={styles.container}>
      <Row className="justify-content-center mb-5">
        <Col lg={8} className="text-center">
          <h1 className={`display-4 mb-3 ${styles.featureTitle}`}>
            AI 圖片去背
          </h1>
        </Col>
      </Row>

      <Row className="justify-content-center">
        <Col lg={10}>
          {!originalImage ? (
            <Card className={styles.card}>
              <div
                className={styles.uploadArea}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add(styles.uploadAreaActive);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove(styles.uploadAreaActive);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove(styles.uploadAreaActive);
                  const file = e.dataTransfer.files[0];
                  if (file && file.type.startsWith("image/")) {
                    processFile(file);
                  }
                }}
              >
                <div className={styles.uploadIcon}>
                  <i className="bi bi-cloud-arrow-up"></i>
                </div>
                <h3>點擊或拖拽圖片至此</h3>
                <p className="text-muted">支援 PNG, JPG, WebP 格式</p>
                <Button variant="primary" className="mt-3 px-4 py-2">
                  選擇檔案
                </Button>
                <input
                  type="file"
                  hidden
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileSelect}
                />
              </div>
            </Card>
          ) : (
            <Card className={`${styles.card} p-4`}>
              <div className={styles.comparisonView}>
                <div>
                  <span className={styles.label}>原始圖片</span>
                  <div className={styles.previewWrapper}>
                    <img
                      src={originalImage}
                      alt="Original"
                      className={styles.previewImage}
                    />
                  </div>
                </div>

                <div>
                  <span className={styles.label}>去背結果</span>
                  <div className={styles.previewWrapper}>
                    {processedImage ? (
                      <img
                        src={processedImage}
                        alt="Result"
                        className={styles.previewImage}
                      />
                    ) : (
                      <div
                        className="d-flex align-items-center justify-content-center h-100 min-vh-50"
                        style={{ minHeight: "200px" }}
                      >
                        <div className="text-center">
                          <Spinner animation="border" variant="primary" />
                          <div className="mt-3 text-muted">正在處理...</div>
                        </div>
                      </div>
                    )}

                    {isProcessing && (
                      <div className={styles.loadingOverlay}>
                        <Spinner animation="border" variant="primary" />
                        <div className="mt-3 fw-bold">{status}</div>
                        <div className={styles.progressBarContainer}>
                          <div
                            className={styles.progressBar}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="mt-1 small text-muted">{progress}%</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {error && (
                <Alert variant="danger" className="mt-4">
                  {error}
                </Alert>
              )}

              <div className={styles.actionButtons}>
                <Button
                  variant="outline-secondary"
                  onClick={reset}
                  disabled={isProcessing}
                >
                  重新選擇
                </Button>
                <Button
                  variant="primary"
                  disabled={!processedImage || isProcessing}
                  onClick={handleDownload}
                >
                  <i className="bi bi-download me-2"></i>
                  下載透明 PNG
                </Button>
              </div>
            </Card>
          )}

          <Card className="mt-5 border-0 bg-light p-4 rounded-4">
            <h4>💡 小撇步</h4>
            <ul className="mb-0">
              <li>
                第一次使用時，瀏覽器會下載 AI 模型（約 40~70 MB），請耐心等候。
              </li>
              <li>所有處理都在您的本機完成，圖片不會外流，安全無虞。</li>
              <li>
                若遇到無法載入的問題，請確認瀏覽器的 **Cross-Origin Isolation**
                已正常啟用（頁面重新整理通常能解決）。
              </li>
            </ul>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default BgRemoverPage;
