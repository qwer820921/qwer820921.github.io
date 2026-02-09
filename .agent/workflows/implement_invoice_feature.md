---
description: Implement Unified Invoice Lottery Feature
---

## 1. Route Configuration

- [x] Add `INVOICE: "/invoice"` to `src/constants/routes.ts`
- [x] Add the `INVOICE` route to the "工具" category in `src/config/routes.ts`.

## 2. Create Lottery Data Structure

- [x] Create `src/app/invoice/constants/lotteryData.ts`:
  - Define `LotteryData` interface (period, specialized prizes, grand prizes, etc.).
  - Create mock data for the latest lottery numbers.

## 3. Create Invoice API

- [x] Create `src/app/invoice/api/invoiceApi.ts`:
  - Integrate with government e-invoice API (財政部電子發票整合服務平台)
  - Fallback to mock data when API is unavailable

## 4. Create Main Page Structure

- [x] Create `src/app/invoice/page.tsx`:
  - Use `react-bootstrap/Tabs` to manage the 3 views: "本期號碼" (Current Numbers), "快速對獎" (Quick Check), "掃描對獎" (Scan).
  - Use `Tab 1` as default.
  - Implement a modern, premium layout container.

## 5. Implement Tab 1: Lottery Display (Invitation Style)

- [x] Create `src/app/invoice/components/InvoicePage.tsx` (includes LotteryDisplay):
  - Display the lottery numbers in a "Postal Invitation" or "High-End Card" style.
  - Use Glassmorphism effects (backdrop-filter, semi-transparent backgrounds).
  - Allow switching between different lottery periods (Store purely in state for now).

## 6. Implement Tab 2: Custom Keypad (Quick Check)

- [x] Implement KeypadInput component in `InvoicePage.tsx`:
  - Implement a large, custom numeric keypad (0-9, Clear).
  - Logic:
    - Input last 3 digits.
    - Auto-check against winning numbers without pressing Enter.
    - Provide immediate visual feedback (Gold/Red flash).

## 7. Implement Tab 3: QR Scanner (Placeholder)

- [x] Implement QrScanner component in `InvoicePage.tsx`:
  - Create a placeholder UI with a "Coming Soon" message.

## 8. Styling

- [x] Create `src/app/invoice/invoice.module.css`:
  - Define styles for Glassmorphism.
  - Define animations for the keypad feedback.
