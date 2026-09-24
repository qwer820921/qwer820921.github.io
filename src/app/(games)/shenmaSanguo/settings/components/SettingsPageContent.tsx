"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Container, Form, Spinner, Alert } from "react-bootstrap";
import { getPlayerKey } from "../../api/gameApi";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import { useSoundSettingsStore } from "../../store/soundSettingsStore";
import { describePlayerError } from "../../utils/playerErrors";
import styles from "../../styles/shenmaSanguo.module.css";

export default function SettingsPageContent() {
  const router = useRouter();
  const { initFromGAS, refreshProfile, player } = usePlayerStore();
  const { sfxEnabled, sfxPolyphony, setEnabled, setPolyphony } =
    useSoundSettingsStore();

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

    // 目前存檔的未同步修改會先保存；保存或讀取失敗時維持原帳號與資料
    const result = await initFromGAS(trimmed);
    setIsLoading(false);
    if (result.ok) {
      setFeedback({
        type: "success",
        msg: result.created
          ? "新存檔建立成功！歡迎來到神馬三國。"
          : "存檔讀取成功！歡迎回來。",
      });
      setTimeout(() => router.replace("/shenmaSanguo"), 800);
    } else if (!result.superseded) {
      setFeedback({
        type: "danger",
        msg: `${describePlayerError(result.error)}（代碼：${result.error}）`,
      });
    }
  };

  const handleSync = async () => {
    setIsLoading(true);
    setFeedback(null);
    const { refreshConfig } = useStaticConfigStore.getState();
    // 先保存本機未同步的修改，成功後才讀取雲端資料；失敗時保留本機資料
    const [, profile] = await Promise.all([refreshConfig(), refreshProfile()]);
    const configError = useStaticConfigStore.getState().error;
    setIsLoading(false);
    if (!profile.ok) {
      if (!profile.superseded) {
        setFeedback({
          type: "danger",
          msg: `同步失敗：${describePlayerError(profile.error)}（代碼：${profile.error}）`,
        });
      }
    } else if (configError) {
      setFeedback({
        type: "danger",
        msg: `存檔已同步，但遊戲設定載入失敗（代碼：${configError}）`,
      });
    } else {
      setFeedback({
        type: "success",
        msg: "資料同步成功！已獲取最新雲端設定。",
      });
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
              onClick={handleSync}
            >
              {isLoading ? (
                <Spinner animation="border" size="sm" className="me-2" />
              ) : (
                "🔄 強制從雲端同步"
              )}
            </button>
          </div>

          {/* 音效設定 */}
          {mounted && (
            <div
              className={styles.sgCard}
              style={{ width: "100%", padding: "1.25rem", marginTop: "1rem" }}
            >
              <div
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  color: "var(--sg-text)",
                  marginBottom: "0.85rem",
                }}
              >
                音效設定
              </div>

              {/* 開啟 / 關閉音效 */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: sfxEnabled ? "1rem" : 0,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: "var(--sg-text)",
                    }}
                  >
                    開啟音效
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--sg-muted)" }}>
                    攻擊、死亡、勝敗等遊戲音效
                  </div>
                </div>
                <Form.Check
                  type="switch"
                  id="sfx-enabled"
                  checked={sfxEnabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  style={{ fontSize: "1.25rem" }}
                />
              </div>

              {/* 音效模式（只在音效開啟時顯示） */}
              {sfxEnabled && (
                <div>
                  <div
                    style={{
                      fontSize: "0.72rem",
                      color: "var(--sg-muted)",
                      marginBottom: "0.45rem",
                      letterSpacing: "0.04em",
                    }}
                  >
                    音效模式
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      className={
                        sfxPolyphony === "single"
                          ? styles.btnGold
                          : styles.btnOutline
                      }
                      style={{
                        flex: 1,
                        padding: "0.45rem 0",
                        fontSize: "0.82rem",
                      }}
                      onClick={() => setPolyphony("single")}
                    >
                      節省模式
                    </button>
                    <button
                      className={
                        sfxPolyphony === "faithful"
                          ? styles.btnGold
                          : styles.btnOutline
                      }
                      style={{
                        flex: 1,
                        padding: "0.45rem 0",
                        fontSize: "0.82rem",
                      }}
                      onClick={() => setPolyphony("faithful")}
                    >
                      忠實模式
                    </button>
                  </div>
                  <p
                    style={{
                      fontSize: "0.68rem",
                      color: "var(--sg-muted)",
                      marginTop: "0.4rem",
                      marginBottom: 0,
                    }}
                  >
                    {sfxPolyphony === "single"
                      ? "多塔同幀攻擊只播一聲，效能較佳"
                      : "忠實呈現每一聲音效，較為熱鬧"}
                  </p>
                </div>
              )}
            </div>
          )}

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
