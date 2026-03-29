import React from "react";

export type ModalType = "PROFILE" | "UPGRADES" | "SHOP" | "INVENTORY" | null;
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
    <footer className="ca-footer">
      <nav className="ca-footer-nav">
        <button
          className={`ca-tab-btn ${activeView === "CHARACTER" ? "active" : ""}`}
          onClick={() => {
            onSwitchView("CHARACTER");
            onOpenModal(null); // Close any open modals
          }}
        >
          <span className="icon">👤</span>
          <span className="label">角色</span>
        </button>

        <button
          className={`ca-tab-btn ${activeView === "BATTLE" ? "active" : ""}`}
          onClick={() => {
            onSwitchView("BATTLE");
            onOpenModal(null); // Close any open modals
          }}
        >
          <span className="icon">⚔️</span>
          <span className="label">戰鬥</span>
        </button>

        <button
          className={`ca-tab-btn ${activeView === "CRAFT" ? "active" : ""}`}
          onClick={() => {
            onSwitchView("CRAFT");
            onOpenModal(null); // Close any open modals
          }}
        >
          <span className="icon">🔨</span>
          <span className="label">打造</span>
        </button>

        <button className="ca-tab-btn" onClick={() => onOpenModal("SHOP")}>
          <span className="icon">🛒</span>
          <span className="label">商店</span>
        </button>
      </nav>
    </footer>
  );
}
