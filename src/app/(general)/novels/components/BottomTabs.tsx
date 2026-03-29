"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../novels.module.css";

const TABS = [
  { label: "全部", path: "/novels", icon: "📚", exact: true },
  { label: "書櫃", path: "/novels/collection", icon: "⭐", exact: false },
  { label: "設定", path: "/novels/settings", icon: "⚙️", exact: false },
] as const;

export default function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav className={styles.bottomTabs}>
      {TABS.map((tab) => {
        // "全部" 頁只在完全匹配時高亮，其他頁用 startsWith 匹配子路由
        const isActive = tab.exact
          ? pathname === tab.path
          : pathname.startsWith(tab.path);

        return (
          <Link
            key={tab.path}
            href={tab.path}
            className={`${styles.tabItem} ${isActive ? styles.tabActive : ""}`}
          >
            <span className={styles.tabIcon}>{tab.icon}</span>
            <span className={styles.tabLabel}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
