export type LineTestStep =
  | "landing"
  | "validating"
  | "token_error"
  | "binding"
  | "friend_check"
  | "friend_invite"
  | "dashboard"
  | "booking"
  | "booking_success"
  | "reset_password";

export type TokenValidationResult =
  | { valid: true; lineUserId: string }
  | { valid: false; reason: "missing" | "expired" | "invalid" };

export interface Member {
  id: string;
  email: string;
  lineUserId?: string;
  name: string;
  isFriend: boolean;
  createdAt: string;
}

export interface AuthSession {
  memberId: string;
  email: string;
  name?: string;
  lineUserId: string;
  expiresAt: number;
}

export interface BookingForm {
  date: string;
  time: string;
  service: string;
  note: string;
}

export interface Booking extends BookingForm {
  id: string;
  memberId: string;
  status: "confirmed" | "cancelled" | "rescheduled";
  createdAt: string;
  // from new booking engine schema (optional, returned by updated getBookings GAS)
  beauticianId?: string;
  beauticianName?: string;
  serviceId?: string;
  serviceDuration?: number;
  serviceBuffer?: number;
  servicePrice?: number;
  storeId?: string;
  storeName?: string;
}

export interface NotifyPayload {
  memberId: string;
  lineUserId: string;
  email: string;
  booking: Booking;
}
