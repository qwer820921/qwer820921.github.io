"use client";

import React from "react";
import { Form } from "react-bootstrap";
import { GearFill, VolumeUpFill, VolumeMuteFill } from "react-bootstrap-icons";
import { useSoundSettingsStore } from "../../store/soundSettingsStore";
import styles from "../../styles/shenmaSanguo.module.css";

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const { sfxEnabled, sfxPolyphony, setEnabled, setPolyphony } =
    useSoundSettingsStore();

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={styles.modalPanel}
        style={{ maxWidth: 360 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.modalHeader}>
          <GearFill style={{ color: "var(--sg-primary)", fontSize: "1rem" }} />
          <span className={styles.modalTitle}>遊戲設定</span>
          <button className={styles.modalClose} onClick={onClose}>
            ×
          </button>
        </div>

        {/* Body */}
        <div
          className={styles.modalBody}
          style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
        >
          {/* 音效區塊 */}
          <div>
            <div
              style={{
                fontSize: "0.68rem",
                letterSpacing: "0.12em",
                color: "var(--sg-muted)",
                textTransform: "uppercase",
                marginBottom: "0.75rem",
              }}
            >
              音效
            </div>

            {/* 開啟 / 關閉 */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: sfxEnabled ? "0.85rem" : 0,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                {sfxEnabled ? (
                  <VolumeUpFill
                    style={{ color: "var(--sg-primary)", fontSize: "1rem" }}
                  />
                ) : (
                  <VolumeMuteFill
                    style={{ color: "var(--sg-muted)", fontSize: "1rem" }}
                  />
                )}
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
                  <div
                    style={{ fontSize: "0.68rem", color: "var(--sg-muted)" }}
                  >
                    攻擊、死亡、勝敗等遊戲音效
                  </div>
                </div>
              </div>
              <Form.Check
                type="switch"
                id="sfx-enabled-modal"
                checked={sfxEnabled}
                onChange={(e) => setEnabled(e.target.checked)}
                style={{ fontSize: "1.2rem" }}
              />
            </div>

            {/* 音效模式 */}
            {sfxEnabled && (
              <div>
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--sg-muted)",
                    marginBottom: "0.4rem",
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
                    style={{ flex: 1, padding: "0.4rem 0", fontSize: "0.8rem" }}
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
                    style={{ flex: 1, padding: "0.4rem 0", fontSize: "0.8rem" }}
                    onClick={() => setPolyphony("faithful")}
                  >
                    忠實模式
                  </button>
                </div>
                <p
                  style={{
                    fontSize: "0.67rem",
                    color: "var(--sg-muted)",
                    marginTop: "0.35rem",
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
        </div>
      </div>
    </div>
  );
}
