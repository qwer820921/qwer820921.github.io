import React from "react";

const Footer: React.FC = () => {
  return (
    <footer className="bg-dark text-white py-4 mt-5">
      <div className="container text-center">
        <p>
          子yee 萬事屋是一個提供
          <strong>台股即時查詢、自選股功能、技術小工具</strong>與{" "}
          <strong>自動化服務</strong> 的平台。
        </p>
        <p>&copy; 2025 子yee 萬事屋 - 保留所有權利</p>
        <p>
          聯繫我們（暫無開放） |{" "}
          <a href="/privacy" className="text-white">
            隱私政策
          </a>
        </p>
      </div>
    </footer>
  );
};

export default Footer;
