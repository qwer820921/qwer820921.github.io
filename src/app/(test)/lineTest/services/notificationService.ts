import { gasCall } from "./gasClient";
import type { NotifyPayload } from "../types";

function flattenPayload(p: NotifyPayload) {
  return { lineUserId: p.lineUserId, memberEmail: p.email, booking: p.booking };
}

export const notificationService = {
  notifyBookingConfirmed: (p: NotifyPayload) =>
    gasCall("sendNotification", { type: "confirmed", ...flattenPayload(p) }),

  notifyReminder: (p: NotifyPayload) =>
    gasCall("sendNotification", { type: "reminder", ...flattenPayload(p) }),

  notifyBookingCancelled: (p: NotifyPayload) =>
    gasCall("sendNotification", { type: "cancelled", ...flattenPayload(p) }),

  notifyBookingRescheduled: (
    p: NotifyPayload,
    newDate: string,
    newTime: string
  ) =>
    gasCall("sendNotification", {
      type: "rescheduled",
      ...flattenPayload(p),
      extra: { newDate, newTime },
    }),
};
