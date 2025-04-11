"use client";
import React from "react";
import "./styles/modal.css";

interface BackdropProps {
  children: React.ReactNode;
}

const Modal: React.FC<BackdropProps> = ({ children }) => {
  return (
    <div>
      <div className="newBackdrop" />
      <div className="newModal">{children}</div>
    </div>
  );
};

export default Modal;
