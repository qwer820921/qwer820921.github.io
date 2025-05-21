"use client";
import { useEffect, useRef, useState } from "react";
import { getAllYtMusicTracks } from "./api/ytMusicApi";
import { YtMusicTrack } from "./types";
import PlaylistModal from "./components/playlistModal";

export default function YtMusicPage() {
  const [playlist, setPlaylist] = useState<YtMusicTrack[]>([]);
  const [currentTrackId, setCurrentTrackId] = useState<string | undefined>(
    undefined
  );
  const [showModal, setShowModal] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // 載入全部歌曲
  useEffect(() => {
    getAllYtMusicTracks().then(setPlaylist);
  }, []);

  // 取得目前播放曲目
  const currentTrack = playlist.find((t) => t.id === currentTrackId);

  // 播放控制
  const handlePlay = (id: string) => {
    setCurrentTrackId(id);
    setTimeout(() => {
      audioRef.current?.play();
    }, 0);
  };

  // TODO: 刪除、編輯、新增等功能

  return (
    <div className="container py-4">
      <h2>YT Music Player</h2>
      {/* 播放器區 */}
      <div className="mb-4">
        {currentTrack ? (
          <div>
            <div className="mb-2">
              <strong>{currentTrack.title}</strong>{" "}
              <span className="text-muted">{currentTrack.artist}</span>
            </div>
            <audio
              ref={audioRef}
              controls
              src={currentTrack.mp3_url}
              autoPlay
            />
          </div>
        ) : (
          <div className="text-muted">請選擇歌曲開始播放</div>
        )}
      </div>
      {/* 清單區 */}
      <div className="mb-5">
        <ul className="list-group">
          {playlist.map((track) => (
            <li
              key={track.id}
              className={`list-group-item${track.id === currentTrackId ? " active" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={() => handlePlay(track.id)}
            >
              <div>
                {track.title}{" "}
                <span className="text-muted small">{track.artist}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {/* 浮動管理按鈕 */}
      <button
        style={{
          position: "fixed",
          bottom: 32,
          right: 32,
          zIndex: 999,
          borderRadius: "50%",
          width: 60,
          height: 60,
          fontSize: 32,
          background: "#007bff",
          color: "#fff",
          border: "none",
          boxShadow: "0 2px 8px rgba(0,0,0,.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
        onClick={() => setShowModal(true)}
        title="管理播放清單與查詢"
      >
        <span role="img" aria-label="playlist">
          🎵
        </span>
      </button>
      {/* Modal 彈窗 */}
      <PlaylistModal
        show={showModal}
        onClose={() => setShowModal(false)}
        playlist={playlist}
        currentTrackId={currentTrackId}
        onPlay={handlePlay}
        onDelete={() => {}}
        onEdit={() => {}}
        onAddTrack={async (track) => {
          // 1. 呼叫 API 新增
          await import("./api/ytMusicApi").then(async (api) => {
            await api.createYtMusicTrack({
              token: "YOUR_SECRET_TOKEN",
              youtube_url: track.youtube_url,
              youtube_id: track.youtube_id,
              title: track.title,
              artist: track.artist,
            });
            // 2. 新增成功後重新取得清單
            setTimeout(async () => {
              await api.getAllYtMusicTracks();
            }, 1000);
          });
        }}
      />
    </div>
  );
}
