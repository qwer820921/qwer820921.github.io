"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Button,
  Form,
  Row,
  Col,
  Alert,
  Spinner,
  Badge,
} from "react-bootstrap";
import { PlayerState, SyncStatusType } from "../types/player";
import { StageDataManager } from "../engine/StageDataManager";
import styles from "../styles/shenmaSanguoJs.module.css";

interface PlayerInfoModalProps {
  show: boolean;
  player: PlayerState | null;
  syncStatus: SyncStatusType;
  onClose: () => void;
  /** 改暱稱：共用帳號要等伺服器回應 */
  onUpdateNickname: (
    nickname: string
  ) => Promise<{ success: boolean; error?: string }>;
  /** 切換金鑰：雲端找不到存檔時回 needsCreate，不會自動建立 */
  onSwitchKey: (
    key: string
  ) => Promise<{ success: boolean; error?: string; needsCreate?: boolean }>;
  /** 明確建立新存檔（切換時雲端找不到，使用者再按一次才呼叫） */
  onCreateProfile?: (
    key: string,
    nickname: string
  ) => Promise<{ success: boolean; error?: string }>;
  onGuestMode?: () => Promise<void>;
  /** 共用帳號：唯讀讀回雲端存檔；訪客：本機存檔不用同步 */
  onForceSync: () => Promise<{ success: boolean; error?: string }>;
  onOpenStageSelector?: () => void;
  onLogout: () => void;
  /** 共用帳號（和 Godot 版共用）或訪客 */
  mode?: "none" | "shared" | "guest";
  /** 存檔的說明（唯讀、衝突、結果不明、不支援的資料等） */
  notice?: string | null;
  /** 不能改暱稱的原因；可以改時是 null */
  writeDisabledReason?: string | null;
}

const SYNC_LABEL: Record<SyncStatusType, { bg: string; text: string }> = {
  idle: { bg: "success", text: "已同步" },
  syncing: { bg: "primary", text: "同步中" },
  pending: { bg: "secondary", text: "待同步" },
  offline: { bg: "secondary", text: "本機存檔" },
  error: { bg: "danger", text: "沒有保存" },
  readonly: { bg: "secondary", text: "唯讀" },
  conflict: { bg: "warning", text: "已改用雲端版本" },
  unknown: { bg: "danger", text: "結果待確認" },
};

export const PlayerInfoModal: React.FC<PlayerInfoModalProps> = ({
  show,
  player,
  syncStatus,
  onClose,
  onUpdateNickname,
  onSwitchKey,
  onGuestMode,
  onForceSync,
  onOpenStageSelector,
  onLogout,
  onCreateProfile,
  mode = "shared",
  notice = null,
  writeDisabledReason = null,
}) => {
  const [isEditingNick, setIsEditingNick] = useState(false);
  const [nickInput, setNickInput] = useState(player?.nickname || "");
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "danger";
    msg: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // 內嵌式金鑰切換狀態
  const [showKeySwitch, setShowKeySwitch] = useState(false);
  const [switchKeyInput, setSwitchKeyInput] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  // 切換時雲端找不到存檔：等使用者確認才建立
  const [switchCreateKey, setSwitchCreateKey] = useState<string | null>(null);
  // 正在保存暱稱的是哪個帳號（換了帳號後，前一個帳號遲到的結果不會解除新帳號的保存中，也不會顯示在新帳號）
  const [savingFor, setSavingFor] = useState<string | null>(null);
  const currentKeyRef = useRef<string | null>(player?.key ?? null);
  useEffect(() => {
    currentKeyRef.current = player?.key ?? null;
  });

  // 登出確認狀態 (取代原生 window.confirm)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // 換了帳號：收起暱稱編輯，不把前一個帳號輸入到一半的暱稱留給新帳號
  const [editKey, setEditKey] = useState<string | null>(player?.key ?? null);
  if ((player?.key ?? null) !== editKey) {
    setEditKey(player?.key ?? null);
    setIsEditingNick(false);
  }

  if (!player) return null;
  const savingNick = savingFor !== null && savingFor === player.key;

  // 等保存結果才說明；失敗、衝突或結果不明時照實說（只說明在同一個帳號上）
  const handleSaveNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickInput.trim() || savingNick) return;
    const forKey = player.key;
    setSavingFor(forKey);
    try {
      const res = await onUpdateNickname(nickInput.trim());
      if (currentKeyRef.current !== forKey) return;
      if (res.success) {
        setIsEditingNick(false);
        setFeedback({ type: "success", msg: "主公暱稱已保存！" });
      } else {
        setFeedback({ type: "danger", msg: res.error || "暱稱沒有保存" });
      }
    } finally {
      setSavingFor((cur) => (cur === forKey ? null : cur));
    }
  };

  const handleCopyKey = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(player.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await onForceSync();
      if (res.success) {
        setFeedback({
          type: "success",
          msg:
            mode === "guest"
              ? "訪客存檔只在這個瀏覽器，不需要同步。"
              : "已讀取雲端的最新存檔。",
        });
      } else {
        setFeedback({
          type: "danger",
          msg: res.error || "讀取雲端存檔失敗，請稍後再試",
        });
      }
    } catch {
      setFeedback({ type: "danger", msg: "網路通訊異常，請稍後再試" });
    } finally {
      setSyncing(false);
    }
  };

  const handleKeySwitchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = switchKeyInput.trim();
    if (!trimmed) return;
    setIsSwitching(true);
    setSwitchError(null);
    setSwitchCreateKey(null);
    try {
      const res = await onSwitchKey(trimmed);
      if (res.success) {
        setFeedback({
          type: "success",
          msg: `已成功切換至金鑰 [${trimmed}]！`,
        });
        setShowKeySwitch(false);
        setSwitchKeyInput("");
      } else {
        setSwitchError(res.error || "切換金鑰失敗");
        if (res.needsCreate) setSwitchCreateKey(trimmed);
      }
    } catch {
      setSwitchError("切換金鑰發生異常，請稍後再試");
    } finally {
      setIsSwitching(false);
    }
  };

  const handleSwitchCreate = async () => {
    if (!switchCreateKey || !onCreateProfile) return;
    setIsSwitching(true);
    setSwitchError(null);
    try {
      const res = await onCreateProfile(switchCreateKey, "");
      if (res.success) {
        setFeedback({
          type: "success",
          msg: `已用金鑰 [${switchCreateKey}] 建立並載入新存檔！`,
        });
        setShowKeySwitch(false);
        setSwitchKeyInput("");
        setSwitchCreateKey(null);
      } else {
        setSwitchError(res.error || "建立失敗");
      }
    } catch {
      setSwitchError("建立發生異常，請稍後再試");
    } finally {
      setIsSwitching(false);
    }
  };

  const handleGuestSwitch = async () => {
    if (!onGuestMode) return;
    setIsSwitching(true);
    setSwitchError(null);
    try {
      await onGuestMode();
      setFeedback({ type: "success", msg: "已切換至遊俠訪客臨時新存檔！" });
      setShowKeySwitch(false);
    } catch {
      setSwitchError("訪客模式切換失敗");
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <Modal
      show={show}
      onHide={onClose}
      centered
      contentClassName={styles.darkModalContent}
    >
      <Modal.Header
        closeButton
        closeVariant="white"
        className={styles.modalHeader}
      >
        <Modal.Title className="text-warning fw-bold d-flex align-items-center gap-2">
          <span>👤</span>
          <span>主公資產與帳號資訊</span>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className={styles.modalBody}>
        {notice && (
          <Alert
            variant="warning"
            className="py-2 small mb-3"
            data-testid="player-info-notice"
          >
            {notice}
          </Alert>
        )}
        {feedback && (
          <Alert
            variant={feedback.type}
            className="py-2 small mb-3"
            dismissible
            onClose={() => setFeedback(null)}
            data-testid="player-info-feedback"
          >
            {feedback.msg}
          </Alert>
        )}

        {/* 暱稱編輯 */}
        <div
          className="p-3 mb-3 rounded"
          style={{
            background: "rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="text-secondary small mb-1">主公稱謂</div>
          {isEditingNick ? (
            <Form onSubmit={handleSaveNickname} className="d-flex gap-2">
              <Form.Control
                type="text"
                value={nickInput}
                onChange={(e) => setNickInput(e.target.value)}
                maxLength={20}
                className={styles.selectDark}
                autoFocus
              />
              <Button
                variant="warning"
                size="sm"
                type="submit"
                disabled={savingNick}
                data-testid="player-info-nick-save"
              >
                {savingNick ? "保存中…" : "儲存"}
              </Button>
              <Button
                variant="outline-secondary"
                size="sm"
                type="button"
                disabled={savingNick}
                onClick={() => setIsEditingNick(false)}
              >
                取消
              </Button>
            </Form>
          ) : (
            <div className="d-flex align-items-center justify-content-between">
              <h5
                className="text-light fw-bold mb-0"
                data-testid="player-info-nickname"
              >
                {player.nickname}
              </h5>
              <Button
                variant="outline-warning"
                size="sm"
                disabled={writeDisabledReason !== null}
                title={writeDisabledReason ?? undefined}
                data-testid="player-info-nick-edit"
                onClick={() => {
                  setNickInput(player.nickname);
                  setIsEditingNick(true);
                }}
              >
                ✏️ 修改稱謂
              </Button>
            </div>
          )}
        </div>

        {/* 數值儀表板 */}
        <Row className="g-2 text-center mb-3">
          <Col xs={4}>
            <div
              className="p-2 rounded"
              style={{ background: "rgba(0,0,0,0.25)" }}
            >
              <div className="text-secondary small">主公等級</div>
              <div className="text-warning fw-bold fs-5">Lv.{player.level}</div>
            </div>
          </Col>
          <Col xs={4}>
            <div
              className="p-2 rounded"
              style={{ background: "rgba(0,0,0,0.25)" }}
            >
              <div className="text-secondary small">世界金幣</div>
              <div className="text-warning fw-bold fs-5">
                🪙 {player.gold.toLocaleString()}
              </div>
            </div>
          </Col>
          <Col xs={4}>
            <div
              className="p-2 rounded"
              style={{ background: "rgba(0,0,0,0.25)" }}
            >
              <div className="text-secondary small">出征容量</div>
              <div className="text-info fw-bold fs-5">
                {player.capacity} Cost
              </div>
            </div>
          </Col>
          <Col xs={6}>
            <div
              className="p-2 rounded"
              style={{ background: "rgba(0,0,0,0.25)" }}
            >
              <div className="text-secondary small">最高通關章節</div>
              <div className="text-light fw-bold small mt-1">
                {player.max_stage}
                {(() => {
                  const s = StageDataManager.getInstance().getStageById(
                    player.max_stage
                  );
                  return s ? ` (${s.name})` : "";
                })()}
              </div>
            </div>
          </Col>
          <Col xs={6}>
            <div
              className="p-2 rounded"
              style={{ background: "rgba(0,0,0,0.25)" }}
            >
              <div className="text-secondary small">麾下名將錄</div>
              <div className="text-light fw-bold small mt-1">
                {player.heroes.length} 位名將
              </div>
            </div>
          </Col>
        </Row>

        {/* 存檔金鑰與雲端管理 */}
        <div
          className="p-3 rounded mb-3"
          style={{
            background: "rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="d-flex justify-content-between align-items-center mb-2">
            <span className="text-secondary small fw-bold">
              存檔金鑰 (Account Key)
            </span>
            <div className="d-flex gap-1">
              <Badge
                bg={SYNC_LABEL[syncStatus].bg}
                data-testid="player-info-sync"
                data-sync={syncStatus}
              >
                {SYNC_LABEL[syncStatus].text}
              </Badge>
              <Badge
                bg="secondary"
                className="font-monospace"
                data-testid="player-info-mode"
              >
                {mode === "guest"
                  ? "訪客（只在這個瀏覽器）"
                  : "共用帳號（和 Godot 版共用）"}
              </Badge>
            </div>
          </div>
          <div className="d-flex align-items-center justify-content-between bg-dark p-2 rounded mb-2">
            <code
              className="text-warning font-monospace text-truncate me-2"
              style={{ maxWidth: 240 }}
            >
              {player.key}
            </code>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={handleCopyKey}
              className="text-nowrap"
            >
              {copied ? "已複製！" : "📋 複製"}
            </Button>
          </div>

          {/* 內嵌式切換金鑰展開面板 */}
          {showKeySwitch && (
            <div
              className="p-3 my-2 rounded"
              style={{
                background: "rgba(0,0,0,0.45)",
                border: "1px solid rgba(245, 158, 11, 0.4)",
              }}
            >
              <div className="text-secondary small mb-2">
                輸入金鑰切換存檔（雲端找不到時會先詢問，確認後才建立）：
              </div>
              <Form onSubmit={handleKeySwitchSubmit}>
                <Form.Control
                  type="text"
                  placeholder="例：eric_sanguo_2026"
                  value={switchKeyInput}
                  onChange={(e) => setSwitchKeyInput(e.target.value)}
                  disabled={isSwitching}
                  className={`${styles.selectDark} mb-2`}
                  autoFocus
                />
                {switchError && (
                  <Alert variant="danger" className="py-1 small mb-2">
                    {switchError}
                  </Alert>
                )}
                {switchCreateKey && onCreateProfile && (
                  <Button
                    variant="outline-warning"
                    size="sm"
                    type="button"
                    className="w-100 mb-2"
                    disabled={isSwitching}
                    onClick={() => void handleSwitchCreate()}
                    data-testid="player-info-create-confirm"
                  >
                    用「{switchCreateKey}」建立新存檔
                  </Button>
                )}
                <div className="d-flex gap-2">
                  <Button
                    variant="warning"
                    size="sm"
                    type="submit"
                    disabled={isSwitching || !switchKeyInput.trim()}
                    className="flex-fill fw-bold"
                  >
                    {isSwitching ? (
                      <>
                        <Spinner
                          animation="border"
                          size="sm"
                          className="me-1"
                        />
                        切換中...
                      </>
                    ) : (
                      "確認切換"
                    )}
                  </Button>
                  <Button
                    variant="outline-info"
                    size="sm"
                    type="button"
                    disabled={isSwitching}
                    onClick={handleGuestSwitch}
                  >
                    訪客試玩
                  </Button>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    type="button"
                    disabled={isSwitching}
                    onClick={() => {
                      setShowKeySwitch(false);
                      setSwitchError(null);
                    }}
                  >
                    取消
                  </Button>
                </div>
              </Form>
            </div>
          )}

          <div className="d-flex gap-2">
            <Button
              variant="outline-info"
              size="sm"
              className="w-100"
              onClick={handleSync}
              disabled={syncing}
              data-testid="player-info-sync-btn"
            >
              {syncing ? (
                <>
                  <Spinner animation="border" size="sm" className="me-1" />
                  同步中...
                </>
              ) : mode === "guest" ? (
                "本機存檔（不連雲端）"
              ) : (
                "☁️ 手動同步（讀取雲端存檔）"
              )}
            </Button>
            <Button
              variant={showKeySwitch ? "secondary" : "outline-warning"}
              size="sm"
              className="w-100 text-nowrap"
              onClick={() => {
                setShowKeySwitch(!showKeySwitch);
                setSwitchError(null);
              }}
            >
              {showKeySwitch ? "收起金鑰輸入" : "🔄 切換金鑰"}
            </Button>
          </div>
        </div>

        {/* 關卡選擇捷徑 */}
        {onOpenStageSelector && (
          <div className="mb-3">
            <Button
              variant="outline-warning"
              size="sm"
              className="w-100 fw-bold py-2"
              onClick={() => {
                onClose();
                onOpenStageSelector();
              }}
            >
              🗺️ 前往戰略軍情地圖 (選擇作戰關卡)
            </Button>
          </div>
        )}

        {/* 登出區塊 (含安全確認機制) */}
        {showLogoutConfirm ? (
          <div
            className="p-2 rounded border border-danger text-start"
            style={{ background: "rgba(239, 68, 68, 0.15)" }}
          >
            <div className="text-danger small fw-bold mb-2">
              ⚠️ 確定要登出目前存檔嗎？請確保您已記妥金鑰（{player.key}
              ）以利再次登入。
            </div>
            <div className="d-flex justify-content-end gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onClose();
                  onLogout();
                }}
              >
                確認登出
              </Button>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setShowLogoutConfirm(false)}
              >
                取消
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-end">
            <Button
              variant="outline-danger"
              size="sm"
              onClick={() => setShowLogoutConfirm(true)}
            >
              登出當前帳號
            </Button>
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
};
