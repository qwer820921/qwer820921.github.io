"use client";
import React, { useState } from "react";
import { Container, Card, Form, Button, Alert, Spinner } from "react-bootstrap";
import { useSearchParams } from "next/navigation";
import { resetPassword } from "../services/authService";
import { useLineTestStore } from "../store/useLineTestStore";

const ResetPasswordConfirmPage: React.FC = () => {
  const searchParams = useSearchParams();
  const resetToken = searchParams.get("resetToken") ?? "";
  const { setStep } = useLineTestStore();

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError("兩次密碼不一致");
      return;
    }
    if (newPassword.length < 6) {
      setError("密碼至少 6 個字元");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await resetPassword(resetToken, newPassword).catch(() => ({
      success: false,
      error: "連線失敗，請稍後再試",
    }));
    setLoading(false);
    if (result.success) {
      setDone(true);
    } else {
      setError(result.error || "重設失敗，連結可能已過期");
    }
  };

  if (done) {
    return (
      <Container className="py-5" style={{ maxWidth: 480 }}>
        <Card className="shadow-sm text-center">
          <Card.Body className="p-5">
            <div style={{ fontSize: 56 }}>✅</div>
            <h4 className="mt-3 mb-2">密碼重設成功</h4>
            <p className="text-muted mb-4">請使用新密碼登入。</p>
            <Button
              variant="success"
              className="w-100"
              onClick={() => setStep("landing")}
            >
              返回登入
            </Button>
          </Card.Body>
        </Card>
      </Container>
    );
  }

  return (
    <Container className="py-5" style={{ maxWidth: 480 }}>
      <Card className="shadow-sm">
        <Card.Body className="p-4">
          <Button
            variant="link"
            size="sm"
            className="text-muted p-0 mb-3"
            onClick={() => setStep("landing")}
          >
            ← 返回登入
          </Button>
          <h5 className="mb-4">設定新密碼</h5>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>新密碼</Form.Label>
              <Form.Control
                type="password"
                placeholder="至少 6 個字元"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoFocus
              />
            </Form.Group>
            <Form.Group className="mb-4">
              <Form.Label>確認新密碼</Form.Label>
              <Form.Control
                type="password"
                placeholder="再輸入一次"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Form.Group>
            <div className="d-grid">
              <Button variant="success" type="submit" disabled={loading}>
                {loading ? <Spinner size="sm" /> : "確認重設"}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default ResetPasswordConfirmPage;
