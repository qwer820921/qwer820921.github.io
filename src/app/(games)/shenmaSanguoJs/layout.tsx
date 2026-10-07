import React from "react";
import styles from "./styles/shenmaSanguoJs.module.css";

export default function ShenmaSanguoJsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={styles.gameBody}>{children}</div>;
}
