"use client";
import React, { useState } from "react";
import { Container, Card, Button, Alert, Spinner } from "react-bootstrap";
import { checkFriendship } from "../services/authService";
import { useLineTestStore } from "../store/useLineTestStore";

const FRIEND_URL = "https://lin.ee/TLI3p5l";

const FriendInvitePage: React.FC = () => {
  const { lineUserId, setIsFriend, setStep } = useLineTestStore();
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleConfirm = async () => {
    if (!lineUserId) return;
    setChecking(true);
    setFailed(false);

    const { isFriend } = await checkFriendship(lineUserId).catch(() => ({
      isFriend: false,
    }));

    if (isFriend) {
      setIsFriend(true);
      setStep("booking");
    } else {
      setFailed(true);
      setChecking(false);
    }
  };

  return (
    <Container className="py-5" style={{ maxWidth: 480 }}>
      <Card className="shadow-sm text-center">
        <Card.Body className="p-4">
          <div className="text-start mb-2">
            <Button
              variant="link"
              size="sm"
              className="text-muted p-0"
              onClick={() => setStep("landing")}
            >
              ← 返回
            </Button>
          </div>
          <div style={{ fontSize: 48 }}>💚</div>
          <h4 className="mt-2 mb-1">請先加入 LINE 官方帳號好友</h4>
          <p className="text-muted small mb-4">
            加入好友後，您才能收到預約確認與提醒通知。
          </p>

          <Button
            variant="success"
            size="lg"
            className="w-100 mb-3"
            href={FRIEND_URL}
            target="_blank"
          >
            加入好友
          </Button>

          {failed && (
            <Alert variant="warning" className="text-start">
              尚未偵測到您加入好友，請先點擊上方按鈕加入，再按確認。
            </Alert>
          )}

          <Button
            variant="outline-success"
            className="w-100"
            onClick={handleConfirm}
            disabled={checking}
          >
            {checking ? (
              <>
                <Spinner size="sm" className="me-2" />
                驗證中...
              </>
            ) : (
              "我已加入好友"
            )}
          </Button>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default FriendInvitePage;
