import React from "react";

const Footer: React.FC = () => {
  return (
    <footer className="bg-dark text-white py-4">
      <div className="container text-center">
        <p className="mb-3">
          <strong>子yee 萬事屋</strong> — 什麼委託都接，什麼技術都練
        </p>
        <p className="mb-3" style={{ opacity: 0.75, fontSize: "0.9rem" }}>
          台股分析 · 技術筆記 · 小工具鍛造 · 遊戲開發
        </p>
        <p style={{ opacity: 0.6, fontSize: "0.85rem" }}>
          &copy; 2024 – {new Date().getFullYear()} 子yee 萬事屋 |{" "}
          <a href="/protected" className="text-white text-decoration-underline">
            隱私政策
          </a>
        </p>
      </div>
    </footer>
  );
};

export default Footer;
