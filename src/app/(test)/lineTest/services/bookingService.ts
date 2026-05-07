import { gasCall } from "./gasClient";
import type { Service, Store, Beautician, ScheduleDay } from "../types/bookingEngine";

export async function fetchServices(): Promise<Service[]> {
  const res = await gasCall<{ success: boolean; services: Service[] }>("getServices");
  return res.success ? res.services : [];
}

export async function fetchStores(): Promise<Store[]> {
  const res = await gasCall<{ success: boolean; stores: Store[] }>("getStores");
  return res.success ? res.stores : [];
}

export async function fetchBeauticians(
  storeId: string,
  serviceId: string
): Promise<Beautician[]> {
  const res = await gasCall<{ success: boolean; beauticians: Beautician[] }>(
    "getBeauticians",
    { storeId, serviceId }
  );
  return res.success ? res.beauticians : [];
}

export async function fetchSchedule(beauticianId: string): Promise<ScheduleDay[]> {
  const res = await gasCall<{ success: boolean; schedule: ScheduleDay[] }>(
    "getSchedule",
    { beauticianId }
  );
  return res.success ? res.schedule : [];
}

export async function submitBooking(params: {
  lineUserId: string;
  email: string;
  serviceName: string;
  beauticianId: string;
  serviceId: string;
  storeId: string;
  date: string;
  startTime: string;
  note: string;
}): Promise<{ success: boolean; bookingId?: string; error?: string }> {
  return gasCall("createBooking", params);
}

export async function rescheduleBooking(params: {
  bookingId: string;
  newDate: string;
  newTime: string;
}): Promise<{ success: boolean; error?: string }> {
  return gasCall("rescheduleBooking", params);
}

export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
