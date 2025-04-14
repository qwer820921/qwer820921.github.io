"use client";
import React from "react";
import "./styles/formButton.css";

type FromButtonStyle =
  | "confirm"
  | "deny"
  | "delete"
  | "download"
  | "history"
  | "handover";

interface FromButtonProps {
  onClick?: () => void;
  text: string;
  type?: "submit" | "button";
  style: FromButtonStyle;
  disabled?: boolean;
  styleClass?: React.CSSProperties;
}

const formButtonStyle: Record<FromButtonStyle, string> = {
  confirm: "btn btn-primary",
  deny: "btn btn-secondary",
  delete: "btn btn-danger",
  download: "btn btn-success",
  history: "btn btn-info",
  handover: "btn btn-warning",
};

const FormButton: React.FC<FromButtonProps> = ({
  onClick = () => {
    // intentionally left blank
  },
  text = "",
  type = "button",
  style = "confirm",
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

export default FormButton;
