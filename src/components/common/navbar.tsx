"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import routes from "@/config/routes";

const Navbar: React.FC = () => {
  const pathname = usePathname(); // 取得當前路徑

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
              .filter((route) => route.showInNavbar)
              .map((route) => (
                <li
                  key={route.path}
                  className={`nav-item ${
                    pathname === route.path ? "active" : ""
                  }`}
                >
                  <Link className="nav-link text-dark" href={route.path}>
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
