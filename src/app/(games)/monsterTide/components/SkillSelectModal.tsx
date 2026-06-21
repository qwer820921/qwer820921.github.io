"use client";
import type { SkillOption } from "../types";

interface SkillSelectModalProps {
  options: SkillOption[];
  onSelect: (skill: SkillOption) => void;
}

export default function SkillSelectModal({
  options,
  onSelect,
}: SkillSelectModalProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0, 0, 0, 0.78)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
        padding: "0 12px",
      }}
    >
      <div
        style={{
          color: "#f0e040",
          fontWeight: "bold",
          fontSize: 20,
          marginBottom: 6,
        }}
      >
        ✨ 升級！
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.6)",
          fontSize: 13,
          marginBottom: 18,
        }}
      >
        選擇一個技能強化
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: "100%",
          maxWidth: 400,
        }}
      >
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onSelect(opt)}
            style={{
              background: "rgba(20, 30, 65, 0.95)",
              border: "2px solid #4a8ac4",
              borderRadius: 12,
              padding: "12px 16px",
              color: "#ffffff",
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              gap: 14,
              alignItems: "center",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.borderColor = "#80c4ff")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.borderColor = "#4a8ac4")
            }
          >
            <span style={{ fontSize: 34, lineHeight: 1 }}>{opt.icon}</span>
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <span
                  style={{ fontWeight: "bold", fontSize: 16, color: "#f0e040" }}
                >
                  {opt.name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    background: opt.currentLevel === 0 ? "#2a7a3a" : "#3a4a8a",
                    color: "#fff",
                    borderRadius: 4,
                    padding: "2px 6px",
                  }}
                >
                  {opt.currentLevel === 0
                    ? "新"
                    : `Lv${opt.currentLevel} → Lv${opt.nextLevel}`}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#aac8e8", lineHeight: 1.4 }}>
                {opt.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
