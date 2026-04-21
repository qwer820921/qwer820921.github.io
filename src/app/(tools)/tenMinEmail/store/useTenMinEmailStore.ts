import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CreateResponse, CheckResponse, EmailMessage } from "../types";

interface TenMinEmailState {
  currentEmail: string | null;
  expiresAt: number | null; // Unix Timestamp
  inbox: EmailMessage[];
  isLoading: boolean;
  isMessageLoading: boolean;
  error: string | null;

  createMail: () => Promise<void>;
  fetchInbox: () => Promise<void>;
  extendMail: () => Promise<void>;
  fetchMessageDetail: (id: string) => Promise<void>;
  clearMail: () => void;
}

const API_BASE_URL = "https://zyee-core-api.qwer820921.workers.dev";

export const useTenMinEmailStore = create<TenMinEmailState>()(
  persist(
    (set, get) => ({
      currentEmail: null,
      expiresAt: null,
      inbox: [],
      isLoading: false,
      isMessageLoading: false,
      error: null,

      createMail: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_BASE_URL}/api/mail/create`);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              `Create mail failed with status ${response.status}:`,
              errorText
            );
            set({
              error: `伺服器回傳錯誤 (${response.status})`,
              isLoading: false,
            });
            return;
          }

          const data: CreateResponse = await response.json();

          if (data.success) {
            set({
              currentEmail: data.email,
              expiresAt: Date.now() + data.expires_in * 1000,
              inbox: [],
              isLoading: false,
            });
          } else {
            set({ error: data.message || "無法建立信箱", isLoading: false });
          }
        } catch (err) {
          set({ error: "網路連線錯誤", isLoading: false });
          console.error("Create mail failed:", err);
        }
      },

      fetchInbox: async () => {
        const { currentEmail, expiresAt } = get();
        if (!currentEmail) return;

        // Check if expired
        if (expiresAt && Date.now() > expiresAt) {
          set({ error: "信箱已過期", inbox: [] });
          return;
        }

        try {
          const encodedEmail = encodeURIComponent(currentEmail);
          console.log(`Checking inbox for: ${currentEmail}`);
          const response = await fetch(
            `${API_BASE_URL}/api/mail/check?email=${encodedEmail}`
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              `Fetch inbox failed with status ${response.status}:`,
              errorText
            );
            // Don't set state error for background fetch unless critical
            return;
          }

          const data: CheckResponse = await response.json();
          console.log("Inbox response:", data);

          if (data.success) {
            const currentInbox = get().inbox;
            // 透過 ID 對照，保留已經抓取過的詳情欄位 (html, text)
            const mergedInbox = data.inbox.map((newMail: EmailMessage) => {
              const existing = currentInbox.find((m) => m.id === newMail.id);
              return existing ? { ...newMail, ...existing } : newMail;
            });
            set({ inbox: mergedInbox, error: null });
          } else {
            set({ error: data.message || "信箱已失效", inbox: [] });
          }
        } catch (err) {
          console.error("Fetch inbox failed:", err);
        }
      },

      extendMail: async () => {
        const { currentEmail } = get();
        if (!currentEmail) return;

        try {
          const encodedEmail = encodeURIComponent(currentEmail);
          const response = await fetch(
            `${API_BASE_URL}/api/mail/extend?email=${encodedEmail}`
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              `Extend mail failed with status ${response.status}:`,
              errorText
            );
            set({ error: `延長失敗 (${response.status})` });
            return;
          }

          const data = await response.json();

          if (data.success) {
            set({
              expiresAt: Date.now() + 600 * 1000,
              error: null,
            });
          } else {
            set({ error: data.message || "延長失敗" });
          }
        } catch (err) {
          console.error("Extend mail failed:", err);
        }
      },

      fetchMessageDetail: async (id: string) => {
        const { currentEmail, inbox } = get();
        if (!currentEmail) return;

        // Find the message in inbox
        const existingMail = inbox.find((m) => m.id === id);
        // If already has html or text content, don't fetch again
        if (existingMail && (existingMail.html || existingMail.text)) return;

        set({ isMessageLoading: true });
        try {
          const encodedEmail = encodeURIComponent(currentEmail);
          const response = await fetch(
            `${API_BASE_URL}/api/mail/message-detail?email=${encodedEmail}&id=${id}`
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              `Fetch detail failed with status ${response.status}:`,
              errorText
            );
            set({ isMessageLoading: false });
            return;
          }

          const data = await response.json();

          if (data.success && data.message) {
            // Update the specific message in the inbox array
            const updatedInbox = inbox.map((m) =>
              m.id === id ? { ...m, ...data.message } : m
            );
            set({ inbox: updatedInbox, isMessageLoading: false });
          } else {
            set({ isMessageLoading: false });
          }
        } catch (err) {
          console.error("Fetch message detail failed:", err);
          set({ isMessageLoading: false });
        }
      },

      clearMail: () => {
        set({
          currentEmail: null,
          expiresAt: null,
          inbox: [],
          isMessageLoading: false,
          error: null,
        });
      },
    }),
    {
      name: "ten-min-email-store", // LocalStorage Key
    }
  )
);
