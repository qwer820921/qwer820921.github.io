"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Container, Row, Col, Spinner, Form, Alert } from "react-bootstrap";
import { usePlayerStore } from "../store/playerStore";
import { useStaticConfigStore } from "../store/staticConfigStore";
import { SyncStatus, Rarity } from "../types";
import { getPlayerKey, setPlayerKey } from "../api/gameApi";
import styles from "../styles/shenmaSanguo.module.css";

const rarityColor: Record<Rarity, string> = {
  [Rarity.Orange]: "#e8922a",
  [Rarity.Purple]: "#9b59b6",
  [Rarity.Blue]: "#5299e0",
  [Rarity.Green]: "#52c07a",
};

// ── 首次登入畫面 ──────────────────────────────────────────
function KeySetupView() {
  const { initFromGAS, isLoading, error, clearError } = usePlayerStore();
  const [inputKey, setInputKey] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputKey.trim();
    if (!trimmed) return;
    clearError();
    setPlayerKey(trimmed);
    await initFromGAS(trimmed);
  };

  return (
    <Container className={styles.pageContainer} style={{ maxWidth: 420 }}>
      <div className={styles.header}>
        <h1 className={styles.gameTitle}>神馬三國</h1>
        <p className={styles.subtitle}>塔防策略・三國風雲</p>
      </div>

      <div
        className={styles.sgCard}
        style={{ width: "100%", padding: "1.5rem" }}
      >
        <p
          style={{
            color: "var(--sg-muted)",
            fontSize: "0.82rem",
            marginBottom: "1.25rem",
            lineHeight: 1.7,
          }}
        >
          輸入一組你能記住的金鑰（英數字皆可）。
          <br />
          找到存檔自動讀取；找不到則建立新存檔。
          <br />
          換裝置時輸入相同金鑰即可找回進度。
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
              autoFocus
              style={{
                background: "var(--sg-surface2)",
                border: "1px solid var(--sg-border)",
                color: "var(--sg-text)",
                borderRadius: 8,
              }}
            />
          </Form.Group>

          {error && (
            <Alert variant="danger" className="py-2 small">
              {error}
            </Alert>
          )}

          <button
            type="submit"
            className={styles.btnGold}
            disabled={isLoading || !inputKey.trim()}
            style={{ width: "100%", fontSize: "1rem", padding: "0.65rem" }}
          >
            {isLoading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                確認中...
              </>
            ) : (
              "進入遊戲"
            )}
          </button>
        </Form>
      </div>
    </Container>
  );
}

// ── 主選單 ───────────────────────────────────────────────
export default function MainMenuContent() {
  const router = useRouter();
  const { player, isLoading, error, updateNickname } = usePlayerStore();
  const { config: staticConfig, isLoading: configLoading } =
    useStaticConfigStore();

  const [mounted, setMounted] = useState(false);
  const [editingName, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");

  useEffect(() => setMounted(true), []);

  const startEdit = () => {
    setNameInput(player?.nickname ?? "");
    setEditing(true);
  };
  const commitEdit = () => {
    const t = nameInput.trim();
    if (t && t !== player?.nickname) updateNickname(t);
    setEditing(false);
  };
  const cancelEdit = () => setEditing(false);

  const hasKey = mounted ? getPlayerKey() !== null : false;

  if (!mounted) {
    return (
      <Container className={styles.pageContainer}>
        <Spinner animation="border" variant="primary" />
      </Container>
    );
  }

  if (!hasKey) return <KeySetupView />;

  if (isLoading) {
    return (
      <Container className={styles.pageContainer}>
        <Spinner animation="border" variant="primary" />
        <p
          style={{
            color: "var(--sg-muted)",
            marginTop: "1rem",
            fontSize: "0.85rem",
            letterSpacing: "0.08em",
          }}
        >
          讀取存檔中...
        </p>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className={styles.pageContainer} style={{ maxWidth: 480 }}>
        <div className={styles.header}>
          <h1 className={styles.gameTitle}>神馬三國</h1>
        </div>
        <Alert variant="danger" className="small">
          {error}
        </Alert>
        <button
          className={styles.btnOutline}
          onClick={() => window.location.reload()}
        >
          重試
        </button>
      </Container>
    );
  }

  if (!player) return null;

  const syncLabel =
    player.syncStatus === SyncStatus.Idle
      ? "已同步"
      : player.syncStatus === SyncStatus.Pending
        ? "待同步"
        : "同步中";
  const syncClass =
    player.syncStatus === SyncStatus.Idle
      ? styles.syncIdle
      : player.syncStatus === SyncStatus.Pending
        ? styles.syncPending
        : styles.syncSyncing;

  return (
    <Container className={styles.pageContainer} style={{ maxWidth: 560 }}>
      {/* 標題 */}
      <div className={styles.header}>
        <h1 className={styles.gameTitle}>神馬三國</h1>
        <p className={styles.subtitle}>塔防策略・三國風雲</p>
      </div>

      {/* 玩家資訊列 */}
      <div className={styles.playerBar}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingName ? (
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
                maxLength={16}
                style={{
                  border: "1px solid var(--sg-border-hi)",
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  color: "var(--sg-text)",
                  background: "var(--sg-surface2)",
                  outline: "none",
                  width: 140,
                }}
              />
              <button
                onClick={commitEdit}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--sg-green)",
                  fontSize: "1rem",
                  padding: 0,
                }}
              >
                ✓
              </button>
              <button
                onClick={cancelEdit}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--sg-muted)",
                  fontSize: "1rem",
                  padding: 0,
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <div className={styles.playerName}>{player.nickname}</div>
              <button
                onClick={startEdit}
                title="編輯名稱"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--sg-muted)",
                  fontSize: "0.75rem",
                  padding: "0 2px",
                  lineHeight: 1,
                }}
              >
                ✎
              </button>
            </div>
          )}
          <div className={styles.playerMeta}>
            Lv.{player.level}　EXP {player.exp}　容量 {player.capacity}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className={styles.playerGold}>
            {(player.gold ?? 0).toLocaleString()} 戰場點數
          </div>
          <span className={`${styles.syncBadge} ${syncClass}`}>
            {player.syncStatus === SyncStatus.Syncing && (
              <Spinner
                animation="border"
                size="sm"
                style={{ width: "0.55rem", height: "0.55rem" }}
              />
            )}
            {syncLabel}
          </span>
        </div>
      </div>

      {/* 靜態設定載入中 */}
      {configLoading && (
        <div
          style={{
            color: "var(--sg-muted)",
            fontSize: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <Spinner animation="border" size="sm" className="me-1" />
          載入遊戲設定...
        </div>
      )}

      {/* 主導覽 */}
      <Row className="g-3 w-100">
        {/* 出征 — 主要入口 */}
        <Col xs={12}>
          <div
            className={styles.navPrimary}
            onClick={() => router.push("/shenmaSanguo/stages")}
          >
            <div className={styles.navPrimaryLabel}>出 征</div>
            <div className={styles.navPrimaryDesc}>選擇關卡，前往戰場</div>
          </div>
        </Col>

        {/* 武將 / 隊伍 / 設定 */}
        <Col xs={4}>
          <div
            className={styles.navSecondary}
            onClick={() => router.push("/shenmaSanguo/heroes")}
          >
            <div className={styles.navSecondaryLabel}>武將</div>
            <div className={styles.navSecondaryDesc}>查看 / 升級</div>
          </div>
        </Col>
        <Col xs={4}>
          <div
            className={styles.navSecondary}
            onClick={() => router.push("/shenmaSanguo/team")}
          >
            <div className={styles.navSecondaryLabel}>隊伍</div>
            <div className={styles.navSecondaryDesc}>編排出征陣容</div>
          </div>
        </Col>
        <Col xs={4}>
          <div
            className={styles.navSecondary}
            onClick={() => router.push("/shenmaSanguo/settings")}
          >
            <div className={styles.navSecondaryLabel}>設定</div>
            <div className={styles.navSecondaryDesc}>切換金鑰</div>
          </div>
        </Col>
      </Row>

      {/* 隊伍快覽 */}
      {player.team?.length > 0 && (
        <div style={{ width: "100%", marginTop: "1.5rem" }}>
          <div className={styles.sectionLabel}>目前隊伍</div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {player.team.map((slot) => {
              const heroConf = staticConfig?.heroesConfig.find(
                (c) => c.hero_id === slot.hero_id
              );
              const heroState = player.heroes.find(
                (h) => h.hero_id === slot.hero_id
              );
              const color = heroConf
                ? rarityColor[heroConf.rarity as Rarity]
                : "var(--sg-muted)";
              return (
                <div
                  key={slot.slot}
                  className={styles.teamBadge}
                  style={{ borderColor: `${color}40` }}
                >
                  <span style={{ color, fontSize: "0.6rem" }}>
                    #{slot.slot}
                  </span>
                  <span style={{ color: "var(--sg-text)", fontWeight: 600 }}>
                    {heroConf?.name ?? slot.hero_id}
                  </span>
                  {heroState && (
                    <span
                      style={{ color: "var(--sg-gold)", fontSize: "0.65rem" }}
                    >
                      Lv.{heroState.level}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Container>
  );
}
