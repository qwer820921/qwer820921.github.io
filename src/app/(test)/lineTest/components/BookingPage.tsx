"use client";
import React, { useState } from "react";
import { Container, Card, Form, Button, Alert, Spinner } from "react-bootstrap";
import { gasCall } from "../services/gasClient";
import { notificationService } from "../services/notificationService";
import { useLineTestStore } from "../store/useLineTestStore";
import type { Booking, BookingForm } from "../types";

const SERVICES = ["深層護膚", "美甲", "除毛", "眼睫毛", "其他"];

const BookingPage: React.FC = () => {
  const { session, setCurrentBooking, setStep } = useLineTestStore();
  const [form, setForm] = useState<BookingForm>({
    date: "",
    time: "",
    service: SERVICES[0],
    note: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setLoading(true);
    setError(null);

    const result = await gasCall<{
      success: boolean;
      booking: Booking;
      error?: string;
    }>("createBooking", { memberId: session.memberId, ...form }).catch(() => ({
      success: false,
      booking: null as unknown as Booking,
      error: "網路錯誤",
    }));

    if (!result.success) {
      setError(result.error ?? "預約失敗，請再試一次");
      setLoading(false);
      return;
    }

    setCurrentBooking(result.booking);

    // 觸發 LINE 推播 + Email 通知
    await notificationService.notifyBookingConfirmed({
      memberId: session.memberId,
      lineUserId: session.lineUserId,
      email: session.email,
      booking: result.booking,
    });

    setStep("booking_success");
  };

  return (
    <Container className="py-5" style={{ maxWidth: 520 }}>
      <Card className="shadow-sm">
        <Card.Body className="p-4">
          <Button
            variant="link"
            size="sm"
            className="text-muted p-0 mb-3"
            onClick={() => setStep("dashboard")}
          >
            ← 返回我的預約
          </Button>
          <h4 className="mb-1">線上預約</h4>
          <p className="text-muted small mb-4">會員：{session?.email}</p>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>預約日期</Form.Label>
              <Form.Control
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                required
                min={new Date().toISOString().split("T")[0]}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>預約時間</Form.Label>
              <Form.Control
                type="time"
                name="time"
                value={form.time}
                onChange={handleChange}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>服務項目</Form.Label>
              <Form.Select
                name="service"
                value={form.service}
                onChange={handleChange}
              >
                {SERVICES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-4">
              <Form.Label>備註</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                name="note"
                value={form.note}
                onChange={handleChange}
                placeholder="（選填）"
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
                  送出預約中...
                </>
              ) : (
                "確認預約"
              )}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default BookingPage;
