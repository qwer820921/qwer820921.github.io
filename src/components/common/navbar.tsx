import React from "react";
import { Link, useLocation } from "react-router-dom"; // 使用 useLocation 來獲取當前路由
import { ROUTES } from "../../constants/routes"; // 引入路由常數
import routes from "../../config/routes";

const Navbar: React.FC = () => {
  const location = useLocation(); // 用來檢查當前路由位置

  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-light shadow-sm fixed-top">
      <div className="container">
        <Link className="navbar-brand text-dark" to={ROUTES.HOME}>
          子yee 萬事屋
        </Link>
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
          aria-controls="navbarNav"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav ms-auto">
            {/* 根據 routes 配置動態生成導航項目 */}
            {routes
              .filter((route) => route.showInNavbar) // 只顯示需要顯示在導航列的路由
              .map((route) => (
                <li
                  className={`nav-item ${location.pathname === route.path ? "active" : ""}`} // 根據當前路徑設置 active 樣式
                  key={route.path}
                >
                  <Link className="nav-link text-dark" to={route.path}>
                    {route.name}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
