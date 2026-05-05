"use client";
import React from "react";
import { Container, Alert, Button } from "react-bootstrap";
import { useLineTestStore } from "../store/useLineTestStore";

const reasonMap: Record<string, string> = {
  missing: "未帶入驗證 Token，請從 LINE 官方帳號的選單重新進入。",
  expired: "此連結已過期，請從 LINE 官方帳號的選單重新取得連結。",
  invalid: "Token 無效，請從 LINE 官方帳號的選單重新進入。",
};

interface Props {
  reason: string | null;
}

const TokenErrorPage: React.FC<Props> = ({ reason }) => {
  const { setStep } = useLineTestStore();
  return (
    <Container className="mt-5 py-5" style={{ maxWidth: 480 }}>
      <Alert variant="danger">
        <Alert.Heading>無法進入預約頁面</Alert.Heading>
        <p className="mb-3">{reasonMap[reason ?? "invalid"]}</p>
        <Button
          variant="outline-danger"
          size="sm"
          onClick={() => setStep("landing")}
        >
          ← 返回
        </Button>
      </Alert>
    </Container>
  );
};

export default TokenErrorPage;
