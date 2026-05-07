"use client";
import React, { useState } from "react";
import { Modal, Button, ListGroup, Form, Alert, Spinner } from "react-bootstrap";
import { useBookingEngineStore } from "../store/useBookingEngineStore";
import { useLineTestStore } from "../store/useLineTestStore";
import { submitBooking, rescheduleBooking, addMinutes, fetchSchedule } from "../services/bookingService";

function getDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ["日", "一", "二", "三", "四", "五", "六"][new Date(y, m - 1, d).getDay()];
}

const ConfirmModal: React.FC = () => {
  const {
    showConfirmModal, closeConfirmModal, openSlotModal,
    selectedService, selectedStore, selectedBeautician,
    selectedDate, selectedSegment, note, setNote,
    setStep, setSchedule, rescheduleBookingId, reset,
  } = useBookingEngineStore();
  const { session, setStep: setLineStep } = useLineTestStore();

  const isReschedule = !!rescheduleBookingId;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (
    !selectedService || !selectedStore || !selectedBeautician ||
    !selectedDate || !selectedSegment
  ) return null;

  const displayEndTime = addMinutes(selectedSegment.startTime, selectedService.duration);

  const handleBack = () => {
    setError(null);
    closeConfirmModal();
    if (selectedBeautician) {
      fetchSchedule(selectedBeautician.beauticianId).then(setSchedule);
    }
    openSlotModal();
  };

  const handleConfirm = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);

    if (isReschedule) {
      const result = await rescheduleBooking({
        bookingId: rescheduleBookingId!,
        newDate: selectedDate,
        newTime: selectedSegment.startTime,
      }).catch(() => ({ success: false as const, error: "網路錯誤" }));

      setLoading(false);

      if (!result.success) {
        setError(result.error ?? "改期失敗，請再試一次");
        return;
      }

      closeConfirmModal();
      reset();
      setLineStep("dashboard");
      return;
    }

    const result = await submitBooking({
      lineUserId: session.lineUserId || session.email,
      email: session.email,
      serviceName: selectedService.name,
      beauticianId: selectedBeautician.beauticianId,
      serviceId: selectedService.serviceId,
      storeId: selectedStore.storeId,
      date: selectedDate,
      startTime: selectedSegment.startTime,
      note,
    }).catch(() => ({ success: false as const, error: "網路錯誤" }));

    setLoading(false);

    if (!result.success) {
      setError(result.error ?? "預約失敗，請再試一次");
      return;
    }

    closeConfirmModal();
    setStep("success");
  };

  const summary = [
    { label: "療程",   value: selectedService.name },
    { label: "時長",   value: `${selectedService.duration} 分鐘` },
    { label: "美容師", value: selectedBeautician.name },
    { label: "服務據點", value: selectedStore.name },
    { label: "日期",   value: `${selectedDate}（週${getDayLabel(selectedDate)}）` },
    { label: "時段",   value: `${selectedSegment.startTime} – ${displayEndTime}` },
    { label: "定價",   value: `NT$ ${selectedService.price.toLocaleString()}` },
  ];

  return (
    <Modal show={showConfirmModal} onHide={handleBack} centered>
      <Modal.Header closeButton>
        <Modal.Title className="fs-6">確認預約</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}

        <ListGroup variant="flush" className="mb-3">
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

        <Form.Group>
          <Form.Label className="small text-muted">備註（選填）</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            placeholder="備註給美容師的訊息"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={loading}
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="outline-secondary"
          onClick={handleBack}
          disabled={loading}
        >
          返回
        </Button>
        <Button variant="success" onClick={handleConfirm} disabled={loading}>
          {loading ? (
            <>
              <Spinner size="sm" className="me-1" />
              處理中...
            </>
          ) : isReschedule ? "確認改期" : "確認預約"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ConfirmModal;
