import { create } from "zustand";
import type {
  BookingEngineState,
  BookingEngineStep,
} from "../types/bookingEngine";

const initialState = {
  step: "selectService" as BookingEngineStep,
  selectedService: null,
  selectedStore: null,
  selectedBeautician: null,
  selectedDate: null,
  selectedSegment: null,
  note: "",
  services: [],
  stores: [],
  beauticians: [],
  schedule: [],
  showSlotModal: false,
  showConfirmModal: false,
  loading: false,
  error: null,
  rescheduleBookingId: null,
  lastCreatedBookingId: null,
};

export const useBookingEngineStore = create<BookingEngineState>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  navigateToStep: (targetStep) => {
    const order: BookingEngineStep[] = ["selectService", "selectStore", "selectBeautician", "calendar"];
    const targetIdx = order.indexOf(targetStep);
    const toClear: Partial<BookingEngineState> = {
      step: targetStep,
      selectedDate: null,
      selectedSegment: null,
      schedule: [],
    };
    if (targetIdx <= 2) { toClear.selectedBeautician = null; toClear.beauticians = []; }
    if (targetIdx <= 1) { toClear.selectedStore = null; toClear.stores = []; }
    if (targetIdx <= 0) { toClear.selectedService = null; }
    set(toClear);
  },
  selectService: (selectedService) => set({ selectedService, step: "selectStore" }),
  selectStore: (selectedStore) => set({ selectedStore, step: "selectBeautician" }),
  selectBeautician: (selectedBeautician) => set({ selectedBeautician, step: "calendar" }),
  selectDate: (selectedDate) => set({ selectedDate }),
  selectSegment: (selectedSegment) => set({ selectedSegment }),
  setServices: (services) => set({ services }),
  setStores: (stores) => set({ stores }),
  setBeauticians: (beauticians) => set({ beauticians }),
  setSchedule: (schedule) => set({ schedule }),
  openSlotModal: () => set({ showSlotModal: true, selectedSegment: null }),
  closeSlotModal: () => set({ showSlotModal: false }),
  openConfirmModal: () => set({ showConfirmModal: true }),
  closeConfirmModal: () => set({ showConfirmModal: false }),
  setNote: (note) => set({ note }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  rescheduleBookingId: null,
  setRescheduleBookingId: (rescheduleBookingId) => set({ rescheduleBookingId }),
  lastCreatedBookingId: null,
  setLastCreatedBookingId: (lastCreatedBookingId) => set({ lastCreatedBookingId }),
  startReschedule: (bookingId, beautician, service, store) =>
    set({
      rescheduleBookingId: bookingId,
      selectedBeautician: beautician,
      selectedService: service,
      selectedStore: store,
      step: "calendar",
      schedule: [],
      loading: true,
      selectedDate: null,
      selectedSegment: null,
      showSlotModal: false,
      showConfirmModal: false,
      error: null,
    }),
  reset: () => set(initialState),
}));
