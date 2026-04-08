"use client";
import React, { useRef, useState, useEffect } from "react";
import {
  Container,
  Row,
  Col,
  Form,
  Alert,
  OverlayTrigger,
  Popover,
} from "react-bootstrap";
import styles from "../styles/jsonFormat.module.css";
import { useJsonFormatStore } from "../store/useJsonFormatStore";
import { JsonViewer } from "./JsonViewer";

const JsonFormatPage: React.FC = () => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const {
    inputJson,
    outputJson,
    error,
    activeMode,
    setInput,
    setActiveMode,
    clearAll,
    setError,
  } = useJsonFormatStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  // Parse check for interactive viewer
  const isInteractiveViewerAvailable = (activeMode === "format" || activeMode === "sort") && !error;
  let parsedOutput = null;
  if (isInteractiveViewerAvailable && outputJson) {
    try {
      parsedOutput = JSON.parse(outputJson);
      // For pure strings or trivial roots, stick to textarea
      if (typeof parsedOutput !== "object" || parsedOutput === null) {
        parsedOutput = null;
      }
    } catch {
      parsedOutput = null;
    }
  }

  if (!isMounted) {
    return null; // 等待客戶端掛載完成，避免 Zustand persist 造成的 Hydration Mismatch
  }

  const handleCopy = () => {
    if (!outputJson) return;
    navigator.clipboard.writeText(outputJson).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        setInput(content);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err: any) {
        setError(`讀取檔案發生錯誤: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleDownload = () => {
    if (!outputJson) return;
    const blob = new Blob([outputJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "formatted.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const helpPopover = (
    <Popover id="help-popover" style={{ maxWidth: "350px" }}>
      <Popover.Header as="h3" style={{ fontSize: "14px", fontWeight: "bold" }}>
        功能說明
      </Popover.Header>
      <Popover.Body style={{ fontSize: "13px" }}>
        <ul
          style={{
            paddingLeft: "20px",
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          <li>
            <strong>格式化</strong>
            ：排版美化，支援自動去除註解與修正異常跳脫字串。
            <br />
            <span style={{ color: "#0d6efd", fontSize: "12px" }}>✨ 支援互動式折疊檢視</span>
          </li>
          <li>
            <strong>轉 TypeScript</strong>：一鍵將 JSON 結構轉為 TypeScript
            Interface。
          </li>
          <li>
            <strong>屬性排序 A-Z</strong>：自動依英文字母順序遞迴重排所有的鍵
            (Key)。
            <br />
            <span style={{ color: "#0d6efd", fontSize: "12px" }}>✨ 支援互動式折疊檢視</span>
          </li>
          <li>
            <strong>轉義</strong>：轉換為帶有反斜線跳脫的純文字字串格式。
          </li>
          <li>
            <strong>壓縮</strong>：移除所有空白與換行，壓縮為單行最小體積。
          </li>
        </ul>
        <div
          className="mt-2 text-muted"
          style={{
            fontSize: "12px",
            borderTop: "1px solid #dee2e6",
            paddingTop: "6px",
          }}
        >
          💡 會自動儲存您目前的輸入狀態哦！
        </div>
      </Popover.Body>
    </Popover>
  );

  return (
    <Container className={styles.container} fluid="lg">
      <Row className="mb-2">
        <Col xs={12} className="d-flex align-items-center">
          <h2 className="mb-0" style={{ fontSize: "28px", fontWeight: "700" }}>
            JSON 格式化工具
          </h2>
          <OverlayTrigger
            trigger={["hover", "focus"]}
            placement="right"
            overlay={helpPopover}
          >
            <div
              style={{ display: "inline-flex", cursor: "help", padding: "4px" }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                fill="currentColor"
                viewBox="0 0 16 16"
                style={{ color: "#6c757d", marginLeft: "4px" }}
              >
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16" />
                <path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286m1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94" />
              </svg>
            </div>
          </OverlayTrigger>
        </Col>
      </Row>

      <Row className={styles.actionRow}>
        <Col>
          <div className={styles.modeButtonGroup}>
            <button
              className={`${styles.modeButton} ${activeMode === "format" ? styles.active : ""}`}
              onClick={() => setActiveMode("format")}
              disabled={!inputJson}
            >
              格式化
            </button>
            <button
              className={`${styles.modeButton} ${activeMode === "typescript" ? styles.active : ""}`}
              onClick={() => setActiveMode("typescript")}
              disabled={!inputJson}
            >
              轉 TypeScript
            </button>
            <button
              className={`${styles.modeButton} ${activeMode === "sort" ? styles.active : ""}`}
              onClick={() => setActiveMode("sort")}
              disabled={!inputJson}
            >
              屬性排序 A-Z
            </button>
            <button
              className={`${styles.modeButton} ${activeMode === "escape" ? styles.active : ""}`}
              onClick={() => setActiveMode("escape")}
              disabled={!inputJson}
            >
              轉義
            </button>
            <button
              className={`${styles.modeButton} ${activeMode === "minify" ? styles.active : ""}`}
              onClick={() => setActiveMode("minify")}
              disabled={!inputJson}
            >
              壓縮
            </button>
          </div>
        </Col>
      </Row>

      {error && (
        <Row>
          <Col>
            <Alert
              variant="danger"
              className={styles.errorAlert}
              dismissible
              onClose={() => setError(null)}
            >
              {error}
            </Alert>
          </Col>
        </Row>
      )}

      <Row>
        {/* 輸入區 */}
        <Col xs={12} md={6} className="mb-4 mb-md-0">
          <div className={styles.labelWrapper}>
            <label className={styles.label}>輸入</label>
            <div className="d-flex gap-2">
              <button
                className={`${styles.actionBtn} ${styles.primaryBtn}`}
                onClick={() => fileInputRef.current?.click()}
              >
                上傳檔案
              </button>
              <input
                type="file"
                accept=".json,text/plain"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
            </div>
          </div>
          <div className={styles.textareaWrapper}>
            <Form.Control
              as="textarea"
              className={`${styles.textarea} ${styles.textareaInput}`}
              value={inputJson}
              onChange={(e) => setInput(e.target.value)}
              placeholder="請在此貼上 JSON 內容..."
              spellCheck={false}
            />
            {(inputJson || outputJson) && (
              <button
                className={styles.clearFloatBtn}
                onClick={clearAll}
                title="清空所有內容"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" style={{ marginRight: '4px' }}>
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
                </svg>
                清空
              </button>
            )}
          </div>
        </Col>

        {/* 輸出區 */}
        <Col xs={12} md={6}>
          <div className={styles.labelWrapper}>
            <label className={styles.label}>結果</label>
            <div className="d-flex gap-2">
              <button
                className={styles.actionBtn}
                onClick={handleDownload}
                disabled={!outputJson}
              >
                下載檔案
              </button>
              <button
                className={`${styles.actionBtn} ${copied ? styles.successBtn : ""}`}
                onClick={handleCopy}
                disabled={!outputJson}
              >
                {copied ? "已複製!" : "一鍵複製"}
              </button>
            </div>
          </div>
          {parsedOutput ? (
            <JsonViewer data={parsedOutput} />
          ) : (
            <Form.Control
              as="textarea"
              className={`${styles.textarea} ${styles.textareaOutput}`}
              value={outputJson}
              readOnly
              placeholder="結果將顯示於此..."
              spellCheck={false}
            />
          )}
        </Col>
      </Row>
    </Container>
  );
};

export default JsonFormatPage;
