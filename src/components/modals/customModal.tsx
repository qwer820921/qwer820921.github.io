"use client";
import FormButton from "../buttons/formButton";
import React from "react";
import "./styles/modal.css";
import Modal from "./modal";

interface CustomModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  confirmText?: string;
  onClose: () => void;
  closeText?: string;
  buttonType?: "submit" | "button";
  children: React.ReactNode;
  hasWidth?: boolean;
  isShowClose?: boolean;
  isConfirmDisabled?: boolean;
}

const CustomModal: React.FC<CustomModalProps> = ({
  isOpen,
  onConfirm,
  confirmText = "確定",
  onClose,
  closeText = "返回",
  buttonType = "button",
  children,
  hasWidth = false,
  isShowClose = true,
  isConfirmDisabled = false,
}) => {
  if (!isOpen) return null;

  return (
    <Modal>
      <div className={`modalContent ${hasWidth ? "w-75" : ""}`}>
        {children}
        <div className="modalContainer">
          <FormButton
            text={confirmText}
            style="primary"
            onClick={onConfirm}
            type={buttonType}
            disabled={isConfirmDisabled}
          />
          {isShowClose && (
            <FormButton text={closeText} style="secondary" onClick={onClose} />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default CustomModal;
