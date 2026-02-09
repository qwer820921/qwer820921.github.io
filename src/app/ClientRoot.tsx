"use client";

import dynamic from "next/dynamic";
import { ToastProvider, ToastContainer } from "@/components/common/Toast";

// 使用 dynamic import 來動態加載 ClientLayout 組件
const ClientLayout = dynamic(() => import("./ClientLayout"));

export default function ClientRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <ClientLayout>{children}</ClientLayout>
      <ToastContainer />
    </ToastProvider>
  );
}
