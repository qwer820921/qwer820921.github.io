"use client";
import React, { useEffect } from "react";
import { Container } from "react-bootstrap";
import { useBookingEngineStore } from "../store/useBookingEngineStore";
import { useLineTestStore } from "../store/useLineTestStore";
import { fetchServices } from "../services/bookingService";
import BookingStepIndicator from "./BookingStepIndicator";
import SelectServicePage from "./SelectServicePage";
import SelectStorePage from "./SelectStorePage";
import SelectBeauticianPage from "./SelectBeauticianPage";
import CalendarPage from "./CalendarPage";
import BookingEngineSuccessPage from "./BookingEngineSuccessPage";

const BOOKING_STEPS = ["selectService", "selectStore", "selectBeautician", "calendar"];

const BookingEnginePage: React.FC = () => {
  const { step, setServices, setLoading, selectedService, selectedStore, selectedBeautician, rescheduleBookingId, reset } = useBookingEngineStore();
  const { setStep: setLineStep } = useLineTestStore();
  const isReschedule = !!rescheduleBookingId;

  useEffect(() => {
    setLoading(true);
    fetchServices()
      .then(setServices)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showNav  = BOOKING_STEPS.includes(step);
  const stepIdx  = BOOKING_STEPS.indexOf(step);

  const summaryItems: { label: string; value: string }[] = [
    ...(stepIdx >= 1 && selectedService
      ? [{ label: "療程", value: `${selectedService.name} (${selectedService.duration} min)` }]
      : []),
    ...(stepIdx >= 2 && selectedStore
      ? [{ label: "據點", value: selectedStore.name }]
      : []),
    ...(stepIdx >= 3 && selectedBeautician
      ? [{ label: "美容師", value: selectedBeautician.name }]
      : []),
  ];

  return (
    <div>
      {showNav && (
        <Container style={{ maxWidth: 560 }}>
          <button
            onClick={() => {
              if (isReschedule) reset();
              setLineStep("dashboard");
            }}
            style={{
              background: "none",
              border: "none",
              padding: "12px 0 4px",
              fontSize: 13,
              color: "#6c757d",
              cursor: "pointer",
            }}
          >
            ← {isReschedule ? "返回我的預約" : "返回首頁"}
          </button>
        </Container>
      )}

      {showNav && !isReschedule && <BookingStepIndicator />}

      {showNav && isReschedule && (
        <Container style={{ maxWidth: 560 }}>
          <div className="mb-1 px-3 py-2 rounded small fw-semibold text-success" style={{ background: "#f0faf0" }}>
            重新選擇時段
          </div>
        </Container>
      )}

      {showNav && summaryItems.length > 0 && (
        <Container style={{ maxWidth: 560 }}>
          <div
            className="mb-1 px-3 py-2 rounded small text-muted"
            style={{ background: "#f8f9fa", display: "flex", flexWrap: "wrap", gap: "0 12px" }}
          >
            {summaryItems.map((item, i) => (
              <span key={item.label}>
                {i > 0 && <span className="me-2 text-muted">｜</span>}
                {item.label}：<strong className="text-dark">{item.value}</strong>
              </span>
            ))}
          </div>
        </Container>
      )}

      {step === "selectService"    && <SelectServicePage />}
      {step === "selectStore"      && <SelectStorePage />}
      {step === "selectBeautician" && <SelectBeauticianPage />}
      {step === "calendar"         && <CalendarPage />}
      {step === "success"          && <BookingEngineSuccessPage />}
    </div>
  );
};

export default BookingEnginePage;
