"use client";
import React, { useEffect, useState, useRef } from "react";
import { Button, Spinner, Form, InputGroup } from "react-bootstrap";
import QRCodeStyling from "qr-code-styling";
import { useQRStore } from "../store/useQRStore";
import { updateDynamicQRCode } from "../services/qrApi";
import styles from "../styles/qrCodeGenerator.module.css";

export const QRPreview: React.FC = () => {
  const { finalEncodedText, styleOptions, isDynamic, dynamicInfo } = useQRStore();
  const [isRendering, setIsRendering] = useState(false);
  
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
      setIsRendering(true);
      try {
        const options: any = {
          width: styleOptions.size,
          height: styleOptions.size,
          type: "canvas",
          data: finalEncodedText,
          margin: styleOptions.margin,
          qrOptions: {
            errorCorrectionLevel: styleOptions.correctLevel
          },
          imageOptions: {
            crossOrigin: "anonymous",
            margin: styleOptions.logoMargin || 5
          },
          dotsOptions: {
            color: styleOptions.dotsColor,
            type: styleOptions.dotsType
          },
          backgroundOptions: {
            color: styleOptions.backgroundColor,
          },
          cornersSquareOptions: {
            color: styleOptions.cornersSquareColor,
            type: styleOptions.cornersSquareType
          }
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
      } catch (err) {
        console.error("QR Code rendering failed:", err);
      } finally {
        setIsRendering(false);
      }
    };

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      renderQR();
    }, 300); // 300ms debounce on input

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [finalEncodedText, styleOptions]);

  const handleDownload = () => {
    if (!qrCodeInstance.current) return;
    qrCodeInstance.current.download({ name: `qrcode_${Date.now()}`, extension: "png" });
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
    } catch (e: any) {
      setUpdateMsg(`更新失敗: ${e.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={styles.previewContainer}>
      <div 
        ref={qrRef} 
        style={{ 
          maxWidth: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center"
        }}
      />
      
      {!finalEncodedText && (
        <div className="text-muted">請在左側輸入資料以產生 QR Code</div>
      )}

      {finalEncodedText && (
        <Button variant="outline-primary" className="mt-4" onClick={handleDownload} style={{ width: "250px" }}>
          下載 PNG 圖檔
        </Button>
      )}

      {/* Dynamic Info 直出面板 */}
      {isDynamic && dynamicInfo && (
        <div className={styles.dynamicAlert + " w-100"}>
          <h6 className="fw-bold mb-2">⚡ 動態追蹤碼已建立</h6>
          <p className="mb-1 small">
            短網址：<a href={dynamicInfo.shortUrl} target="_blank" rel="noreferrer">{dynamicInfo.shortUrl}</a> <br/>
            ID：<code>{dynamicInfo.shortId}</code>
          </p>
          <hr style={{ opacity: 0.2 }}/>
          <Form.Label className="small fw-bold">隨時重新導向至新網址 (不改變目前圖案)</Form.Label>
          <InputGroup size="sm">
            <Form.Control 
              placeholder="輸入新的目標網址 https://..." 
              value={updateUrl}
              onChange={(e) => setUpdateUrl(e.target.value)}
            />
            <Button variant="primary" onClick={handleUpdateTarget} disabled={isUpdating || !updateUrl}>
              {isUpdating ? "更新中" : "套用新網址"}
            </Button>
          </InputGroup>
          {updateMsg && <div className="mt-2 small text-success fw-bold">{updateMsg}</div>}
        </div>
      )}
    </div>
  );
};
