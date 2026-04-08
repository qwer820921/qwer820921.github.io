"use client";
import React, { useEffect } from "react";
import { Container, Row, Col } from "react-bootstrap";
import dynamic from "next/dynamic";
import styles from "../styles/qrCodeGenerator.module.css";
import { QRControlPanel } from "./qrControlPanel";
import { useQRStore } from "../store/useQRStore";

const QRPreview = dynamic(() => import("./qrPreview").then(mod => mod.QRPreview), {
  ssr: false,
  loading: () => <div className="text-center p-5 text-muted">渲染引擎載入中...</div>
});

export const QrCodeGeneratorPage: React.FC = () => {
  const { setFinalEncodedText, dataType, urlInput, wifiData, vCardData, textInput, isDynamic, dynamicInfo } = useQRStore();

  // Handle data compilation
  useEffect(() => {
    let result = "";
    if (dataType === "url") {
      if (isDynamic && dynamicInfo) {
        result = dynamicInfo.shortUrl; // If dynamic mode and already generated, use short URL
      } else {
        result = urlInput;
      }
    } else if (dataType === "wifi") {
      const { ssid, password, encryption, hidden } = wifiData;
      result = `WIFI:T:${encryption};S:${ssid};${password ? `P:${password};` : ""}${hidden ? "H:true;" : ""};`;
    } else if (dataType === "vcard") {
      const { firstName, lastName, organization, phone, email, title, website } = vCardData;
      result = `BEGIN:VCARD\nVERSION:3.0\nN:${lastName};${firstName};;;\nFN:${firstName} ${lastName}\nORG:${organization}\nTITLE:${title}\nTEL:${phone}\nEMAIL:${email}\nURL:${website}\nEND:VCARD`;
    } else if (dataType === "text") {
      result = textInput;
    }
    
    // Ensure final text string is never null
    setFinalEncodedText(result || " "); 
  }, [dataType, urlInput, wifiData, vCardData, textInput, isDynamic, dynamicInfo, setFinalEncodedText]);


  return (
    <Container className={styles.container}>
      <Row className="mb-4 text-center">
        <Col>
          <h1 className="fw-bold" style={{ color: "#1e293b" }}>QRCode 旗艦產生器</h1>
          <p className="text-muted">支援背景融合、無限色板與動態追蹤短網址</p>
        </Col>
      </Row>
      <Row>
        {/* Left Settings Panel */}
        <Col lg={6}>
          <div className={styles.glassCard}>
            <QRControlPanel />
          </div>
        </Col>

        {/* Right Preview Panel */}
        <Col lg={6}>
          <div className={styles.glassCard} style={{ position: "sticky", top: "100px" }}>
            <QRPreview />
          </div>
        </Col>
      </Row>
    </Container>
  );
};
