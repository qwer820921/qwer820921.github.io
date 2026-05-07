"use client";
import React from "react";
import { Modal, Button, Badge } from "react-bootstrap";
import { useBookingEngineStore } from "../store/useBookingEngineStore";
import { addMinutes } from "../services/bookingService";
import type { ScheduleSegment } from "../types/bookingEngine";

const SLOT_INTERVAL = 30; // 每幾分鐘一個可選起始點

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

const SlotModal: React.FC = () => {
  const {
    showSlotModal, closeSlotModal, openConfirmModal,
    schedule, selectedDate, selectSegment, selectedService,
  } = useBookingEngineStore();

  const day      = schedule.find((d) => d.date === selectedDate);
  const segments = day?.segments ?? [];
  const duration = selectedService?.duration ?? 60;
  const buffer   = selectedService?.buffer   ?? 0;
  const total    = duration + buffer;

  const getSlots = (seg: ScheduleSegment): string[] => {
    const start = timeToMin(seg.startTime);
    const end   = timeToMin(seg.endTime);
    const slots: string[] = [];
    for (let t = start; t + total <= end; t += SLOT_INTERVAL) {
      slots.push(minToTime(t));
    }
    return slots;
  };

  const hasAvailable = segments.some(
    (s) => s.status === "available" && getSlots(s).length > 0
  );

  const handleSlotClick = (startTime: string) => {
    selectSegment({ startTime, endTime: addMinutes(startTime, duration), status: "available" });
    closeSlotModal();
    openConfirmModal();
  };

  return (
    <Modal show={showSlotModal} onHide={closeSlotModal} centered>
      <Modal.Header closeButton>
        <Modal.Title className="fs-6">{selectedDate} 可用時段</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {segments.length === 0 ? (
          <p className="text-muted text-center py-3">本日無排班</p>
        ) : !hasAvailable ? (
          <p className="text-muted text-center py-3">本日時段已全數預約，請選擇其他日期</p>
        ) : (
          <div>
            {segments.map((seg, i) => {
              const prev = segments[i - 1];
              return (
                <React.Fragment key={i}>
                  {prev && prev.endTime !== seg.startTime && (
                    <div
                      className="px-3 py-2 rounded mb-2 text-center small text-muted"
                      style={{ background: "#f5f5f5", border: "1px solid #eee" }}
                    >
                      {prev.endTime} – {seg.startTime}　午休
                    </div>
                  )}

                  {seg.status === "available" ? (
                    getSlots(seg).map((startTime) => (
                      <div
                        key={startTime}
                        className="px-3 py-2 rounded mb-2 d-flex justify-content-between align-items-center"
                        style={{
                          background: "#e8f5e9",
                          border: "1px solid #a5d6a7",
                          color: "#2e7d32",
                          cursor: "pointer",
                        }}
                        onClick={() => handleSlotClick(startTime)}
                      >
                        <span className="fw-semibold">
                          {startTime} – {addMinutes(startTime, duration)}
                        </span>
                        <Badge bg="success">可預約</Badge>
                      </div>
                    ))
                  ) : (
                    <div
                      className="px-3 py-2 rounded mb-2 d-flex justify-content-between align-items-center"
                      style={{
                        background: seg.status === "booked" ? "#f5f5f5" : "#fafafa",
                        border: `1px solid ${seg.status === "booked" ? "#e0e0e0" : "#eeeeee"}`,
                        color: seg.status === "booked" ? "#999" : "#bbb",
                        cursor: "default",
                      }}
                    >
                      <span className="fw-semibold">
                        {seg.startTime} – {seg.endTime}
                      </span>
                      <Badge bg="secondary">
                        {seg.status === "booked" ? "已預約" : "緩衝時間"}
                      </Badge>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" onClick={closeSlotModal}>
          關閉
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default SlotModal;
