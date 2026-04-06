"use client";

import React from "react";
import { formatBigNumber } from "../utils/formatNumber";
import styles from "../styles/clickAscension.module.css";

interface HpBarProps {
  name: string;
  currentHp: number;
  maxHp: number;
  isBoss?: boolean;
}

export default function HpBar({
  name,
  currentHp,
  maxHp,
  isBoss = false,
}: HpBarProps) {
  // Ensure valid display values
  const safeMaxHp = Math.max(1, maxHp);
  const safeCurrentHp = Math.min(Math.max(0, currentHp), safeMaxHp);
  const percentage = (safeCurrentHp / safeMaxHp) * 100;

  return (
    <div className="w-full max-w-[220px] space-y-1">
      {/* Name and Percentage */}
      <div className="flex justify-between text-[11px] font-bold">
        <span className="text-slate-300 me-2">{name}</span>
      </div>

      {/* HP Bar */}
      <div className={styles["ca-hp-bar"]}>
        <div
          className={[
            styles["ca-hp-bar-fill"],
            isBoss ? styles.boss : styles.normal,
          ].join(" ")}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* HP Numbers */}
      <div className="text-center text-[10px] text-slate-500 font-mono">
        {formatBigNumber(Math.ceil(safeCurrentHp), 2, 1000)} /{" "}
        {formatBigNumber(Math.ceil(safeMaxHp), 2, 1000)}
      </div>
    </div>
  );
}
