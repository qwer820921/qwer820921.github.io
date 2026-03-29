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
    <div className="d-flex flex-column align-items-center">
      <h5>顏色選擇</h5>
      <ChromePicker color={value} onChange={handleChange} />
    </div>
  );
};

export default ColorSelectorChrome;
