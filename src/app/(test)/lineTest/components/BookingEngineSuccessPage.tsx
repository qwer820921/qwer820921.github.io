"use client";
import React from "react";
import { Container, Card, Button, ListGroup } from "react-bootstrap";
import { useBookingEngineStore } from "../store/useBookingEngineStore";
import { useLineTestStore } from "../store/useLineTestStore";
import { addMinutes } from "../services/bookingService";

function getDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ["日", "一", "二", "三", "四", "五", "六"][new Date(y, m - 1, d).getDay()];
}

const BookingEngineSuccessPage: React.FC = () => {
  const {
    selectedService, selectedStore, selectedBeautician,
    selectedDate, selectedSegment, note,
    reset, lastCreatedBookingId, startReschedule,
  } = useBookingEngineStore();
  const { setStep: setLineStep } = useLineTestStore();

  if (!selectedService || !selectedBeautician || !selectedDate || !selectedSegment) {
    return null;
  }

  const displayEndTime = addMinutes(selectedSegment.startTime, selectedService.duration);

  const summary = [
    { label: "療程",     value: selectedService.name },
    { label: "時長",     value: `${selectedService.duration} 分鐘` },
    { label: "美容師",   value: selectedBeautician.name },
    { label: "服務據點", value: selectedStore?.name ?? "" },
    { label: "日期",     value: `${selectedDate}（週${getDayLabel(selectedDate)}）` },
    { label: "時段",     value: `${selectedSegment.startTime} – ${displayEndTime}` },
    { label: "定價",     value: `NT$ ${selectedService.price.toLocaleString()}` },
    ...(note ? [{ label: "備註", value: note }] : []),
  ];

  const handleEditBack = () => {
    if (!lastCreatedBookingId || !selectedBeautician || !selectedService || !selectedStore) return;
    startReschedule(lastCreatedBookingId, selectedBeautician, selectedService, selectedStore);
  };

  const handleGoHome = () => {
    reset();
    setLineStep("dashboard");
  };

  return (
    <Container className="py-5" style={{ maxWidth: 480 }}>
      <Card className="shadow-sm">
        <Card.Body className="p-4 text-center">
          <div style={{ fontSize: 48 }} className="mb-2">✅</div>
          <h5 className="fw-bold mb-1">預約成功</h5>
          <p className="text-muted small mb-4">我們將在預約前提醒您</p>

          <ListGroup variant="flush" className="text-start mb-4">
            {summary.map(({ label, value }) => (
              <ListGroup.Item
                key={label}
                className="px-0 d-flex justify-content-between"
              >
                <span className="text-muted">{label}</span>
                <strong>{value}</strong>
              </ListGroup.Item>
            ))}
          </ListGroup>

          <div className="d-flex gap-2">
            {lastCreatedBookingId && (
              <Button variant="outline-secondary" className="w-100" onClick={handleEditBack}>
                返回編輯
              </Button>
            )}
            <Button variant="success" className="w-100" onClick={handleGoHome}>
              回到預約首頁
            </Button>
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default BookingEngineSuccessPage;
