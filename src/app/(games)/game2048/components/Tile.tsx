"use client";
import React from "react";
import { Tile as TileType } from "../types";

interface TileProps {
  tile: TileType;
}

const Tile: React.FC<TileProps> = ({ tile }) => {
  const { value, position, isNew, isMerged } = tile;

  const classes = [
    "tile",
    `tile-${value}`,
    isNew ? "tile-new" : "",
    isMerged ? "tile-merged" : "",
  ].join(" ");

  // 使用 transform 進行平滑移動，效率更高且支援 transition
  const style: React.CSSProperties = {
    transform: `translate(${position.y * 110.5}%, ${position.x * 110.5}%)`,
    zIndex: isMerged ? 15 : 10,
  };

  return (
    <div className={classes} style={style}>
      <div className="tile-inner">{value}</div>
    </div>
  );
};

export default Tile;
