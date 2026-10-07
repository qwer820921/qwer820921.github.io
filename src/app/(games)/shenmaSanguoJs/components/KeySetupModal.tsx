"use client";

import React, { useState } from "react";
import { Form, Alert, Spinner } from "react-bootstrap";
import styles from "../styles/shenmaSanguoJs.module.css";

interface KeySetupModalProps {
  show: boolean;
  onLogin: (key: string) => Promise<{ success: boolean; error?: string }>;
  onGuestMode: () => Promise<void>;
  onClose?: () => void;
  canCancel?: boolean;
}

export const KeySetupModal: React.FC<KeySetupModalProps> = ({
  show,
  onLogin,
  onGuestMode,
  onClose,
  canCancel = false,
}) => {
  const [inputKey, setInputKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!show) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputKey.trim();
    if (!trimmed) {
      setError("請輸入玩家金鑰");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await onLogin(trimmed);
      if (!res.success) {
        setError(res.error || "登入失敗，請檢查金鑰或網路連線");
      }
    } catch {
      setError("登入發生異常，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setLoading(true);
    setError(null);
    try {
      await onGuestMode();
    } catch {
      setError("啟動訪客模式失敗");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.keySetupOverlay}>
      <div className={styles.keySetupCard}>
        <h1 className={styles.gameTitle}>神馬三國</h1>
        <p className={styles.subtitle}>純前端高畫質重製版・點兵封候</p>
        <p className={styles.keySetupHint}>
          輸入一組你能記住的存檔金鑰（英數字皆可），支援雲端同步；
          <br />
          若金鑰已存在則自動載入存檔，找不到則建立新存檔。
        </p>

        {error && (
          <Alert variant="danger" className="py-2 small mb-3">
            {error}
          </Alert>
        )}

        <Form onSubmit={handleSubmit}>
          <Form.Control
            type="text"
            placeholder="例：eric_sanguo_2026"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            disabled={loading}
            autoComplete="off"
            maxLength={50}
            autoFocus
            className={styles.keyInput}
          />

          <div className="d-grid gap-2 mt-3">
            <button
              type="submit"
              className={styles.btnGold}
              disabled={loading || !inputKey.trim()}
              style={{ width: "100%" }}
            >
              {loading ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  驗證載入中...
                </>
              ) : (
                "登入存檔 / 建立帳號"
              )}
            </button>

            <button
              type="button"
              className={styles.btnOutline}
              onClick={handleGuest}
              disabled={loading}
              style={{ width: "100%" }}
            >
              ⚡ 訪客一鍵試玩 (離線本機存檔)
            </button>

            {canCancel && onClose && (
              <button
                type="button"
                className={styles.btnOutline}
                onClick={onClose}
                disabled={loading}
                style={{ width: "100%" }}
              >
                返回
              </button>
            )}
          </div>
        </Form>
      </div>
    </div>
  );
};
