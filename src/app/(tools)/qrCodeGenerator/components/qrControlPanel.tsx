"use client";
import React from "react";
import { Accordion, Form, Button, Row, Col, Spinner } from "react-bootstrap";
import { useQRStore } from "../store/useQRStore";
import { createDynamicQRCode } from "../services/qrApi";
import styles from "../styles/qrCodeGenerator.module.css";
import { QRDataType } from "../types";

export const QRControlPanel: React.FC = () => {
  const {
    dataType,
    setDataType,
    urlInput,
    setUrlInput,
    wifiData,
    setWifiData,
    vCardData,
    setVCardData,
    textInput,
    setTextInput,
    styleOptions,
    updateStyle,
    isDynamic,
    setIsDynamic,
    isGeneratingDynamic,
    setIsGeneratingDynamic,
    setDynamicInfo,
  } = useQRStore();

  const handleCreateDynamic = async () => {
    if (!urlInput) return;
    setIsGeneratingDynamic(true);
    try {
      const res = await createDynamicQRCode(urlInput);
      setDynamicInfo({
        shortId: res.shortId,
        shortUrl: res.shortUrl,
        targetUrl: urlInput,
      });
    } catch {
      alert("生成動態條碼失敗，請稍後再試！");
    } finally {
      setIsGeneratingDynamic(false);
    }
  };

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "logoImage" | "backgroundImage"
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64Str = ev.target?.result as string;
        if (field === "logoImage") {
          updateStyle({ logoImage: base64Str, correctLevel: "H" }); // H level required for logo
        } else {
          updateStyle({ backgroundImage: base64Str });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <Accordion defaultActiveKey="0" className={styles.customAccordion}>
      {/* SECTION 1: Data Types */}
      <Accordion.Item eventKey="0">
        <Accordion.Header>1. 資料類型與內容</Accordion.Header>
        <Accordion.Body>
          <Form.Group className="mb-3">
            <Form.Label>選擇生成類型</Form.Label>
            <Form.Select
              value={dataType}
              onChange={(e) => setDataType(e.target.value as QRDataType)}
            >
              <option value="url">網址 (URL)</option>
              <option value="wifi">Wi-Fi 網路</option>
              <option value="vcard">電子名片 (vCard)</option>
              <option value="text">純文字</option>
            </Form.Select>
          </Form.Group>

          <hr />

          {dataType === "url" && (
            <>
              <Form.Group className="mb-3">
                <Form.Label>目標網址</Form.Label>
                <Form.Control
                  type="url"
                  placeholder="https://example.com"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Check
                  type="switch"
                  id="dynamic-switch"
                  label="建立動態追蹤碼 (支援事後修改網址)"
                  checked={isDynamic}
                  onChange={(e) => setIsDynamic(e.target.checked)}
                />
                <Form.Text className="text-muted">
                  開啟後，此條碼會以短網址形式產出，並可在列印後隨時更換導向網址。
                </Form.Text>
              </Form.Group>

              {isDynamic && (
                <div className="d-grid mt-3">
                  <Button
                    variant="primary"
                    onClick={handleCreateDynamic}
                    disabled={isGeneratingDynamic}
                  >
                    {isGeneratingDynamic ? (
                      <Spinner size="sm" />
                    ) : (
                      "生成動態短網址 API"
                    )}
                  </Button>
                </div>
              )}
            </>
          )}

          {dataType === "wifi" && (
            <Row>
              <Col md={12}>
                <Form.Group className="mb-2">
                  <Form.Label>網路名稱 (SSID) *</Form.Label>
                  <Form.Control
                    value={wifiData.ssid}
                    onChange={(e) => setWifiData({ ssid: e.target.value })}
                    maxLength={32}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-2">
                  <Form.Label>熱點密碼</Form.Label>
                  <Form.Control
                    value={wifiData.password || ""}
                    onChange={(e) => setWifiData({ password: e.target.value })}
                    type="password"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-2">
                  <Form.Label>加密模式</Form.Label>
                  <Form.Select
                    value={wifiData.encryption}
                    onChange={(e) =>
                      setWifiData({ encryption: e.target.value as any })
                    }
                  >
                    <option value="WPA">WPA/WPA2</option>
                    <option value="WEP">WEP</option>
                    <option value="nopass">無密碼</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
          )}

          {dataType === "vcard" && (
            <Row>
              <Col md={6}>
                <Form.Group className="mb-2">
                  <Form.Label>名</Form.Label>
                  <Form.Control
                    value={vCardData.firstName}
                    onChange={(e) =>
                      setVCardData({ firstName: e.target.value })
                    }
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-2">
                  <Form.Label>姓</Form.Label>
                  <Form.Control
                    value={vCardData.lastName}
                    onChange={(e) => setVCardData({ lastName: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group className="mb-2">
                  <Form.Label>公司 / 組織</Form.Label>
                  <Form.Control
                    value={vCardData.organization}
                    onChange={(e) =>
                      setVCardData({ organization: e.target.value })
                    }
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group className="mb-2">
                  <Form.Label>職稱</Form.Label>
                  <Form.Control
                    value={vCardData.title}
                    onChange={(e) => setVCardData({ title: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group className="mb-2">
                  <Form.Label>電話</Form.Label>
                  <Form.Control
                    value={vCardData.phone}
                    onChange={(e) => setVCardData({ phone: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group className="mb-2">
                  <Form.Label>信箱</Form.Label>
                  <Form.Control
                    type="email"
                    value={vCardData.email}
                    onChange={(e) => setVCardData({ email: e.target.value })}
                  />
                </Form.Group>
              </Col>
            </Row>
          )}

          {dataType === "text" && (
            <Form.Group>
              <Form.Control
                as="textarea"
                rows={4}
                placeholder="輸入任意文字..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
              />
            </Form.Group>
          )}
        </Accordion.Body>
      </Accordion.Item>

      {/* SECTION 2: Advanced Styling */}
      <Accordion.Item eventKey="1">
        <Accordion.Header>2. 視覺特效與材質</Accordion.Header>
        <Accordion.Body>
          <Row>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label>資料點顏色</Form.Label>
                <Form.Control
                  type="color"
                  value={styleOptions.dotsColor}
                  onChange={(e) => updateStyle({ dotsColor: e.target.value })}
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label>背景顏色</Form.Label>
                <Form.Control
                  type="color"
                  value={styleOptions.backgroundColor}
                  onChange={(e) =>
                    updateStyle({ backgroundColor: e.target.value })
                  }
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label>邊角顏色</Form.Label>
                <Form.Control
                  type="color"
                  value={styleOptions.cornersSquareColor}
                  onChange={(e) =>
                    updateStyle({ cornersSquareColor: e.target.value })
                  }
                />
              </Form.Group>
            </Col>
          </Row>

          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>資料點風格</Form.Label>
                <Form.Select
                  value={styleOptions.dotsType}
                  onChange={(e) =>
                    updateStyle({ dotsType: e.target.value as any })
                  }
                >
                  <option value="square">標準方塊 (Square)</option>
                  <option value="rounded">圓潤 (Rounded)</option>
                  <option value="dots">圓點 (Dots)</option>
                  <option value="classy">流線 (Classy)</option>
                  <option value="extra-rounded">
                    極度圓滑 (Extra-Rounded)
                  </option>
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>邊角風格</Form.Label>
                <Form.Select
                  value={styleOptions.cornersSquareType}
                  onChange={(e) =>
                    updateStyle({ cornersSquareType: e.target.value as any })
                  }
                >
                  <option value="square">標準方塊 (Square)</option>
                  <option value="dot">圓點 (Dot)</option>
                  <option value="extra-rounded">圓潤 (Extra-Rounded)</option>
                </Form.Select>
              </Form.Group>
            </Col>
          </Row>

          <Form.Group className="mb-3">
            <Form.Label>融合背景圖 (圖片或 GIF)</Form.Label>
            <Form.Control
              type="file"
              accept="image/*, image/gif"
              onChange={(e: any) => handleImageUpload(e, "backgroundImage")}
            />
            <Form.Text className="text-muted">
              上傳背景後，QR碼會以半透明度完美合成為底圖。
            </Form.Text>
            {styleOptions.backgroundImage && (
              <Button
                variant="link"
                className="p-0 mt-1 d-block text-danger"
                onClick={() => updateStyle({ backgroundImage: undefined })}
              >
                移除背景圖片
              </Button>
            )}
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>中央 Logo 上傳</Form.Label>
            <Form.Control
              type="file"
              accept="image/*"
              onChange={(e: any) => handleImageUpload(e, "logoImage")}
            />
            <Form.Text className="text-muted">
              上傳 Logo 會自動將容錯率提升至最高 (H)。
            </Form.Text>
            {styleOptions.logoImage && (
              <Button
                variant="link"
                className="p-0 mt-1 d-block text-danger"
                onClick={() => updateStyle({ logoImage: undefined })}
              >
                移除 Logo
              </Button>
            )}
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Text className="text-muted d-block mt-2">
              提示：匯出成圖片前可以切換材質以達成最佳讀取率。
            </Form.Text>
          </Form.Group>
        </Accordion.Body>
      </Accordion.Item>

      {/* SECTION 3: Output Settings */}
      <Accordion.Item eventKey="2">
        <Accordion.Header>3. 基本與匯出設定</Accordion.Header>
        <Accordion.Body>
          <Form.Group className="mb-3">
            <Form.Label>容錯率 (Error Correction)</Form.Label>
            <Form.Select
              value={styleOptions.correctLevel}
              onChange={(e) =>
                updateStyle({ correctLevel: e.target.value as any })
              }
              disabled={!!styleOptions.logoImage} // Locked to H if logo exists
            >
              <option value="L">L - 7%</option>
              <option value="M">M - 15%</option>
              <option value="Q">Q - 25%</option>
              <option value="H">H - 30% (加上 Logo 必選)</option>
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>圖片輸出解析度: {styleOptions.size}px</Form.Label>
            <Form.Range
              min={250}
              max={2000}
              step={50}
              value={styleOptions.size}
              onChange={(e) => updateStyle({ size: Number(e.target.value) })}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>邊界留白 (Margin): {styleOptions.margin}</Form.Label>
            <Form.Range
              min={0}
              max={100}
              step={5}
              value={styleOptions.margin}
              onChange={(e) => updateStyle({ margin: Number(e.target.value) })}
            />
          </Form.Group>
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  );
};
