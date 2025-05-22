"use client";

interface Props {
  currentTime: number;
  duration: number;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export default function TimeDisplay({ currentTime, duration }: Props) {
  return (
    <div className="text-center text-muted">
      {formatTime(currentTime)} / {formatTime(duration)}
    </div>
  );
}
