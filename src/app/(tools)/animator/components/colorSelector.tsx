import React from "react";
import { ChromePicker, ColorResult } from "react-color";

interface ColorSelectorProps {
  value: string;
  onChange: (color: string) => void;
}

const ColorSelectorChrome: React.FC<ColorSelectorProps> = ({
  value,
  onChange,
}) => {
  const handleChange = (color: ColorResult) => {
    onChange(color.hex);
  };

  return (
    <div className="d-flex flex-column align-items-center w-100 mx-auto">
      <div
        style={{
          width: "100%",
          overflowX: "auto",
          display: "flex",
          justifyContent: "center",
          padding: "5px 0",
        }}
      >
        <ChromePicker color={value} onChange={handleChange} />
      </div>
    </div>
  );
};

export default ColorSelectorChrome;
