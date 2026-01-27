/* eslint-disable @typescript-eslint/no-unused-vars, @next/next/no-img-element */
"use client";

import React from "react";
import { PlayerState } from "../types";
import "../styles/clickAscension.css";

interface HeaderProps {
  player: PlayerState;
  combatPower: number;
  stageId: number;
  onAvatarClick: () => void;
  onAscension: () => void;
  potentialPoints: number;
}

export default function Header({
  player,
  combatPower,
  stageId,
  onAvatarClick,
  onAscension,
  potentialPoints,
}: HeaderProps) {
  const { system, wallet } = player;
  const xpPercentage = (system.currentXp / system.requiredXp) * 100;

  return (
    <header className="ca-header">
      {/* Left: Player Profile */}
      <div className="ca-player-profile">
        {/* Avatar - Clickable */}
        <div
          className="ca-avatar-container ca-avatar-clickable"
          onClick={onAvatarClick}
        >
          <div className="ca-avatar-ring">
            <img
              src="/images/default-avatar.png"
              alt="玩家頭像"
              className="ca-avatar-img"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%234f46e5"/><text x="50" y="60" text-anchor="middle" fill="white" font-size="40">😎</text></svg>';
              }}
            />
          </div>
          {/* Level Badge */}
          <div className="ca-level-badge">{system.level}</div>
        </div>

        {/* Info Panel */}
        <div className="ca-profile-info">
          {/* Level & Name Row */}
          <div className="ca-profile-top">
            <span className="ca-level-text">Lv.{system.level}</span>
            <span className="ca-player-name">冒險者</span>
          </div>

          {/* EXP Bar */}
          <div className="ca-exp-container">
            <div className="ca-exp-label">EXP</div>
            <div className="ca-exp-bar">
              <div
                className="ca-exp-fill"
                style={{ width: `${Math.min(100, xpPercentage)}%` }}
              />
            </div>
            <div className="ca-exp-text">
              {system.currentXp.toLocaleString()}/
              {system.requiredXp.toLocaleString()}
            </div>
          </div>

          {/* Combat Power & Ascension Row */}
          <div
            className="ca-combat-power"
            style={{ justifyContent: "space-between", width: "100%" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span className="ca-cp-label">戰力</span>
              <span className="ca-cp-value">
                {combatPower.toLocaleString()}
              </span>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onAscension();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "linear-gradient(135deg, #a855f7 0%, #d946ef 100%)",
                color: "white",
                padding: "4px 10px",
                fontSize: "0.65rem",
                fontWeight: "bold",
                borderRadius: "6px",
                border: "1px solid rgba(255,255,255,0.2)",
                cursor: "pointer",
                boxShadow: "0 0 10px rgba(168, 85, 247, 0.3)",
                flexShrink: 0,
              }}
            >
              ⚡ 渡劫飛升 (+{potentialPoints.toLocaleString()})
            </button>
          </div>
        </div>
      </div>

      {/* Right: Currency */}
      <div className="ca-header-right">
        {/* Currency Stack */}
        <div className="ca-currency-stack">
          <div className="ca-currency ca-currency-gold text-xs">
            <span>💰</span>
            <span>{Math.floor(wallet.gold).toLocaleString()}</span>
          </div>
          <div className="ca-currency ca-currency-cp text-xs">
            <span>⚡</span>
            <span>{Math.floor(wallet.clickPoints).toLocaleString()}</span>
          </div>
          <div className="ca-currency text-xs" style={{ color: "#10b981" }}>
            <span>🆙</span>
            <span>{Math.floor(wallet.levelPoints).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
