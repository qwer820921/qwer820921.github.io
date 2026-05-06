"use client";
import React from "react";
import { Container, Card, Button } from "react-bootstrap";
import { useLineTestStore } from "../store/useLineTestStore";

const LINE_FRIEND_URL = "https://lin.ee/TLI3p5l";

const LandingPage: React.FC = () => {
  const { rawToken, initialize } = useLineTestStore();

  const handleBook = () => {
    if (rawToken) {
      initialize(rawToken);
    } else {
      window.open(LINE_FRIEND_URL, "_blank");
    }
  };

  return (
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
            className="w-100"
            onClick={handleBook}
          >
            立即預約
          </Button>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default LandingPage;
