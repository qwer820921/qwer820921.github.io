"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Container, Form, Spinner, Alert } from "react-bootstrap";
import { gameApi, getPlayerKey, setPlayerKey } from "../../api/gameApi";
import { usePlayerStore } from "../../store/playerStore";
import styles from "../../styles/shenmaSanguo.module.css";

export default function SettingsPageContent() {
  const router = useRouter();
  const { initFromGAS, player } = usePlayerStore();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const currentKey = mounted ? getPlayerKey() : null;

  const [inputKey, setInputKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "danger";
    msg: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
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
        msg: isNewPlayer
          ? "新存檔建立成功！歡迎來到神馬三國。"
          : "存檔讀取成功！歡迎回來。",
      });
      setTimeout(() => router.replace("/shenmaSanguo"), 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "發生錯誤，請稍後再試";
      setFeedback({ type: "danger", msg });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container className={styles.pageContainer} style={{ maxWidth: 480 }}>
      <div className={styles.header}>
        <h2 className={styles.pageTitle}>玩家設定</h2>
        <p className={styles.subtitle}>切換 / 找回存檔金鑰</p>
      </div>

      {/* 目前登入狀態 */}
      {currentKey && (
        <div
          className={styles.sgCard}
          style={{
            width: "100%",
            padding: "0.85rem 1rem",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--sg-muted)",
              marginBottom: "0.35rem",
            }}
          >
            目前登入
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <code
              style={{
                background: "var(--sg-surface2)",
                color: "var(--sg-gold)",
                borderRadius: 5,
                padding: "3px 10px",
                fontSize: "0.88rem",
                border: "1px solid var(--sg-border)",
              }}
            >
              {currentKey}
            </code>
            {player && (
              <span style={{ fontSize: "0.75rem", color: "var(--sg-muted)" }}>
                {player.nickname}・Lv.{player.level}・{player.gold} 金
              </span>
            )}
          </div>
        </div>
      )}

      {/* 輸入區 */}
      <div
        className={styles.sgCard}
        style={{ width: "100%", padding: "1.25rem" }}
      >
        <p
          style={{
            fontSize: "0.8rem",
            color: "var(--sg-muted)",
            marginBottom: "1rem",
            lineHeight: 1.7,
          }}
        >
          輸入一組你能記住的金鑰（英數字皆可）。
          <br />
          找到存檔自動讀取；找不到則建立新存檔。
        </p>

        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
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
              }}
            />
            <Form.Text style={{ color: "var(--sg-muted)", fontSize: "0.7rem" }}>
              換裝置時輸入相同金鑰即可找回存檔
            </Form.Text>
          </Form.Group>

          {feedback && (
            <Alert variant={feedback.type} className="py-2 small">
              {feedback.msg}
            </Alert>
          )}

          <button
            type="submit"
            className={styles.btnGold}
            disabled={isLoading || !inputKey.trim()}
            style={{ width: "100%", padding: "0.65rem", fontSize: "0.95rem" }}
          >
            {isLoading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                確認中...
              </>
            ) : (
              "確認並進入遊戲"
            )}
          </button>
        </Form>
      </div>

      {currentKey && (
        <>
          {/* 資料同步區區塊 */}
          <div
            className={styles.sgCard}
            style={{ width: "100%", padding: "1.25rem", marginTop: "1rem" }}
          >
            <div
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                color: "var(--sg-text)",
                marginBottom: "0.5rem",
              }}
            >
              資料同步
            </div>
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--sg-muted)",
                marginBottom: "1rem",
              }}
            >
              如果你剛在雲端試算表 (Sheet)
              修改了數值或地圖，請點擊下方按鈕強制同步最新資料。
            </p>
            <button
              className={styles.btnOutline}
              style={{
                width: "100%",
                padding: "0.5rem",
                fontSize: "0.85rem",
                borderColor: "var(--sg-border-hi)",
              }}
              disabled={isLoading}
              onClick={async () => {
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

                  setFeedback({
                    type: "success",
                    msg: "資料同步成功！已獲取最新雲端設定。",
                  });
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : "同步失敗";
                  setFeedback({ type: "danger", msg });
                } finally {
                  setIsLoading(false);
                }
              }}
            >
              {isLoading ? (
                <Spinner animation="border" size="sm" className="me-2" />
              ) : (
                "🔄 強制從雲端同步"
              )}
            </button>
          </div>

          <button
            className={styles.btnOutline}
            style={{ marginTop: "1rem" }}
            onClick={() => router.push("/shenmaSanguo")}
          >
            ← 回主選單
          </button>
        </>
      )}
    </Container>
  );
}
