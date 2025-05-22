"use client";
import { ChangeEvent } from "react";

interface Props {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

export default function ProgressBar({ currentTime, duration, onSeek }: Props) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onSeek(Number(e.target.value));
  };

  return (
    <input
      type="range"
      className="form-range"
      min={0}
      max={duration || 0}
      value={currentTime}
      onChange={handleChange}
    />
  );
}
