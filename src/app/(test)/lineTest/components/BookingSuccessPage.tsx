"use client";
import React, { useState } from "react";
import {
  Container,
  Card,
  Button,
  ListGroup,
  Badge,
  Spinner,
} from "react-bootstrap";
import { notificationService } from "../services/notificationService";
import { useLineTestStore } from "../store/useLineTestStore";

const BookingSuccessPage: React.FC = () => {
  const { session, currentBooking, setStep } = useLineTestStore();
  const [sending, setSending] = useState<string | null>(null);

  if (!currentBooking || !session) return null;

  const triggerNotify = async (type: string) => {
    setSending(type);
    const payload = {
      memberId: session.memberId,
      lineUserId: session.lineUserId,
      email: session.email,
      booking: currentBooking,
    };
    if (type === "reminder") await notificationService.notifyReminder(payload);
    if (type === "cancelled")
      await notificationService.notifyBookingCancelled(payload);
    if (type === "rescheduled")
      await notificationService.notifyBookingRescheduled(
        payload,
        "2099-12-31",
        "10:00"
      );
    setSending(null);
  };

  return (
    <Container className="py-5" style={{ maxWidth: 520 }}>
      <Card className="shadow-sm">
        <Card.Body className="p-4 text-center">
          <div className="text-start mb-1">
            <Button
              variant="link"
              size="sm"
              className="text-muted p-0"
              onClick={() => setStep("dashboard")}
            >
              ← 返回我的預約
            </Button>
          </div>
          <div style={{ fontSize: 56 }}>✅</div>
          <h4 className="mt-2 mb-1">預約成功！</h4>
          <p className="text-muted small mb-4">
            LINE 推播與 Email 通知已同步發送。
          </p>

          <ListGroup className="text-start mb-4">
            <ListGroup.Item>
              <span className="text-muted me-2">日期</span>
              <strong>{currentBooking.date}</strong>
            </ListGroup.Item>
            <ListGroup.Item>
              <span className="text-muted me-2">時間</span>
              <strong>{currentBooking.time}</strong>
            </ListGroup.Item>
            <ListGroup.Item>
              <span className="text-muted me-2">服務</span>
              <strong>{currentBooking.service}</strong>
            </ListGroup.Item>
            <ListGroup.Item>
              <span className="text-muted me-2">狀態</span>
              <Badge bg="success">confirmed</Badge>
            </ListGroup.Item>
          </ListGroup>

          <p className="text-muted small mb-2">通知服務 Demo 面板</p>
          <div className="d-grid gap-2">
            {[
              { type: "reminder", label: "🔔 觸發前一天提醒" },
              { type: "cancelled", label: "❌ 觸發取消通知" },
              { type: "rescheduled", label: "📅 觸發改期通知" },
            ].map(({ type, label }) => (
              <Button
                key={type}
                variant="outline-secondary"
                size="sm"
                disabled={sending !== null}
                onClick={() => triggerNotify(type)}
              >
                {sending === type ? (
                  <>
                    <Spinner size="sm" className="me-2" />
                    發送中...
                  </>
                ) : (
                  label
                )}
              </Button>
            ))}
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default BookingSuccessPage;
