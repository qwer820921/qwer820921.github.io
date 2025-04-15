"use client";
import React, { memo } from "react";
import "./styles/formButton.css";

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
  primary: "btn btn-primary",
  secondary: "btn btn-secondary",
  danger: "btn btn-danger",
  success: "btn btn-success",
  info: "btn btn-info",
  warning: "btn btn-warning",
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
