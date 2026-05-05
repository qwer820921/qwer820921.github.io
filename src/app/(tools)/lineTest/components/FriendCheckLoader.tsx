"use client";
import React, { useEffect } from "react";
import { Container, Spinner } from "react-bootstrap";
import { checkFriendship } from "../services/authService";
import { useLineTestStore } from "../store/useLineTestStore";

const FriendCheckLoader: React.FC = () => {
  const { lineUserId, setIsFriend, setStep } = useLineTestStore();

  useEffect(() => {
    if (!lineUserId) return;
    checkFriendship(lineUserId)
      .then(({ isFriend }) => {
        setIsFriend(isFriend);
        setStep(isFriend ? "booking" : "friend_invite");
      })
      .catch(() => setStep("friend_invite"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Container className="py-5 text-center">
      <Spinner variant="success" />
      <p className="mt-3 text-muted">確認好友狀態中...</p>
    </Container>
  );
};

export default FriendCheckLoader;
