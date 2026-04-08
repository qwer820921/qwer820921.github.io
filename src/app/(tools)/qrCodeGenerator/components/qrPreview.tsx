"use client";
import React, { useEffect, useState, useRef } from "react";
import { Button, Form, InputGroup } from "react-bootstrap";
import QRCodeStyling from "qr-code-styling";
import { useQRStore } from "../store/useQRStore";
import { updateDynamicQRCode } from "../services/qrApi";
import styles from "../styles/qrCodeGenerator.module.css";

export const QRPreview: React.FC = () => {
  const { finalEncodedText, styleOptions, isDynamic, dynamicInfo } =
    useQRStore();

  // Dynamic update specific states
  const [updateUrl, setUpdateUrl] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");

  const qrRef = useRef<HTMLDivElement>(null);
  const qrCodeInstance = useRef<QRCodeStyling | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!finalEncodedText || finalEncodedText.trim() === "") {
      if (qrRef.current) qrRef.current.innerHTML = "";
      return;
    }

    const renderQR = () => {
      try {
        const options: any = {
          width: styleOptions.size,
          height: styleOptions.size,
          type: "canvas",
          data: finalEncodedText,
          margin: styleOptions.margin,
          qrOptions: {
            errorCorrectionLevel: styleOptions.correctLevel,
          },
          imageOptions: {
            crossOrigin: "anonymous",
            margin: styleOptions.logoMargin || 5,
          },
          dotsOptions: {
            color: styleOptions.dotsColor,
            type: styleOptions.dotsType,
          },
          backgroundOptions: {
            color: styleOptions.backgroundColor,
          },
          cornersSquareOptions: {
            color: styleOptions.cornersSquareColor,
            type: styleOptions.cornersSquareType,
          },
        };

        if (styleOptions.logoImage) {
          options.image = styleOptions.logoImage;
        }

        if (!qrCodeInstance.current) {
          qrCodeInstance.current = new QRCodeStyling(options);
          if (qrRef.current) {
            qrRef.current.innerHTML = "";
            qrCodeInstance.current.append(qrRef.current);
          }
        } else {
          qrCodeInstance.current.update(options);
        }

        // --- 強制縮放邏輯 [IMPORTANT] ---
        // 直接對產出的 canvas/svg 進行樣式壓制
        if (qrRef.current) {
          const children = qrRef.current.querySelectorAll("canvas, svg, img");
          children.forEach((child: any) => {
            child.style.maxWidth = "100%";
            child.style.height = "auto";
            child.style.display = "block";
          });
        }
      } catch (err) {
        console.error("QR Code rendering failed:", err);
      }
    };

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      renderQR();
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [finalEncodedText, styleOptions]);

  const handleDownload = () => {
    if (!qrCodeInstance.current) return;
    qrCodeInstance.current.download({
      name: `qrcode_${Date.now()}`,
      extension: "png",
    });
  };

  const handleUpdateTarget = async () => {
    if (!dynamicInfo || !updateUrl) return;
    setIsUpdating(true);
    setUpdateMsg("");
    try {
      const res = await updateDynamicQRCode(dynamicInfo.shortId, updateUrl);
      if (res.success) {
        setUpdateMsg("網址更新成功！實體條碼立刻生效。");
      }
    } catch {
      setUpdateMsg("更新失敗，請稍後再試。");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={styles.previewContainer}>
      <div
        className={styles.qrCanvasWrapper}
        style={{
          width: "100%",
          maxWidth: "400px", // 稍微調小一點，外觀更精緻
          margin: "0 auto",
          overflow: "hidden",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          aspectRatio: "1/1",
          background: "#fff",
          borderRadius: "8px",
          border: "1px solid #eee",
        }}
      >
        <div ref={qrRef} style={{ width: "100%" }} />
      </div>

      {!finalEncodedText && (
        <div className="text-muted mt-3">請在左側輸入資料以產生 QR Code</div>
      )}

      {finalEncodedText && (
        <Button
          variant="outline-primary"
          className="mt-4"
          onClick={handleDownload}
          style={{ width: "200px" }}
        >
          下載 PNG 圖檔
        </Button>
      )}

      {/* Dynamic Info 面板 */}
      {isDynamic && dynamicInfo && (
        <div className={styles.dynamicAlert + " w-100 mt-4"}>
          <h6 className="fw-bold mb-2">⚡ 動態追蹤碼已建立</h6>
          <p className="mb-1 small">
            短網址：
            <a href={dynamicInfo.shortUrl} target="_blank" rel="noreferrer">
              {dynamicInfo.shortUrl}
            </a>
          </p>
          <hr style={{ opacity: 0.2 }} />
          <InputGroup size="sm">
            <Form.Control
              placeholder="更新目標網址..."
              value={updateUrl}
              onChange={(e) => setUpdateUrl(e.target.value)}
            />
            <Button
              variant="primary"
              onClick={handleUpdateTarget}
              disabled={isUpdating || !updateUrl}
            >
              套用
            </Button>
          </InputGroup>
          {updateMsg && (
            <div className="mt-2 small text-success fw-bold">{updateMsg}</div>
          )}
        </div>
      )}
    </div>
  );
};
