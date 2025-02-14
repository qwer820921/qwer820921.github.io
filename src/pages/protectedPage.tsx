import React from "react";
import { Navigate } from "react-router-dom";

// 模擬用戶授權狀態
const isAuthenticated = false; // 假設用戶未登入，這可以根據實際情況來設置

const ProtectedPage: React.FC = () => {
  // 如果未授權，重定向到登入頁面
  // if (!isAuthenticated) {
  //   return <Navigate to="/login" replace />;
  // }

  return (
    <div
      className="d-flex justify-content-center align-items-center"
      style={{ height: "400px" }}
    >
      <div className="text-center">
        <h1>受保護頁面</h1>
        <p>這是需要授權才能訪問的頁面。</p>
      </div>
    </div>
  );
};

export default ProtectedPage;
