"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  CaretRightFill,
  PauseFill,
  ChevronBarLeft,
  ChevronBarRight,
} from "react-bootstrap-icons";

// 型別宣告
interface SoundCloudWidget {
  load: (url: string, options?: object) => void;
  play: () => void;
  pause: () => void;
  bind: (event: string, cb: () => void) => void;
  unbind: (event: string) => void;
  getPosition: (cb: (ms: number) => void) => void;
  getDuration: (cb: (ms: number) => void) => void;
  seekTo: (ms: number) => void;
}
declare global {
  interface Window {
    SC?: {
      Widget: {
        (iframe: HTMLIFrameElement): SoundCloudWidget;
        Events: {
          FINISH: string;
        };
      };
    };
  }
}

import PlaylistModal from "./playlistModal";
import { getPlaylist } from "../api/soundcloudPlaylistApi";
import { PlaylistTrack } from "../types/soundcloud";

type Track = {
  title: string;
  url: string;
  embedHtml: string;
  artworkUrl?: string;
  artist?: string;
};

const SoundCloudPlayerPage: React.FC = () => {
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const widgetRef = useRef<SoundCloudWidget | null>(null);

  // 初始化取得播放清單
  useEffect(() => {
    getPlaylist().then((data: PlaylistTrack[]) => {
      setPlaylist(
        data.map((item) => ({
          title: item.title,
          url: item.url,
          embedHtml: item.embed_html || "",
          artworkUrl: item.artwork_url || "/images/music-default.png",
          artist: item.artist || "",
        }))
      );
    });
    // 動態載入 SoundCloud Widget API
    if (!window.SC) {
      const script = document.createElement("script");
      script.src = "https://w.soundcloud.com/player/api.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  // playlist 變動時，盡量維持原本播放曲目
  useEffect(() => {
    setCurrentIndex((prevIdx) => {
      if (playlist.length === 0) return 0;
      // 嘗試維持原本播放曲目
      return playlist[prevIdx] ? prevIdx : 0;
    });
  }, [playlist]);

  const playTrack = (idx: number) => setCurrentIndex(idx);
  const currentTrack = playlist[currentIndex];

  // 控制 SoundCloud widget
  useEffect(() => {
    if (!iframeRef.current || !window.SC) return;

    widgetRef.current = window.SC.Widget(iframeRef.current);

    // 換歌時自動播放
    widgetRef.current.load(currentTrack?.url, { auto_play: isPlaying });

    // 先解除舊的 FINISH 綁定，避免重複觸發
    if (widgetRef.current.unbind) {
      widgetRef.current.unbind(window.SC.Widget.Events.FINISH);
    }

    // 綁定 FINISH 事件：自動切換下一首
    widgetRef.current.bind(window.SC.Widget.Events.FINISH, () => {
      if (playlist.length === 0) return;
      if (currentIndex < playlist.length - 1) {
        playTrack(currentIndex + 1); // 下一首
      } else {
        playTrack(0); // 循環回到第一首
      }
    });

    // 重設進度條
    setCurrentTime(0);
    setDuration(0);
  }, [currentTrack]);

  // 播放/暫停外觀同步 widget
  useEffect(() => {
    if (!widgetRef.current) return;
    if (isPlaying) {
      widgetRef.current.play();
    } else {
      widgetRef.current.pause();
    }
  }, [isPlaying]);

  // 進度條定時更新
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (widgetRef.current && isPlaying) {
      interval = setInterval(() => {
        widgetRef.current?.getPosition((pos: number) => {
          if (!seeking) setCurrentTime(pos);
        });
        widgetRef.current?.getDuration((dur: number) => {
          setDuration(dur);
        });
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, seeking]);

  return (
    <main style={{ padding: 32 }}>
      {/* 播放區塊 */}
      {currentTrack ? (
        <>
          <div className="player-card">
            {/* 專輯圖片上浮效果 */}
            <div className="player-album-art">
              <img
                src={currentTrack.artworkUrl || "/images/img14.jpg"}
                alt={currentTrack.title}
                className="player-album-img"
                onError={(e) => (e.currentTarget.src = "/images/img14.jpg")}
              />
            </div>
            {/* 播放控制列（橫向） */}
            <div className="player-controls-row">
              <div className="player-controls-left">
                <div className="player-chevron-group">
                  <button
                    className="chevron-btn chevron-left"
                    onClick={() =>
                      playTrack(
                        (currentIndex - 1 + playlist.length) % playlist.length
                      )
                    }
                    disabled={playlist.length <= 1}
                    title="上一首"
                  >
                    <ChevronBarLeft size={28} />
                  </button>
                  <button
                    className="chevron-btn chevron-right"
                    onClick={() =>
                      playTrack((currentIndex + 1) % playlist.length)
                    }
                    disabled={playlist.length <= 1}
                    title="下一首"
                  >
                    <ChevronBarRight size={28} />
                  </button>
                </div>
                <div className="player-title-group">
                  <div className="player-title player-title-multiline">
                    {currentTrack.title}
                  </div>
                  <div className="player-artist">
                    {currentTrack.artist || ""}
                  </div>
                </div>
              </div>
              <div className="player-controls-play">
                <button
                  className="player-btn player-btn-large"
                  onClick={() => setIsPlaying((p) => !p)}
                  title={isPlaying ? "暫停" : "播放"}
                >
                  {isPlaying ? (
                    <PauseFill size={48} color="#fff" />
                  ) : (
                    <CaretRightFill size={48} color="#fff" />
                  )}
                </button>
              </div>
            </div>

            {/* 進度條與時間 */}
            <div className="player-progress-row">
              <span className="player-time">{formatTime(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration || 1}
                value={Math.min(currentTime, duration)}
                step={1000}
                className="player-progress-bar"
                onChange={(e) => {
                  setSeeking(true);
                  setCurrentTime(Number(e.target.value));
                }}
                onMouseUp={(e) => {
                  setSeeking(false);
                  widgetRef.current?.seekTo(Number(e.currentTarget.value));
                }}
                onTouchEnd={(e) => {
                  setSeeking(false);
                  widgetRef.current?.seekTo(
                    Number((e.target as HTMLInputElement).value)
                  );
                }}
              />
              <span className="player-time">{formatTime(duration)}</span>
            </div>
          </div>
        </>
      ) : (
        <div>無播放清單</div>
      )}
      {currentTrack && (
        <iframe
          ref={iframeRef}
          title="soundcloud-widget"
          style={{ display: "none" }}
          width="100%"
          height="80"
          allow="autoplay"
          src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(currentTrack.url)}&color=%23ff5500&auto_play=${isPlaying ? "true" : "false"}`}
        />
      )}
      <button
        style={{
          position: "fixed",
          bottom: 32,
          right: 32,
          zIndex: 999,
          borderRadius: "50%",
          width: 60,
          height: 60,
          fontSize: 28,
          background: "#ff5500",
          color: "#fff",
          border: "none",
          boxShadow: "0 2px 8px rgba(0,0,0,.2)",
        }}
        onClick={() => setShowModal(true)}
        title="管理播放清單與查詢"
      >
        <span role="img" aria-label="playlist">
          🎵
        </span>
      </button>

      {/* Modal */}
      <PlaylistModal
        show={showModal}
        onClose={() => setShowModal(false)}
        playlist={playlist.map((track) => ({
          id: track.url,
          title: track.title,
          artist: "",
          url: track.url,
          added_at: "",
          embed_html: track.embedHtml,
        }))}
        currentTrackId={playlist[currentIndex]?.url || null}
        onPlay={(url) => {
          const idx = playlist.findIndex((t) => t.url === url);
          if (idx >= 0) playTrack(idx);
        }}
        onDelete={(url) => setPlaylist(playlist.filter((t) => t.url !== url))}
        onEdit={() => {}}
        onAddTrack={async () => {
          const data = await getPlaylist();
          setPlaylist(
            data.map((item) => ({
              title: item.title,
              url: item.url,
              embedHtml: item.embed_html || "",
            }))
          );
        }}
      />
      <style>{`
.player-card {
  width: 100%;
  max-width: 340px;
  background: linear-gradient(145deg, #e6ecf4 0%, #f7fafd 100%);
  border-radius: 24px;
  box-shadow: 0 8px 32px rgba(60,80,120,0.10);
  padding: 7.5vw 5vw 6vw 5vw;
  /* 上右下左，隨螢幕縮放 */
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  box-sizing: border-box;
}
@media (min-width: 400px) {
  .player-card {
    padding: 32px 24px 24px 24px;
  }
}
.player-album-art {
  margin-top: -80px;
  margin-bottom: 24px;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(60,80,120,0.18);
  padding: 8px;
  display: inline-block;
  width: 85%;
  box-sizing: border-box;
  max-width: 272px;
}
.player-progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 12px;
}
.player-progress-bar {
  flex: 1 1 0%;
  appearance: none;
  height: 5px;
  border-radius: 3px;
  background: #e0e3ea;
  outline: none;
  transition: background 0.2s;
  margin: 0 8px;
}
.player-progress-bar::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ff5500;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(60,80,120,0.10);
  cursor: pointer;
  transition: background 0.2s;
}
.player-progress-bar:active::-webkit-slider-thumb {
  background: #1976d2;
}
.player-progress-bar::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ff5500;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(60,80,120,0.10);
  cursor: pointer;
  transition: background 0.2s;
}
.player-progress-bar:active::-moz-range-thumb {
  background: #1976d2;
}
.player-progress-bar::-ms-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ff5500;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(60,80,120,0.10);
  cursor: pointer;
  transition: background 0.2s;
}
.player-progress-bar:active::-ms-thumb {
  background: #1976d2;
}
.player-progress-bar:focus {
  background: #bbdefb;
}
.player-time {
  width: 44px;
  text-align: center;
  font-size: 14px;
  color: #b5bdd3;
  font-weight: 700;
}

.player-album-img {
  width: 100%;
  aspect-ratio: 1/1;
  border-radius: 16px;
  object-fit: cover;
  display: block;
}

.player-controls-row {
  display: flex;
  align-items: stretch;
  width: 100%;
  margin-bottom: 18px;
  flex-wrap: nowrap;
}
.player-controls-left {
  flex: 1 1 0%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 4px;
}
.player-chevron-group {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.player-title-group {
  display: flex;
  flex-direction: column;
}
.player-title {
  font-weight: 700;
  font-size: 18px;
  color: #6b7a99;
  margin-bottom: 2px;
  max-width: 100%;
  padding-right: 8px;
}
.player-title-multiline {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-all;
  white-space: normal;
}
.player-artist {
  font-weight: 400;
  font-size: 15px;
  color: #b5bdd3;
  margin-bottom: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.player-controls-play {
  flex: 0 0 72px;
  min-width: 72px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.player-btn.player-btn-large {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 8px solid #fff;
  background: #f0f2f5;
  box-shadow: 0 2px 12px rgba(60,80,120,0.10);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  color: #fff;
  position: relative;
  outline: none;
  cursor: pointer;
  transition: background 0.2s, box-shadow 0.2s;
}
.player-btn.player-btn-large:hover {
  background: #e0e3ea;
  box-shadow: 0 4px 16px rgba(60,80,120,0.16);
}
.chevron-btn {
  font-size: 26px;
  border: none;
  background: none;
  cursor: pointer;
  color: #b0b8c9;
  margin: 0 4px;
  border-radius: 8px;
  transition: color 0.18s;
  padding: 3px 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.chevron-btn:disabled {
  color: #e0e3ea;
  cursor: not-allowed;
}
.chevron-btn:hover:not(:disabled) {
  color: #1976d2;
}
`}</style>
    </main>
  );
};

function formatTime(ms: number) {
  if (!ms || isNaN(ms)) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const min = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const sec = (totalSeconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

export default SoundCloudPlayerPage;
