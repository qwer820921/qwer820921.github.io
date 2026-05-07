import { create } from "zustand";
import { persist } from "zustand/middleware";
import { validateToken } from "../services/tokenGuard";
import { findMemberByLineUserId } from "../services/authService";
import type {
  LineTestStep,
  AuthSession,
  Booking,
  TokenValidationResult,
} from "../types";

interface LineTestState {
  step: LineTestStep;
  setStep: (step: LineTestStep) => void;

  rawToken: string | null;
  setRawToken: (token: string | null) => void;

  tokenError: string | null;
  lineUserId: string | null;

  session: AuthSession | null;
  setSession: (session: AuthSession | null) => void;

  isFriend: boolean;
  setIsFriend: (val: boolean) => void;

  currentBooking: Booking | null;
  setCurrentBooking: (booking: Booking | null) => void;

  initialize: (token: string | null) => Promise<void>;
}

export const useLineTestStore = create<LineTestState>()(
  persist(
    (set) => ({
      step: "landing",
      setStep: (step) => set({ step }),

      rawToken: null,
      setRawToken: (rawToken) => set({ rawToken }),

      tokenError: null,
      lineUserId: null,

      session: null,
      setSession: (session) => set({ session }),

      isFriend: false,
      setIsFriend: (isFriend) => set({ isFriend }),

      currentBooking: null,
      setCurrentBooking: (currentBooking) => set({ currentBooking }),

      initialize: async (token) => {
        set({ step: "validating", tokenError: null });

        const tokenResult = await validateToken(token).catch(
          (): TokenValidationResult => ({ valid: false, reason: "invalid" })
        );

        if (!tokenResult.valid) {
          set({ step: "token_error", tokenError: tokenResult.reason });
          return;
        }

        const lineUserId = tokenResult.lineUserId;
        set({ lineUserId });

        const { member } = await findMemberByLineUserId(lineUserId).catch(
          () => ({ member: null })
        );

        if (member) {
          const session: AuthSession = {
            memberId: member.id,
            email: member.email,
            name: member.name,
            lineUserId,
            expiresAt: Date.now() + 24 * 60 * 60 * 1000,
          };
          set({ session, step: "friend_check" });
        } else {
          set({ step: "binding" });
        }
      },
    }),
    {
      name: "linetest-session",
      partialize: (state) => ({ session: state.session }), // 只持久化 session
    }
  )
);
