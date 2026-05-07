"use client";
import React, { useState, useEffect } from "react";
import {
  Container,
  Card,
  Button,
  Modal,
  Form,
  Alert,
  Spinner,
} from "react-bootstrap";
import { useLineTestStore } from "../store/useLineTestStore";
import { loginWithEmail, sendResetEmail } from "../services/authService";

type ModalView = "login" | "forgot" | "sent";

const LandingPage: React.FC = () => {
  const { rawToken, initialize, setSession, setStep, autoOpenWebLogin, setAutoOpenWebLogin } = useLineTestStore();

  // Modal 狀態
  const [showModal, setShowModal] = useState(false);
  const [modalView, setModalView] = useState<ModalView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetModal = () => {
    setModalView("login");
    setEmail("");
    setPassword("");
    setError(null);
    setLoading(false);
  };

  const openModal = () => {
    resetModal();
    setShowModal(true);
  };

  useEffect(() => {
    if (autoOpenWebLogin) {
      setAutoOpenWebLogin(false);
      openModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenWebLogin]);

  const closeModal = () => {
    setShowModal(false);
    resetModal();
  };

  const handleWebLogin = async () => {
    if (!email || !password) {
      setError("請輸入信箱與密碼");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await loginWithEmail(email, password).catch(() => ({
      success: false,
      session: null,
      error: "連線失敗，請稍後再試",
    }));
    setLoading(false);
    if (result.success && result.session) {
      setSession(result.session);
      closeModal();
      setStep("dashboard");
    } else {
      setError(result.error || "登入失敗");
    }
  };

  const handleSendReset = async () => {
    if (!email) {
      setError("請輸入信箱");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await sendResetEmail(email).catch(() => ({
      success: false,
      error: "連線失敗，請稍後再試",
    }));
    setLoading(false);
    if (result.success) {
      setModalView("sent");
    } else {
      setError(result.error || "發送失敗");
    }
  };

  return (
    <>
      <Container className="py-5" style={{ maxWidth: 480 }}>
        <Card className="shadow-sm text-center">
          <Card.Body className="p-5">
            <div style={{ fontSize: 56 }}>📅</div>
            <h3 className="mt-3 mb-2">線上預約</h3>
            <p className="text-muted mb-4">
              點擊下方按鈕開始預約，系統將自動驗證您的 LINE 身份。
            </p>
            <Button
              variant="success"
              size="lg"
              className="w-100 mb-3"
              {...(rawToken
                ? { onClick: () => initialize(rawToken) }
                : { href: "https://lin.ee/TLI3p5l", target: "_blank", rel: "noreferrer" }
              )}
            >
              立即預約
            </Button>
            {!rawToken && (
              <Button
                variant="outline-secondary"
                size="lg"
                className="w-100"
                onClick={openModal}
              >
                會員登入
              </Button>
            )}
          </Card.Body>
        </Card>
      </Container>

      {/* Web 登入 Modal */}
      <Modal show={showModal} onHide={closeModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            {modalView === "login" && "會員登入"}
            {modalView === "forgot" && "忘記密碼"}
            {modalView === "sent" && "已發送重設信件"}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}

          {modalView === "login" && (
            <Form
              onSubmit={(e) => {
                e.preventDefault();
                handleWebLogin();
              }}
            >
              <Form.Group className="mb-3">
                <Form.Label>信箱</Form.Label>
                <Form.Control
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>密碼</Form.Label>
                <Form.Control
                  type="password"
                  placeholder="請輸入密碼"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Form.Group>
              <div className="d-grid mb-2">
                <Button variant="success" type="submit" disabled={loading}>
                  {loading ? <Spinner size="sm" /> : "登入"}
                </Button>
              </div>
              <div className="text-center">
                <Button
                  variant="link"
                  size="sm"
                  className="text-muted"
                  onClick={() => {
                    setError(null);
                    setModalView("forgot");
                  }}
                >
                  忘記密碼？
                </Button>
              </div>
            </Form>
          )}

          {modalView === "forgot" && (
            <Form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendReset();
              }}
            >
              <p className="text-muted small mb-3">
                請輸入您的會員信箱，系統將發送重設密碼連結。
              </p>
              <Form.Group className="mb-3">
                <Form.Label>信箱</Form.Label>
                <Form.Control
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </Form.Group>
              <div className="d-grid mb-2">
                <Button variant="success" type="submit" disabled={loading}>
                  {loading ? <Spinner size="sm" /> : "發送重設連結"}
                </Button>
              </div>
              <div className="text-center">
                <Button
                  variant="link"
                  size="sm"
                  className="text-muted"
                  onClick={() => {
                    setError(null);
                    setModalView("login");
                  }}
                >
                  返回登入
                </Button>
              </div>
            </Form>
          )}

          {modalView === "sent" && (
            <div className="text-center py-2">
              <div style={{ fontSize: 48 }}>📧</div>
              <p className="mt-3">
                重設連結已發送至 <strong>{email}</strong>
              </p>
              <p className="text-muted small">
                請至信箱點擊連結完成密碼重設（連結 1 小時內有效）。
              </p>
              <Button
                variant="outline-secondary"
                className="mt-2"
                onClick={closeModal}
              >
                關閉
              </Button>
            </div>
          )}
        </Modal.Body>
      </Modal>
    </>
  );
};

export default LandingPage;
