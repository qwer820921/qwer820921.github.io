"use client";
import React from "react";
import { useRouter } from "next/navigation";
// 模擬用戶授權狀態
const isAuthenticated = false; // 假設用戶未登入，這可以根據實際情況來設置

const ProtectedPage: React.FC = () => {
  const router = useRouter();

  return (
    <div
      className="d-flex justify-content-center align-items-center"
      style={{ height: "400px" }}
    >
      <div className="text-center">
        <h1>受保護頁面</h1>
        <p>這是需要授權才能訪問的頁面。</p>
        {!isAuthenticated && (
          <button className="btn btn-primary" onClick={() => router.push("/")}>
            回首頁
          </button>
        )}
      </div>
    </div>
  );
};

export default ProtectedPage;
