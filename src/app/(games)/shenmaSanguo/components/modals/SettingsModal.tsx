"use client";

import React, { useId, useRef } from "react";
import { Form } from "react-bootstrap";
import { GearFill, VolumeUpFill, VolumeMuteFill } from "react-bootstrap-icons";
import { useSoundSettingsStore } from "../../store/soundSettingsStore";
import { useDialogFocus } from "../useDialogFocus";
import styles from "../../styles/shenmaSanguo.module.css";

interface Props {
  onClose: () => void;
  /** 關閉時開啟前的元素已經不在畫面上（或開啟時焦點不在任何元素上）時，焦點改交給這個元素（主頁 HUD 的「設定」按鈕） */
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * 主頁（戰場的 HUD）的遊戲設定（音效，只存在本機）：有名稱的對話框，鍵盤沿用 useDialogFocus。
 * 開啟時焦點在右上的關閉鈕，Tab／Shift+Tab 只在視窗內循環（關掉音效、音效模式收起後也是），Esc 關閉，
 * 關閉後焦點回到開啟它的按鈕（不在畫面上時交給「設定」）
 */
export default function SettingsModal({ onClose, fallbackFocusRef }: Props) {
  const { sfxEnabled, sfxPolyphony, setEnabled, setPolyphony } =
    useSoundSettingsStore();
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onKeyDown = useDialogFocus(panelRef, closeRef, onClose, {
    fallbackFocus: () => fallbackFocusRef?.current ?? null,
  });

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        ref={panelRef}
        className={styles.modalPanel}
        style={{ maxWidth: 360 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {/* Header */}
        <div className={styles.modalHeader}>
          <GearFill style={{ color: "var(--sg-primary)", fontSize: "1rem" }} />
          <span id={titleId} className={styles.modalTitle}>
            遊戲設定
          </span>
          <button
            ref={closeRef}
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="關閉遊戲設定"
          >
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
                  <label
                    htmlFor="sfx-enabled-modal"
                    className="d-block mb-0"
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: "var(--sg-text)",
                    }}
                  >
                    開啟音效
                  </label>
                  <div
                    id={descId}
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
                aria-describedby={descId}
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
                    type="button"
                    aria-pressed={sfxPolyphony === "single"}
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
                    type="button"
                    aria-pressed={sfxPolyphony === "faithful"}
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
