"use client";
import React, { useEffect } from "react";
import { Container, Spinner } from "react-bootstrap";
import { useBookingEngineStore } from "../store/useBookingEngineStore";
import { fetchSchedule } from "../services/bookingService";
import SlotModal from "./SlotModal";
import ConfirmModal from "./ConfirmModal";
import type { ScheduleDay } from "../types/bookingEngine";

const DAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

const d = new Date();
const TODAY = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function chunkWeeks(schedule: ScheduleDay[]): (ScheduleDay | null)[][] {
  const weeks: (ScheduleDay | null)[][] = [];
  let week: (ScheduleDay | null)[] = [];
  for (const day of schedule) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

type DayState = "past" | "off" | "available" | "full";

function getDayState(day: ScheduleDay): DayState {
  if (day.isPast) return "past";
  if (day.segments.length === 0) return "off";
  if (day.segments.some((s) => s.status === "available")) return "available";
  return "full";
}

const CalendarPage: React.FC = () => {
  const {
    schedule, loading, setSchedule, setLoading,
    selectedBeautician,
    selectDate, openSlotModal,
  } = useBookingEngineStore();

  useEffect(() => {
    if (!selectedBeautician) return;
    setLoading(true);
    fetchSchedule(selectedBeautician.beauticianId)
      .then(setSchedule)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weeks = chunkWeeks(schedule);

  const handleDayClick = (day: ScheduleDay) => {
    const state = getDayState(day);
    if (state === "past" || state === "off") return;
    selectDate(day.date);
    openSlotModal();
  };

  return (
    <Container className="py-4" style={{ maxWidth: 560 }}>
      {loading ? (
        <div className="text-center py-5">
          <Spinner variant="success" />
        </div>
      ) : (
        <>
          {/* 星期標題 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              marginBottom: 4,
            }}
          >
            {DAY_LABELS.map((label) => (
              <div key={label} className="text-center text-muted small py-1">
                {label}
              </div>
            ))}
          </div>

          {/* 日期格子 */}
          {weeks.map((week, wi) => (
            <div
              key={wi}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 4,
                marginBottom: 4,
              }}
            >
              {week.map((day, di) => {
                if (!day) return <div key={di} />;

                const state = getDayState(day);
                const isToday = day.date === TODAY;
                const clickable = state === "available" || state === "full";

                const bg =
                  state === "available" ? "#fff" :
                  state === "full"      ? "#fff8e1" :
                  "#f5f5f5";

                const color =
                  state === "available" ? "#212529" :
                  state === "full"      ? "#999" :
                  "#ccc";

                const dotColor =
                  state === "available" ? "#4caf50" :
                  state === "full"      ? "#ff9800" :
                  "transparent";

                return (
                  <div
                    key={di}
                    onClick={() => handleDayClick(day)}
                    onMouseEnter={(e) => {
                      if (clickable)
                        (e.currentTarget as HTMLDivElement).style.background = "#e8f5e9";
                    }}
                    onMouseLeave={(e) => {
                      if (clickable)
                        (e.currentTarget as HTMLDivElement).style.background = bg;
                    }}
                    style={{
                      background: bg,
                      color,
                      cursor: clickable ? "pointer" : "not-allowed",
                      borderRadius: 6,
                      padding: "8px 4px 6px",
                      textAlign: "center",
                      fontSize: 14,
                      border: "1px solid #e0e0e0",
                      transition: "background 0.15s",
                      userSelect: "none",
                    }}
                  >
                    <span style={{ textDecoration: isToday ? "underline" : "none" }}>
                      {Number(day.date.split("-")[2])}
                    </span>
                    <div style={{ fontSize: 6, color: dotColor, marginTop: 2 }}>●</div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* 圖例 */}
          <div className="d-flex gap-3 mt-3 small text-muted">
            <span><span style={{ color: "#4caf50" }}>●</span> 可預約</span>
            <span><span style={{ color: "#ff9800" }}>●</span> 額滿</span>
            <span style={{ color: "#ccc" }}>■ 休息 / 無班</span>
          </div>
        </>
      )}

      <SlotModal />
      <ConfirmModal />
    </Container>
  );
};

export default CalendarPage;
