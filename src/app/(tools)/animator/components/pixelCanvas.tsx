import React from "react";

interface PixelCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  handleCanvasClick: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseDown: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseMove: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseUp: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  handleTouchStart: (event: React.TouchEvent<HTMLCanvasElement>) => void;
  handleTouchMove: (event: React.TouchEvent<HTMLCanvasElement>) => void;
  handleTouchEnd: (event: React.TouchEvent<HTMLCanvasElement>) => void;
  className?: string;
}
const PixelCanvas: React.FC<PixelCanvasProps> = ({
  canvasRef,
  handleCanvasClick,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  className,
}) => {
  return (
    <div className="d-flex justify-content-center align-items-center w-100">
      <canvas
        ref={canvasRef}
        width={400}
        height={400}
        className={className}
        style={{
          border: "1px solid #BEBEBE",
          cursor: "pointer",
          backgroundColor: "#fff",
        }}
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  );
};

export default PixelCanvas;
