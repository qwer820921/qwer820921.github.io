"use client";
import React from "react";
import { Container } from "react-bootstrap";
import { useBookingEngineStore } from "../store/useBookingEngineStore";
import type { BookingEngineStep } from "../types/bookingEngine";

const STEPS: { key: BookingEngineStep; label: string }[] = [
  { key: "selectService",    label: "療程" },
  { key: "selectStore",      label: "據點" },
  { key: "selectBeautician", label: "美容師" },
  { key: "calendar",         label: "時段" },
];

const BookingStepIndicator: React.FC = () => {
  const { step, navigateToStep } = useBookingEngineStore();
  const currentIdx = STEPS.findIndex((s) => s.key === step);

  return (
    <Container style={{ maxWidth: 560 }}>
      <div style={{ display: "flex", alignItems: "flex-start", padding: "8px 0 16px" }}>
        {STEPS.map((s, idx) => {
          const isCompleted = idx < currentIdx;
          const isActive    = idx === currentIdx;
          const isClickable = isCompleted;

          const circleColor =
            isActive    ? "#28a745" :
            isCompleted ? "#8ecfa0" :
            "transparent";

          const circleBorder =
            isActive || isCompleted ? "none" : "2px solid #ced4da";

          const labelColor =
            isActive    ? "#28a745" :
            isCompleted ? "#5a9e6d" :
            "#adb5bd";

          return (
            <React.Fragment key={s.key}>
              {/* Step node */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: 56,
                  cursor: isClickable ? "pointer" : "default",
                  flexShrink: 0,
                }}
                onClick={() => isClickable && navigateToStep(s.key)}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: circleColor,
                    border: circleBorder,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    color: isActive || isCompleted ? "#fff" : "#ced4da",
                    boxShadow: isActive ? "0 0 0 4px rgba(40,167,69,0.18)" : "none",
                    transition: "all 0.2s",
                  }}
                >
                  {idx + 1}
                </div>
                <span
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    fontWeight: isActive ? 700 : 400,
                    color: labelColor,
                    whiteSpace: "nowrap",
                    textDecoration: isClickable ? "underline" : "none",
                    transition: "color 0.2s",
                  }}
                >
                  {s.label}
                </span>
              </div>

              {/* Connector */}
              {idx < STEPS.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    marginTop: 15,
                    background: isCompleted ? "#8ecfa0" : "#e9ecef",
                    transition: "background 0.2s",
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </Container>
  );
};

export default BookingStepIndicator;
