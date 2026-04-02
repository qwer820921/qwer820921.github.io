"use client";
import React, { memo } from "react";
import styles from "./styles/formButton.module.css";

type FromButtonStyle =
  | "primary"
  | "secondary"
  | "danger"
  | "success"
  | "info"
  | "warning";

interface FromButtonProps {
  onClick?: () => void;
  text: string;
  type?: "submit" | "button";
  style: FromButtonStyle;
  disabled?: boolean;
  styleClass?: React.CSSProperties;
}

const formButtonStyle: Record<FromButtonStyle, string> = {
  primary: styles.btnPrimary,
  secondary: styles.btnSecondary,
  danger: styles.btnDanger,
  success: styles.btnSuccess,
  info: styles.btnInfo,
  warning: styles.btnWarning,
};

const FormButton: React.FC<FromButtonProps> = ({
  onClick = () => {
    // intentionally left blank
  },
  text = "",
  type = "button",
  style = "primary",
  disabled = false,
  styleClass,
}) => {
  return (
    <button
      type={type}
      className={formButtonStyle[style]}
      onClick={onClick}
      disabled={disabled}
      style={styleClass}
    >
      {text}
    </button>
  );
};

export default memo(FormButton);
