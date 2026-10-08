"use client";

import React, { useState } from "react";
import { Form, Alert, Spinner } from "react-bootstrap";
import styles from "../styles/shenmaSanguoJs.module.css";

interface KeySetupModalProps {
  show: boolean;
  /** 登入：雲端找不到存檔時回 needsCreate，不會自動建立 */
  onLogin: (
    key: string
  ) => Promise<{ success: boolean; error?: string; needsCreate?: boolean }>;
  /** 明確建立新存檔（雲端找不到這把金鑰時，使用者再按一次才呼叫） */
  onCreate?: (
    key: string,
    nickname: string
  ) => Promise<{ success: boolean; error?: string }>;
  onGuestMode: () => Promise<void>;
  onClose?: () => void;
  canCancel?: boolean;
  /** 開啟時預先帶入的金鑰（例如這個瀏覽器記住的金鑰在雲端找不到） */
  initialKey?: string | null;
  /** 開啟時要顯示的說明（例如讀取失敗的原因） */
  initialError?: string | null;
}

export const KeySetupModal: React.FC<KeySetupModalProps> = ({
  show,
  onLogin,
  onCreate,
  onGuestMode,
  onClose,
  canCancel = false,
  initialKey = null,
  initialError = null,
}) => {
  const [inputKey, setInputKey] = useState(initialKey ?? "");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  // 雲端找不到這把金鑰的存檔：等使用者確認後才建立
  const [createKey, setCreateKey] = useState<string | null>(
    initialKey && initialError ? initialKey : null
  );
  // 外部帶入新的說明（例如這個瀏覽器記住的金鑰讀取失敗或在雲端找不到；找不到時一併帶入金鑰與「建立新存檔」）時才更新畫面；
  // 外部的說明被清掉（開始登入或建立）時保留這裡的輸入與說明，不重新掛載
  const signature = `${initialKey ?? ""}|${initialError ?? ""}`;
  const [seenSignature, setSeenSignature] = useState(signature);
  if (signature !== seenSignature) {
    setSeenSignature(signature);
    if (initialError) {
      setError(initialError);
      if (initialKey) {
        setInputKey(initialKey);
        setCreateKey(initialKey);
      }
    }
  }

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
    setCreateKey(null);
    try {
      const res = await onLogin(trimmed);
      if (!res.success) {
        setError(res.error || "登入失敗，請檢查金鑰或網路連線");
        if (res.needsCreate) setCreateKey(trimmed);
      }
    } catch {
      setError("登入發生異常，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!createKey || !onCreate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await onCreate(createKey, nickname);
      if (!res.success) setError(res.error || "建立失敗，請稍後再試");
      else setCreateKey(null);
    } catch {
      setError("建立發生異常，請稍後再試");
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
    <div className={styles.keySetupOverlay} data-testid="key-setup">
      <div className={styles.keySetupCard}>
        <h1 className={styles.gameTitle}>神馬三國</h1>
        <p className={styles.subtitle}>純前端高畫質重製版・點兵封候</p>
        <p className={styles.keySetupHint}>
          輸入你的存檔金鑰：和 Godot 版共用同一個帳號與進度。
          <br />
          雲端找不到這把金鑰時會先告訴你，確認後才建立新存檔。
        </p>

        {error && (
          <Alert
            variant="danger"
            className="py-2 small mb-3"
            data-testid="key-setup-error"
          >
            {error}
          </Alert>
        )}

        {createKey && onCreate && (
          <div className="mb-3" data-testid="key-setup-create">
            <Form.Control
              type="text"
              placeholder="新存檔的暱稱（可留空）"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              disabled={loading}
              autoComplete="off"
              maxLength={50}
              className={styles.keyInput}
            />
            <button
              type="button"
              className={styles.btnGold}
              onClick={() => void handleCreate()}
              disabled={loading}
              style={{ width: "100%", marginTop: 8 }}
              data-testid="key-setup-create-confirm"
            >
              用「{createKey}」建立新存檔
            </button>
          </div>
        )}

        <Form onSubmit={handleSubmit}>
          <Form.Control
            type="text"
            placeholder="例：eric_sanguo_2026"
            value={inputKey}
            onChange={(e) => {
              setInputKey(e.target.value);
              setCreateKey(null);
            }}
            disabled={loading}
            autoComplete="off"
            maxLength={50}
            autoFocus
            className={styles.keyInput}
            data-testid="key-setup-input"
          />

          <div className="d-grid gap-2 mt-3">
            <button
              type="submit"
              className={styles.btnGold}
              disabled={loading || !inputKey.trim()}
              style={{ width: "100%" }}
              data-testid="key-setup-login"
            >
              {loading ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  讀取中...
                </>
              ) : (
                "登入存檔"
              )}
            </button>

            <button
              type="button"
              className={styles.btnOutline}
              onClick={handleGuest}
              disabled={loading}
              style={{ width: "100%" }}
              data-testid="key-setup-guest"
            >
              ⚡ 訪客一鍵試玩（只存在這個瀏覽器，不和 Godot 版共用）
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
