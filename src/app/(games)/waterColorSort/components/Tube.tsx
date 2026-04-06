import React from "react";
import styles from "../styles/waterColorSort.module.css";
import { TubeState } from "../types";

interface TubeProps {
  tube: TubeState;
  isSelected: boolean;
  isHintSource?: boolean;
  isHintTarget?: boolean;
  onClick: () => void;
}

const Tube: React.FC<TubeProps> = ({
  tube,
  isSelected,
  isHintSource,
  isHintTarget,
  onClick,
}) => {
  return (
    <div
      className={[
        styles["tube-wrapper"],
        isSelected ? styles.selected : "",
        isHintSource ? styles["hint-source"] : "",
        isHintTarget ? styles["hint-target"] : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      <div className={styles["tube-body"]}>
        {tube.colors.map((color, idx) => (
          <div
            key={`${tube.id}-${idx}`}
            className={styles["liquid-segment"]}
            style={{
              position: "absolute",
              bottom: `${idx * (180 / tube.capacity)}px`,
              width: "100%",
              height: `${180 / tube.capacity}px`,
              background: color,
              transition: "all 0.4s ease",
              boxShadow:
                "inset 0 4px 10px rgba(0,0,0,0.1), inset 0 -4px 10px rgba(255,255,255,0.1)",
              zIndex: 10,
            }}
          >
            {/* Reflection Effect */}
            <div
              style={{
                position: "absolute",
                top: "10%",
                left: "10%",
                width: "15%",
                height: "80%",
                background: "rgba(255, 255, 255, 0.2)",
                borderRadius: "10px",
                filter: "blur(1px)",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default Tube;
