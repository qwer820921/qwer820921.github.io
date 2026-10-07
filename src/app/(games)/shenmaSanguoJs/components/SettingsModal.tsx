"use client";

import React, { useState } from "react";
import { Modal, Button, Form, Alert } from "react-bootstrap";
import styles from "../styles/shenmaSanguoJs.module.css";

interface SettingsModalProps {
  show: boolean;
  isBgmMuted: boolean;
  isSfxMuted: boolean;
  onToggleBgm: () => void;
  onToggleSfx: () => void;
  onExportBackup: () => string;
  onImportBackup: (jsonStr: string) => { success: boolean; error?: string };
  onSwitchKey: () => void;
  onLogout?: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  show,
  isBgmMuted,
  isSfxMuted,
  onToggleBgm,
  onToggleSfx,
  onExportBackup,
  onImportBackup,
  onSwitchKey,
  onLogout,
  onClose,
}) => {
  const [importJson, setImportJson] = useState("");
  const [showImportBox, setShowImportBox] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "danger"; msg: string } | null>(null);

  const handleDownloadBackup = () => {
    try {
      const json = onExportBackup();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shenma_save_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setFeedback({ type: "success", msg: "存檔備份已下載至您的裝置！" });
    } catch {
      setFeedback({ type: "danger", msg: "匯出備份失敗" });
    }
  };

  const handleExecuteImport = () => {
    setFeedback(null);
    if (!importJson.trim()) {
      setFeedback({ type: "danger", msg: "請貼上存檔 JSON 字串" });
      return;
    }
    const res = onImportBackup(importJson.trim());
    if (res.success) {
      setFeedback({ type: "success", msg: "存檔匯入成功！已還原所有進度與名將！" });
      setImportJson("");
      setShowImportBox(false);
    } else {
      setFeedback({ type: "danger", msg: res.error || "存檔格式不正確，匯入失敗" });
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered contentClassName={styles.darkModalContent}>
      <Modal.Header closeButton closeVariant="white" className={styles.modalHeader}>
        <Modal.Title className="text-warning fw-bold d-flex align-items-center gap-2">
          <span>⚙️</span>
          <span>遊戲系統設定與存檔備份</span>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className={styles.modalBody}>
        {feedback && (
          <Alert variant={feedback.type} className="py-2 small mb-3" dismissible onClose={() => setFeedback(null)}>
            {feedback.msg}
          </Alert>
        )}

        {/* 音訊設定 */}
        <div className="p-3 rounded mb-3" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h6 className="text-warning fw-bold mb-3">🎵 音訊與音效控制</h6>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <div className="text-light fw-bold">戰鬥背景音樂 (BGM)</div>
              <small className="text-secondary">五聲音階古風循環沉浸戰樂</small>
            </div>
            <Button
              variant={isBgmMuted ? "outline-secondary" : "outline-success"}
              size="sm"
              onClick={onToggleBgm}
            >
              {isBgmMuted ? "🔇 已靜音" : "🔊 開啟中"}
            </Button>
          </div>

          <div className="d-flex justify-content-between align-items-center">
            <div>
              <div className="text-light fw-bold">打擊音效 (SFX)</div>
              <small className="text-secondary">防禦塔射擊、武將技能與倒地音效</small>
            </div>
            <Button
              variant={isSfxMuted ? "outline-secondary" : "outline-success"}
              size="sm"
              onClick={onToggleSfx}
            >
              {isSfxMuted ? "🔕 已靜音" : "🔔 開啟中"}
            </Button>
          </div>
        </div>

        {/* 存檔備份與還原 */}
        <div className="p-3 rounded mb-3" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h6 className="text-warning fw-bold mb-2">💾 存檔資料管理</h6>
          <p className="text-secondary small mb-3">
            隨時匯出 JSON 存檔以防瀏覽器快取被清空，或在上傳備份至新裝置。
          </p>

          <div className="d-flex gap-2 mb-2">
            <Button variant="outline-warning" size="sm" className="w-100" onClick={handleDownloadBackup}>
              📥 匯出存檔檔案
            </Button>
            <Button
              variant="outline-info"
              size="sm"
              className="w-100"
              onClick={() => setShowImportBox(!showImportBox)}
            >
              📤 匯入還原存檔
            </Button>
          </div>

          {showImportBox && (
            <div className="mt-3 pt-2 border-top border-secondary">
              <Form.Group className="mb-2">
                <Form.Label className="text-light small">貼上備份 JSON 代碼：</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  placeholder='{"key": "...", "nickname": "...", ...}'
                  className={styles.selectDark}
                  style={{ fontSize: "0.75rem" }}
                />
              </Form.Group>
              <div className="d-flex justify-content-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowImportBox(false)}>
                  取消
                </Button>
                <Button variant="warning" size="sm" onClick={handleExecuteImport}>
                  確認覆蓋還原
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 帳號切換與登出 */}
        <div className="d-flex justify-content-between align-items-center p-2 rounded" style={{ background: "rgba(0,0,0,0.2)" }}>
          <span className="text-secondary small">欲登出或切換帳號？</span>
          <div className="d-flex gap-2">
            {onLogout && (
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
              >
                登出
              </Button>
            )}
            <Button
              variant="outline-warning"
              size="sm"
              onClick={() => {
                onClose();
                onSwitchKey();
              }}
            >
              更換金鑰
            </Button>
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
};
