export interface Service {
  serviceId: string;
  name: string;
  duration: number;
  buffer: number;
  price: number;
  description: string;
}

export interface Store {
  storeId: string;
  name: string;
  address: string;
  phone: string;
}

export interface Beautician {
  beauticianId: string;
  name: string;
  storeId: string;
  skillServiceIds: string;
  bio: string;
}

export interface ScheduleSegment {
  startTime: string;
  endTime: string;
  status: "available" | "booked" | "buffer";
}

export interface ScheduleDay {
  date: string;
  isPast: boolean;
  segments: ScheduleSegment[];
}

export type BookingEngineStep =
  | "selectService"
  | "selectStore"
  | "selectBeautician"
  | "calendar"
  | "success";

export interface BookingEngineState {
  step: BookingEngineStep;

  selectedService: Service | null;
  selectedStore: Store | null;
  selectedBeautician: Beautician | null;
  selectedDate: string | null;
  selectedSegment: ScheduleSegment | null;
  note: string;

  services: Service[];
  stores: Store[];
  beauticians: Beautician[];
  schedule: ScheduleDay[];

  showSlotModal: boolean;
  showConfirmModal: boolean;
  loading: boolean;
  error: string | null;

  setStep: (step: BookingEngineStep) => void;
  navigateToStep: (step: BookingEngineStep) => void;
  selectService: (service: Service) => void;
  selectStore: (store: Store) => void;
  selectBeautician: (b: Beautician) => void;
  selectDate: (date: string) => void;
  selectSegment: (segment: ScheduleSegment) => void;
  setServices: (services: Service[]) => void;
  setStores: (stores: Store[]) => void;
  setBeauticians: (beauticians: Beautician[]) => void;
  setSchedule: (schedule: ScheduleDay[]) => void;
  openSlotModal: () => void;
  closeSlotModal: () => void;
  openConfirmModal: () => void;
  closeConfirmModal: () => void;
  rescheduleBookingId: string | null;
  setRescheduleBookingId: (id: string | null) => void;
  startReschedule: (
    bookingId: string,
    beautician: Beautician,
    service: Service,
    store: Store
  ) => void;

  setNote: (note: string) => void;
  setLoading: (v: boolean) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
}
