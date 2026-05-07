"use client";
import React, { useEffect, useState } from "react";
import {
  Container,
  Button,
  Badge,
  Spinner,
  ListGroup,
  Modal,
  Alert,
} from "react-bootstrap";
import { useLineTestStore } from "../store/useLineTestStore";
import { useBookingEngineStore } from "../store/useBookingEngineStore";
import { gasCall } from "../services/gasClient";
import { notificationService } from "../services/notificationService";
import type { Booking } from "../types";
import type { Beautician, Service, Store } from "../types/bookingEngine";

// Google Sheets 有時會把日期存成 ISO datetime，取前10碼即可
const fmtDate = (v: string) => (v ? String(v).substring(0, 10) : "");

// Google Sheets 的時間欄位會帶 1899-12-30T 前綴，只取 HH:mm
const fmtTime = (v: string) => {
  if (!v) return "";
  const s = String(v);
  if (s.includes("T")) return s.split("T")[1].substring(0, 5);
  return s.substring(0, 5);
};

const today = () => new Date().toISOString().split("T")[0];

const statusLabel: Record<string, string> = {
  confirmed: "已確認",
  cancelled: "已取消",
  rescheduled: "已改期",
};
const statusVariant: Record<string, string> = {
  confirmed: "success",
  cancelled: "danger",
  rescheduled: "secondary",
};

const DashboardPage: React.FC = () => {
  const { session, setStep } = useLineTestStore();
  const { startReschedule } = useBookingEngineStore();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Booking | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [notifySending, setNotifySending] = useState<string | null>(null);

  const fetchBookings = () => {
    if (!session?.lineUserId) return;
    setLoading(true);
    gasCall<{ bookings: Booking[] }>("getBookings", {
      lineUserId: session.lineUserId,
    })
      .then(({ bookings }) => setBookings(bookings ?? []))
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.lineUserId]);

  const openDetail = (b: Booking) => {
    setSelected(b);
    setActionMsg(null);
    setNotifySending(null);
    setShowModal(true);
  };

  const triggerNotify = async (type: string) => {
    if (!selected || !session) return;
    setNotifySending(type);
    const payload = {
      memberId: session.memberId,
      lineUserId: session.lineUserId,
      email: session.email,
      booking: {
        ...selected,
        date: fmtDate(selected.date),
        time: fmtTime(selected.time),
      },
    };
    if (type === "confirmed")
      await notificationService
        .notifyBookingConfirmed(payload)
        .catch(() => null);
    if (type === "reminder")
      await notificationService.notifyReminder(payload).catch(() => null);
    if (type === "cancelled")
      await notificationService
        .notifyBookingCancelled(payload)
        .catch(() => null);
    if (type === "rescheduled")
      await notificationService
        .notifyBookingRescheduled(payload, "2099-12-31", "10:00")
        .catch(() => null);
    setNotifySending(null);
  };

  const handleCancel = async () => {
    if (!selected) return;
    setActionLoading(true);
    await gasCall("cancelBooking", { bookingId: selected.id }).catch(() => null);
    setActionLoading(false);
    setShowModal(false);
    fetchBookings();
  };

  const handleStartReschedule = () => {
    if (!selected) return;
    const beautician: Beautician = {
      beauticianId: selected.beauticianId ?? "",
      name: selected.beauticianName ?? selected.beauticianId ?? "",
      storeId: selected.storeId ?? "",
      skillServiceIds: selected.serviceId ?? "",
      bio: "",
    };
    const service: Service = {
      serviceId: selected.serviceId ?? "",
      name: selected.service ?? "",
      duration: selected.serviceDuration ?? 60,
      buffer: selected.serviceBuffer ?? 0,
      price: selected.servicePrice ?? 0,
      description: "",
    };
    const store: Store = {
      storeId: selected.storeId ?? "",
      name: selected.storeName ?? "",
      address: "",
      phone: "",
    };
    setShowModal(false);
    startReschedule(selected.id, beautician, service, store);
    setStep("booking");
  };

  const upcoming = bookings.filter(
    (b) => b.status === "confirmed" && fmtDate(b.date) >= today()
  );
  const past = bookings.filter(
    (b) => b.status !== "confirmed" || fmtDate(b.date) < today()
  );

  const isUpcoming = (b: Booking) =>
    b.status === "confirmed" && fmtDate(b.date) >= today();

  const BookingItem = ({ b }: { b: Booking }) => (
    <ListGroup.Item
      action
      onClick={() => openDetail(b)}
      className="d-flex justify-content-between align-items-center"
      style={{ cursor: "pointer" }}
    >
      <div>
        <div className="fw-semibold">{b.service}</div>
        <small className="text-muted">
          {fmtDate(b.date)} {fmtTime(b.time)}
        </small>
      </div>
      <Badge bg={statusVariant[b.status] ?? "secondary"}>
        {statusLabel[b.status] ?? b.status}
      </Badge>
    </ListGroup.Item>
  );

  return (
    <Container className="py-4" style={{ maxWidth: 520 }}>
      {/* 標題列 */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h5 className="mb-0 fw-bold">我的預約</h5>
          <small className="text-muted">
            {session?.name || session?.email || "LINE 用戶"}
          </small>
        </div>
        <Button variant="success" onClick={() => setStep("booking")}>
          立即預約
        </Button>
      </div>

      {/* 內容 */}
      {loading ? (
        <div className="text-center py-5">
          <Spinner variant="success" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-5">
          <p className="text-muted mb-3">目前沒有任何預約紀錄</p>
          <Button
            variant="success"
            size="lg"
            className="px-5"
            onClick={() => setStep("booking")}
          >
            立即預約
          </Button>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <>
              <h6 className="text-muted mb-2">即將到來</h6>
              <ListGroup className="mb-4 shadow-sm">
                {upcoming.map((b) => (
                  <BookingItem key={b.id} b={b} />
                ))}
              </ListGroup>
            </>
          )}
          {past.length > 0 && (
            <>
              <h6 className="text-muted mb-2">歷史紀錄</h6>
              <ListGroup className="shadow-sm">
                {past.map((b) => (
                  <BookingItem key={b.id} b={b} />
                ))}
              </ListGroup>
            </>
          )}
        </>
      )}

      {/* 詳情 Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{selected?.service}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {actionMsg && <Alert variant="info">{actionMsg}</Alert>}

          <ListGroup variant="flush" className="mb-3">
            <ListGroup.Item>
              <span className="text-muted me-2">日期</span>
              <strong>{selected && fmtDate(selected.date)}</strong>
            </ListGroup.Item>
            <ListGroup.Item>
              <span className="text-muted me-2">時間</span>
              <strong>{selected && fmtTime(selected.time)}</strong>
            </ListGroup.Item>
            <ListGroup.Item>
              <span className="text-muted me-2">狀態</span>
              <Badge bg={statusVariant[selected?.status ?? ""] ?? "secondary"}>
                {statusLabel[selected?.status ?? ""] ?? selected?.status}
              </Badge>
            </ListGroup.Item>
            {selected?.note && (
              <ListGroup.Item>
                <span className="text-muted me-2">備註</span>
                {selected.note}
              </ListGroup.Item>
            )}
          </ListGroup>

          {/* 通知 Demo 面板 */}
          <hr />
          <p className="text-muted small mb-2">通知 Demo</p>
          <div className="d-grid gap-2">
            {[
              { type: "confirmed", label: "✅ 觸發預約確認" },
              { type: "reminder", label: "🔔 觸發前一天提醒" },
              { type: "cancelled", label: "❌ 觸發取消通知" },
              { type: "rescheduled", label: "📅 觸發改期通知" },
            ].map(({ type, label }) => (
              <Button
                key={type}
                variant="outline-secondary"
                size="sm"
                disabled={notifySending !== null}
                onClick={() => triggerNotify(type)}
              >
                {notifySending === type ? "發送中…" : label}
              </Button>
            ))}
          </div>

        </Modal.Body>

        {selected && isUpcoming(selected) && (
          <Modal.Footer className="d-flex gap-2">
            <Button
              variant="outline-danger"
              disabled={actionLoading}
              onClick={handleCancel}
            >
              取消預約
            </Button>
            <Button
              variant="outline-primary"
              onClick={handleStartReschedule}
            >
              更改時間
            </Button>
          </Modal.Footer>
        )}
      </Modal>
    </Container>
  );
};

export default DashboardPage;
