import React from "react";

export type ModalType = "PROFILE" | "UPGRADES" | "SHOP" | null;

interface FooterNavProps {
  onOpenModal: (modal: ModalType) => void;
}

export default function FooterNav({ onOpenModal }: FooterNavProps) {
  return (
    <footer className="ca-footer">
      <nav className="ca-footer-nav">
        <button className="ca-tab-btn" onClick={() => onOpenModal(null)}>
          <span className="icon">⚔️</span>
          <span className="label">戰鬥</span>
        </button>

        <button className="ca-tab-btn" onClick={() => onOpenModal("UPGRADES")}>
          <span className="icon">⚡</span>
          <span className="label">強化</span>
        </button>

        <button className="ca-tab-btn" onClick={() => onOpenModal("SHOP")}>
          <span className="icon">🛒</span>
          <span className="label">商店</span>
        </button>

        <button className="ca-tab-btn" onClick={() => onOpenModal("PROFILE")}>
          <span className="icon">👤</span>
          <span className="label">角色</span>
        </button>
      </nav>
    </footer>
  );
}
