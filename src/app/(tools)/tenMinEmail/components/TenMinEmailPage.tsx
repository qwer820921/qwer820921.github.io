"use client";
import React, { useEffect, useState } from "react";
import {
  Container,
  Row,
  Col,
  Button,
  Modal,
  Badge,
  Spinner,
} from "react-bootstrap";
import { useTenMinEmailStore } from "../store/useTenMinEmailStore";
import { EmailMessage, EmailParticipant } from "../types";
import styles from "../styles/tenMinEmail.module.css";

const TenMinEmailPage: React.FC = () => {
  const {
    currentEmail,
    expiresAt,
    inbox,
    isLoading,
    isMessageLoading,
    error,
    createMail,
    fetchInbox,
    extendMail,
    fetchMessageDetail,
  } = useTenMinEmailStore();

  const [timeLeft, setTimeLeft] = useState<number>(0); // Seconds
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null);
  const selectedMail = inbox.find((m) => m.id === selectedMailId);
  const [showModal, setShowModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const [hydrated, setHydrated] = useState(false);

  // Sync hydration state
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Initial load
  useEffect(() => {
    if (!hydrated) return;

    const isExpired = expiresAt && Date.now() > expiresAt;

    if (!currentEmail || isExpired) {
      createMail();
    }
  }, [hydrated, currentEmail, expiresAt, createMail]);

  // Timer logic
  useEffect(() => {
    if (!expiresAt) return;

    const updateTimer = () => {
      const remaining = Math.max(
        0,
        Math.floor((expiresAt - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
    };

    updateTimer();
    const intervalId = setInterval(updateTimer, 1000);
    return () => clearInterval(intervalId);
  }, [expiresAt]);

  // Polling logic
  useEffect(() => {
    if (!currentEmail || (expiresAt && Date.now() > expiresAt)) return;

    // 初始抓取一次
    fetchInbox();

    const poll = () => {
      // 只有在視窗是「可見」狀態且沒過期時才抓取
      if (
        document.visibilityState === "visible" &&
        expiresAt &&
        Date.now() < expiresAt
      ) {
        fetchInbox();
      }
    };

    // 每 15 秒檢查一次 (節省 Redis 與 API 消耗)
    const intervalId = setInterval(poll, 15000);

    // 監聽視窗切換事件，如果切換回來立刻抓一次
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchInbox();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentEmail, expiresAt, fetchInbox]);

  const handleCopy = () => {
    if (currentEmail) {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(currentEmail);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } else {
        alert("您的瀏覽器不支持自動複製，請手動選取內容。");
      }
    }
  };

  const handleOpenMail = (mail: EmailMessage) => {
    setSelectedMailId(mail.id);
    setShowModal(true);
    fetchMessageDetail(mail.id);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const renderFrom = (from: string | EmailParticipant) => {
    if (typeof from === "string") return from;
    if (from && typeof from === "object") {
      return from.name ? `${from.name} <${from.address}>` : from.address;
    }
    return "未知發件人";
  };

  const progress = timeLeft > 0 ? (timeLeft / 600) * 100 : 0;
  const isWarning = timeLeft < 60; // Less than 1 minute

  return (
    <Container className={styles.container}>
      {/* Background Animation Overlay */}
      <div className={styles.bgAnimation}></div>

      {/* Header Section */}
      {/* Main Layout Row: Split on Desktop, Stacked on Mobile */}
      <Row className="g-4">
        {/* Left Column: Email Info & Timer (Sticky on Desktop) */}
        <Col lg={6}>
          <div className={styles.stickyWrapper}>
            <div className={styles.emailCard}>
              <h5
                className="text-uppercase text-white mb-3"
                style={{
                  letterSpacing: "2px",
                  textShadow: "0 2px 4px rgba(0,0,0,0.5)",
                }}
              >
                您的臨時信箱地址
              </h5>

              {isLoading ? (
                <div className="py-4">
                  <Spinner animation="border" variant="info" />
                </div>
              ) : (
                <>
                  <div
                    className={
                      currentEmail
                        ? styles.emailDisplay
                        : styles.emailPlaceholder
                    }
                  >
                    {currentEmail || "產生中..."}
                  </div>

                  <div className="d-flex flex-column gap-2 mt-4">
                    <Button
                      variant={copySuccess ? "success" : "info"}
                      onClick={handleCopy}
                      disabled={!currentEmail || timeLeft <= 0}
                      className="w-100 py-2 rounded-pill shadow-lg border-0 fw-bold"
                    >
                      {copySuccess ? "已複製！ ✓" : "複製信箱地址"}
                    </Button>
                    <div className="d-flex gap-2">
                      <Button
                        variant="primary"
                        onClick={() => createMail()}
                        className="flex-grow-1 py-2 rounded-pill shadow-lg border-0 fw-bold"
                      >
                        更換信箱
                      </Button>
                      <Button
                        variant="outline-info"
                        onClick={() => extendMail()}
                        disabled={!currentEmail || timeLeft <= 0}
                        className="flex-grow-1 py-2 rounded-pill shadow-lg fw-bold"
                        style={{
                          backdropFilter: "blur(4px)",
                          color: "#00f2fe",
                          borderColor: "#00f2fe",
                        }}
                      >
                        延長 10 分
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {expiresAt && timeLeft > 0 && (
                <div className={styles.timerWrapper}>
                  <div className={styles.timerText}>
                    剩餘時間：{formatTime(timeLeft)}
                  </div>
                  <div className={styles.progressBar}>
                    <div
                      className={`${styles.progressFill} ${isWarning ? styles.progressWarning : ""}`}
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {expiresAt && timeLeft <= 0 && (
                <Badge bg="danger" className="mt-3 p-2">
                  信箱已過期
                </Badge>
              )}
            </div>
          </div>
        </Col>

        {/* Right Column: Inbox Section */}
        <Col lg={6}>
          <div className={styles.inboxHeader}>
            <h4 className="m-0 fw-bold">收件匣</h4>
            <Badge pill bg="info" className="px-3 py-2 shadow-sm">
              {inbox.length} 封信件
            </Badge>
          </div>

          {inbox.length === 0 ? (
            <div className={styles.emptyInbox}>
              <div className="mb-3">
                <Spinner
                  animation="grow"
                  size="sm"
                  variant="primary"
                  className="me-2"
                />
                正在等待新信件...
              </div>
              <small className="text-secondary">
                信件發出後可能需要幾秒鐘才會顯示。
              </small>
            </div>
          ) : (
            inbox.map((mail, idx) => (
              <div
                key={mail.id || idx}
                className={styles.inboxCard}
                onClick={() => handleOpenMail(mail)}
              >
                <Row className="align-items-center">
                  <Col xs={8} md={9}>
                    <div className={styles.mailSubject}>
                      {mail.subject || "(無主旨)"}
                    </div>
                    <div className={styles.mailFrom}>
                      來自：{renderFrom(mail.from)}
                    </div>
                  </Col>
                  <Col xs={4} md={3}>
                    <div className={styles.mailTime}>
                      {mail.date || mail.createdAt
                        ? new Date(
                            mail.date || mail.createdAt!
                          ).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "剛才"}
                    </div>
                  </Col>
                </Row>
              </div>
            ))
          )}
        </Col>
      </Row>

      {/* Email View Modal */}
      <Modal
        show={showModal}
        onHide={() => {
          setShowModal(false);
          setSelectedMailId(null);
        }}
        size="lg"
        centered
        dialogClassName={styles.modalDialog}
        contentClassName={styles.modalContent}
      >
        <Modal.Header closeButton className={styles.modalHeader}>
          <Modal.Title>{selectedMail?.subject || "無主旨"}</Modal.Title>
        </Modal.Header>
        <Modal.Body className={styles.modalBody}>
          {/* 固定資訊區 */}
          {/* 固定頂部：資訊區 */}
          <div className={styles.modalInfoSection}>
            <Row className="g-3">
              <Col md={6}>
                <div className={styles.infoBadge}>
                  <div className={styles.infoLabel}>發件人</div>
                  <div className={styles.infoValue}>
                    {selectedMail ? renderFrom(selectedMail.from) : "未知"}
                  </div>
                </div>
              </Col>
              <Col md={6}>
                <div className={styles.infoBadge}>
                  <div className={styles.infoLabel}>收件時間</div>
                  <div className={styles.infoValue}>
                    {selectedMail?.date || selectedMail?.createdAt
                      ? new Date(
                          selectedMail.date || selectedMail!.createdAt!
                        ).toLocaleString()
                      : "近期"}
                  </div>
                </div>
              </Col>
            </Row>
          </div>

          {/* 可捲動內容區 */}
          <div className={styles.mailContent}>
            {isMessageLoading ? (
              <div className="text-center py-5">
                <Spinner animation="border" variant="info" className="mb-3" />
                <div className="text-secondary opacity-75">
                  正在努力載入正文中...
                </div>
              </div>
            ) : (
              <>
                {selectedMail?.html ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: selectedMail.html }}
                  />
                ) : selectedMail?.text ? (
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {selectedMail.text}
                  </div>
                ) : selectedMail?.body ? (
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {selectedMail.body}
                  </div>
                ) : selectedMail?.intro ? (
                  <div className="text-secondary italic">
                    <div className="text-primary mb-3">
                      <span className="fw-bold">提示：目前的內容為摘要</span>
                    </div>
                    <p>{selectedMail.intro}</p>
                  </div>
                ) : (
                  <div className="text-muted text-center py-5 opacity-50">
                    (此信件目前無內文資料)
                  </div>
                )}
              </>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer className={styles.modalFooter}>
          <Button
            variant="outline-secondary"
            onClick={() => setShowModal(false)}
            className="px-3 rounded-pill"
          >
            關閉視窗
          </Button>
        </Modal.Footer>
      </Modal>

      {error && (
        <div className="position-fixed bottom-0 start-50 translate-middle-x mb-4">
          <Badge bg="danger" className="p-3 shadow-lg">
            {error}
          </Badge>
        </div>
      )}
    </Container>
  );
};

export default TenMinEmailPage;
