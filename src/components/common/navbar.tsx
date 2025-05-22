"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import routes from "@/config/routes";

const Navbar: React.FC = () => {
  const pathname = usePathname(); // 取得當前路徑
  const { isAuthenticated, logout } = useAuth();

  useEffect(() => {
    const navbarCollapse = document.querySelector(".navbar-collapse");
    if (navbarCollapse?.classList.contains("show")) {
      navbarCollapse.classList.remove("show");
    }
  }, [pathname]);

  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-light shadow-sm fixed-top">
      <div className="container">
        <Link className="navbar-brand text-dark" href="/">
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
            {routes
              .filter((route) => route.showInNavbar && route.path !== "/logIn")
              .map((route) => {
                // 如果是受保護的頁面且未登入，導向登入頁面
                const targetPath =
                  route.protected && !isAuthenticated ? "/logIn" : route.path;
                const isActive = pathname === route.path;

                // 如果是受保護的頁面且未登入，不顯示在導航欄
                if (route.protected && !isAuthenticated) {
                  return null;
                }

                return (
                  <li
                    key={route.path}
                    className={`nav-item ${isActive ? "active" : ""}`}
                  >
                    <Link className="nav-link text-dark" href={targetPath}>
                      {route.name}
                    </Link>
                  </li>
                );
              })}
            {isAuthenticated ? (
              <li className="nav-item">
                <button
                  className="nav-link text-dark"
                  onClick={() => logout()}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  登出
                </button>
              </li>
            ) : (
              <li className="nav-item">
                <Link className="nav-link text-dark" href="/logIn">
                  登入
                </Link>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
