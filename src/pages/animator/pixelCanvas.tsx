import React from "react";

interface PixelCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  handleCanvasClick: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseDown: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseMove: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseUp: (event: React.MouseEvent<HTMLCanvasElement>) => void;
}
const PixelCanvas: React.FC<PixelCanvasProps> = ({
  canvasRef,
  handleCanvasClick,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
}) => {
  return (
    <div className="d-flex justify-content-center align-items-center">
      <canvas
        ref={canvasRef}
        width={400}
        height={400}
        style={{ border: "1px solid #000", cursor: "pointer" }}
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    </div>
  );
};

export default PixelCanvas;
