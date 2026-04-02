"use client";
import React from "react";
import styles from "./styles/modal.module.css";

interface BackdropProps {
  children: React.ReactNode;
}

const Modal: React.FC<BackdropProps> = ({ children }) => {
  return (
    <div>
      <div className={styles.newBackdrop} />
      <div className={styles.newModal}>{children}</div>
    </div>
  );
};

export default Modal;
