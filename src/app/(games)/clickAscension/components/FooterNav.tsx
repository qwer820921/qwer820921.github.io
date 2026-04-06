import React from "react";
import styles from "../styles/clickAscension.module.css";

export type ModalType =
  | "PROFILE"
  | "UPGRADES"
  | "SHOP"
  | "INVENTORY"
  | "ASCENSION_CONFIRM"
  | "LEVEL_RESET_CONFIRM"
  | null;

export type ViewType = "BATTLE" | "CHARACTER" | "CRAFT";

interface FooterNavProps {
  activeView: ViewType;
  onSwitchView: (view: ViewType) => void;
  onOpenModal: (modal: ModalType) => void;
}

export default function FooterNav({
  activeView,
  onSwitchView,
  onOpenModal,
}: FooterNavProps) {
  return (
    <footer className={styles["ca-footer"]}>
      <nav className={styles["ca-footer-nav"]}>
        <button
          className={[
            styles["ca-tab-btn"],
            activeView === "CHARACTER" ? styles.active : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => {
            onSwitchView("CHARACTER");
            onOpenModal(null); // Close any open modals
          }}
        >
          <span className={styles.icon}>👤</span>
          <span className={styles.label}>角色</span>
        </button>

        <button
          className={[
            styles["ca-tab-btn"],
            activeView === "BATTLE" ? styles.active : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => {
            onSwitchView("BATTLE");
            onOpenModal(null); // Close any open modals
          }}
        >
          <span className={styles.icon}>⚔️</span>
          <span className={styles.label}>戰鬥</span>
        </button>

        <button
          className={[
            styles["ca-tab-btn"],
            activeView === "CRAFT" ? styles.active : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => {
            onSwitchView("CRAFT");
            onOpenModal(null); // Close any open modals
          }}
        >
          <span className={styles.icon}>🔨</span>
          <span className={styles.label}>打造</span>
        </button>

        <button
          className={styles["ca-tab-btn"]}
          onClick={() => onOpenModal("SHOP")}
        >
          <span className={styles.icon}>🛒</span>
          <span className={styles.label}>商店</span>
        </button>
      </nav>
    </footer>
  );
}
