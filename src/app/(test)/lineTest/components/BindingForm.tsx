"use client";
import React, { useState } from "react";
import { Container, Card, Form, Button, Alert, Spinner } from "react-bootstrap";
import { bindLineUserId } from "../services/authService";
import { useLineTestStore } from "../store/useLineTestStore";

const BindingForm: React.FC = () => {
  const { lineUserId, setSession, setStep } = useLineTestStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lineUserId) return;
    setLoading(true);
    setError(null);

    const result = await bindLineUserId(email, password, lineUserId).catch(
      () => ({ success: false, session: null, error: "網路錯誤，請稍後再試" })
    );

    if (!result.success || !result.session) {
      setError(result.error ?? "綁定失敗，請再試一次");
      setLoading(false);
      return;
    }

    setSession(result.session);
    setStep("friend_check");
  };

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
            ← 返回
          </Button>
          <h4 className="mb-1">建立 / 綁定帳號</h4>
          <p className="text-muted small mb-4">
            輸入您的 Email 與密碼，系統將自動與您的 LINE 帳號綁定。
          </p>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
              />
            </Form.Group>
            <Form.Group className="mb-4">
              <Form.Label>密碼</Form.Label>
              <Form.Control
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="請輸入密碼"
              />
            </Form.Group>
            <Button
              type="submit"
              variant="success"
              className="w-100"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Spinner size="sm" className="me-2" />
                  綁定中...
                </>
              ) : (
                "確認並繼續"
              )}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default BindingForm;
