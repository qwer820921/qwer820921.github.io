"use client";
import React from "react";
import { Container, Card, Button } from "react-bootstrap";
import { useLineTestStore } from "../store/useLineTestStore";

const LINE_FRIEND_URL = "https://lin.ee/TLI3p5l";

const LandingPage: React.FC = () => {
  const { rawToken, initialize } = useLineTestStore();

  const handleBook = () => {
    initialize(rawToken);
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
            className="w-100 mb-3"
            onClick={handleBook}
          >
            立即預約
          </Button>
          <p className="text-muted small">
            尚未加入官方帳號？
            <a
              href={LINE_FRIEND_URL}
              target="_blank"
              className="ms-1 text-success"
            >
              點此加入好友
            </a>
          </p>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default LandingPage;
