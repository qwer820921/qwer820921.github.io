"use client";
import { Button } from "react-bootstrap";

interface Props {
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeekBackward: () => void;
  onSeekForward: () => void;
  isPlaying: boolean;
}

export default function PlaybackControls({
  onPlay,
  onPause,
  onNext,
  onPrev,
  onSeekBackward,
  onSeekForward,
  isPlaying,
}: Props) {
  return (
    <div className="d-flex gap-2 flex-wrap mb-3">
      <Button onClick={onPrev}>⏮ 上一首</Button>
      <Button onClick={onSeekBackward}>⏪ -5 秒</Button>
      <Button onClick={isPlaying ? onPause : onPlay}>
        {isPlaying ? "⏸ 暫停" : "▶ 播放"}
      </Button>
      <Button onClick={onSeekForward}>⏩ +5 秒</Button>
      <Button onClick={onNext}>⏭ 下一首</Button>
    </div>
  );
}
