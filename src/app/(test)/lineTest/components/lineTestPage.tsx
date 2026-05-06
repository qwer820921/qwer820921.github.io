"use client";
import React, { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Container, Spinner } from "react-bootstrap";
import { useLineTestStore } from "../store/useLineTestStore";
import LandingPage from "./LandingPage";
import TokenErrorPage from "./TokenErrorPage";
import BindingForm from "./BindingForm";
import FriendInvitePage from "./FriendInvitePage";
import BookingPage from "./BookingPage";
import BookingSuccessPage from "./BookingSuccessPage";
import FriendCheckLoader from "./FriendCheckLoader";
import DashboardPage from "./DashboardPage";
import ResetPasswordConfirmPage from "./ResetPasswordConfirmPage";
import styles from "../styles/lineTest.module.css";

const LineTestPage: React.FC = () => {
  const searchParams = useSearchParams();
  const { step, tokenError, setRawToken, setStep } = useLineTestStore();

  useEffect(() => {
    const token = searchParams.get("token");
    const resetToken = searchParams.get("resetToken");

    if (resetToken) {
      // 密碼重設連結優先處理
      setStep("reset_password");
    } else {
      setRawToken(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderStep = () => {
    if (step === "landing") return <LandingPage />;
    if (step === "validating")
      return (
        <Container className="py-5 text-center">
          <Spinner variant="success" />
          <p className="mt-3 text-muted">驗證中...</p>
        </Container>
      );
    if (step === "token_error") return <TokenErrorPage reason={tokenError} />;
    if (step === "binding") return <BindingForm />;
    if (step === "friend_check") return <FriendCheckLoader />;
    if (step === "friend_invite") return <FriendInvitePage />;
    if (step === "dashboard") return <DashboardPage />;
    if (step === "booking") return <BookingPage />;
    if (step === "booking_success") return <BookingSuccessPage />;
    if (step === "reset_password") return <ResetPasswordConfirmPage />;
    return null;
  };

  return <div className={styles.pageWrapper}>{renderStep()}</div>;
};

export default LineTestPage;
