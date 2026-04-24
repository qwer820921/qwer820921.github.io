"use client";

import React, { useState, useEffect } from "react";
import { Form, Spinner, Alert } from "react-bootstrap";
import { Trophy, Inboxes } from "react-bootstrap-icons";
import { gameApi, getPlayerKey, setPlayerKey } from "../../api/gameApi";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import styles from "../../styles/shenmaSanguo.module.css";

interface Props {
  onClose: () => void;
  onOpenStage: () => void;
}

export default function PlayerInfoModal({ onClose, onOpenStage }: Props) {
  const { player, initFromGAS } = usePlayerStore();
  const { config: staticConfig } = useStaticConfigStore();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const currentKey = mounted ? getPlayerKey() : null;

  const [inputKey, setInputKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "danger";
    msg: string;
  } | null>(null);
  const [showKeySwitch, setShowKeySwitch] = useState(false);

  const handleKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputKey.trim();
    if (!trimmed) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      let isNewPlayer = false;
      try {
        await gameApi.getProfile(trimmed);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "PROFILE_NOT_FOUND") isNewPlayer = true;
        else throw err;
      }
      setPlayerKey(trimmed);
      await initFromGAS(trimmed);
      setFeedback({
        type: "success",
        msg: isNewPlayer ? "新存檔建立成功！" : "存檔讀取成功！歡迎回來。",
      });
      setInputKey("");
      setShowKeySwitch(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "發生錯誤，請稍後再試";
      setFeedback({ type: "danger", msg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const { refreshConfig } = (
        await import("../../store/staticConfigStore")
      ).useStaticConfigStore.getState();
      const { refreshProfile } = (
        await import("../../store/playerStore")
      ).usePlayerStore.getState();
      await Promise.all([refreshConfig(), refreshProfile()]);
      setFeedback({ type: "success", msg: "資料同步成功！" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "同步失敗";
      setFeedback({ type: "danger", msg });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={styles.modalPanel}
        style={{ maxWidth: 400 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>玩家資訊</span>
          <button className={styles.modalClose} onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          {/* 玩家資訊 */}
          {player && (
            <div
              className={styles.sgCard}
              style={{ padding: "0.9rem 1rem", marginBottom: "1rem" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "1.05rem",
                      color: "var(--sg-text)",
                    }}
                  >
                    {player.nickname}
                  </div>
                  <div
                    style={{
                      fontSize: "0.72rem",
                      color: "var(--sg-muted)",
                      marginTop: "2px",
                    }}
                  >
                    Lv.{player.level}　進度：
                    {staticConfig?.maps.find(
                      (m) => m.map_id === player.max_stage
                    )?.name || player.max_stage}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontWeight: 700,
                      color: "var(--sg-gold)",
                      fontSize: "1rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: "4px",
                    }}
                  >
                    <Trophy size={14} /> {(player.gold ?? 0).toLocaleString()}
                  </div>
                  <div
                    style={{
                      fontSize: "0.68rem",
                      color: "var(--sg-muted)",
                      marginTop: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: "4px",
                    }}
                  >
                    <Inboxes size={12} /> 容量 {player.capacity}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 目前金鑰 */}
          {currentKey && (
            <div style={{ marginBottom: "1rem" }}>
              <div
                style={{
                  fontSize: "0.68rem",
                  color: "var(--sg-muted)",
                  marginBottom: "0.35rem",
                }}
              >
                存檔金鑰
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}
              >
                <code
                  style={{
                    background: "var(--sg-surface2)",
                    color: "var(--sg-gold)",
                    borderRadius: 5,
                    padding: "3px 10px",
                    fontSize: "0.88rem",
                    border: "1px solid var(--sg-border)",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {currentKey}
                </code>
                <button
                  className={styles.btnOutline}
                  style={{
                    fontSize: "0.72rem",
                    padding: "3px 10px",
                    whiteSpace: "nowrap",
                  }}
                  onClick={() => setShowKeySwitch((v) => !v)}
                >
                  切換
                </button>
              </div>
            </div>
          )}

          {/* 切換金鑰 */}
          {showKeySwitch && (
            <div
              className={styles.sgCard}
              style={{ padding: "1rem", marginBottom: "1rem" }}
            >
              <p
                style={{
                  fontSize: "0.78rem",
                  color: "var(--sg-muted)",
                  marginBottom: "0.75rem",
                  lineHeight: 1.6,
                }}
              >
                輸入金鑰以切換存檔。找不到則建立新存檔。
              </p>
              <Form onSubmit={handleKeySubmit}>
                <Form.Control
                  type="text"
                  placeholder="例：eric_sanguo_2026"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  disabled={isLoading}
                  autoComplete="off"
                  maxLength={50}
                  style={{
                    background: "var(--sg-surface2)",
                    border: "1px solid var(--sg-border)",
                    color: "var(--sg-text)",
                    borderRadius: 8,
                    marginBottom: "0.5rem",
                  }}
                />
                <button
                  type="submit"
                  className={styles.btnGold}
                  disabled={isLoading || !inputKey.trim()}
                  style={{ width: "100%", fontSize: "0.88rem" }}
                >
                  {isLoading ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      確認中...
                    </>
                  ) : (
                    "確認切換"
                  )}
                </button>
              </Form>
            </div>
          )}

          {feedback && (
            <Alert variant={feedback.type} className="py-2 small mb-3">
              {feedback.msg}
            </Alert>
          )}

          {/* 操作按鈕 */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}
          >
            <button
              className={styles.btnOutline}
              style={{ width: "100%", fontSize: "0.85rem" }}
              disabled={isLoading}
              onClick={handleSync}
            >
              {isLoading ? (
                <Spinner animation="border" size="sm" className="me-2" />
              ) : null}
              🔄 強制從雲端同步
            </button>
            <button
              className={styles.btnGold}
              style={{ width: "100%", fontSize: "0.85rem" }}
              onClick={() => {
                onClose();
                onOpenStage();
              }}
            >
              關卡選擇
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
