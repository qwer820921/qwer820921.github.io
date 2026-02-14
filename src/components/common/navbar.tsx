"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import routeGroups from "@/config/routes";
import type { RouteConfig, RouteGroup } from "@/types/routeConfig";
import RouteProgressBar from "@/components/common/routeProgressBar";

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

  const [navHeight, setNavHeight] = useState(0);

  useEffect(() => {
    const navbar = document.querySelector(".navbar.fixed-top");
    if (!navbar) return;

    const updateHeight = () => {
      const height = navbar.getBoundingClientRect().height;
      setNavHeight(height);
      // 設置 CSS 變量到 root，供其他組件使用
      document.documentElement.style.setProperty(
        "--navbar-height",
        `${height}px`
      );
    };

    // 使用 ResizeObserver 監聽元素本身的大小變化（包含圖片載入撐開的情況）
    const observer = new ResizeObserver(() => {
      updateHeight();
    });

    observer.observe(navbar);

    // 初始化執行一次
    updateHeight();

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <nav
        className="navbar navbar-expand-lg navbar-pastel-blue fixed-top py-0"
        style={{
          margin: "6px 8px 0 8px", // 上、右、下、左留白
          borderRadius: "16px", // 圓角效果
          width: "calc(100% - 16px)", // 扣除左右 margin
          backgroundColor: "#fff", // 實色白色背景
          border: "1px solid rgba(0, 0, 0, 0.08)", // 淺色邊框
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)", // 增強陰影
        }}
      >
        <div className="container" style={{ padding: "0 16px" }}>
          {/* ---- Brand ---- */}
          <Link className="navbar-brand" href="/">
            <Image
              src="/images/transparent_yee_man_shi_wu-removebg-preview.png"
              alt="子yee 萬事屋"
              width={100}
              height={40}
              priority
              style={{
                width: "auto",
                height: "40px",
                objectFit: "contain",
              }}
            />
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

      {/* 進度條容器*/}
      <div
        className="fixed-top"
        style={{
          top: navHeight + 6, // 動態貼在 navbar 底部 (高度 + top margin)
          height: "4px",
          zIndex: 1050,
          width: "calc(100% - 32px)", // 配合 navbar 寬度視覺
          left: "16px",
          borderRadius: "0 0 4px 4px", // 下方圓角
          overflow: "hidden",
        }}
      >
        <RouteProgressBar />
      </div>
    </>
  );
};

export default Navbar;
