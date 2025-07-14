"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import routeGroups from "@/config/routes"; // RouteGroup[]
import type { RouteConfig, RouteGroup } from "@/types/routeConfig";

const Navbar: React.FC = () => {
  const pathname = usePathname();
  const { isAuthenticated, logout } = useAuth();

  // 切換路徑後自動收合手機版導覽
  useEffect(() => {
    const navbarCollapse = document.querySelector(".navbar-collapse");
    if (navbarCollapse?.classList.contains("show")) {
      navbarCollapse.classList.remove("show");
    }
  }, [pathname]);

  /** 篩掉「不顯示」或「僅限登入但尚未登入」的項目，並回傳修改後的 RouteGroup[] */
  const filteredGroups: RouteGroup[] = routeGroups
    .map((group) => ({
      ...group,
      routeConfig: group.routeConfig.filter((r) => {
        if (!r.showInNavbar || r.path === "/logIn") return false;
        // if (r.protected && !isAuthenticated) return false;
        return true;
      }),
    }))
    .filter((g) => g.routeConfig.length > 0); // 全空的不顯示

  return (
    <nav className="navbar navbar-expand-lg navbar-pastel-blue shadow-sm fixed-top">
      <div className="container">
        {/* ---- Brand ---- */}
        <Link className="navbar-brand text-dark" href="/">
          子yee 萬事屋
        </Link>

        {/* ---- Mobile toggler ---- */}
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
          aria-controls="navbarNav"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon" />
        </button>

        {/* ---- Links / Dropdowns ---- */}
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav ms-auto">
            {filteredGroups.map((group) => {
              const { type, routeConfig } = group;

              // 只有一條 → 直接顯示普通連結
              if (routeConfig.length === 1) {
                const r = routeConfig[0];
                const isActive = pathname === r.path;
                return (
                  <li
                    key={r.path}
                    className={`nav-item ${isActive ? "active" : ""}`}
                  >
                    <Link className="nav-link text-dark" href={r.path}>
                      {r.name}
                    </Link>
                  </li>
                );
              }

              // 多條 → 顯示分類下拉
              return (
                <li key={type} className="nav-item dropdown">
                  <a
                    role="button"
                    className="nav-link dropdown-toggle text-dark"
                    data-bs-toggle="dropdown"
                    aria-expanded="false"
                  >
                    {type}
                  </a>
                  <ul className="dropdown-menu">
                    {routeConfig.map((r: RouteConfig) => (
                      <li key={r.path}>
                        <Link
                          className={`dropdown-item ${
                            pathname === r.path ? "active" : ""
                          }`}
                          href={r.path}
                        >
                          {r.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}

            {/* ---- 登入 / 登出 ---- */}
            {isAuthenticated ? (
              <li className="nav-item">
                <button
                  className="nav-link text-dark"
                  onClick={logout}
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
