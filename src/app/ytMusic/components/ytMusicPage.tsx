"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { deleteYtMusicTrack, getUserYtMusicTracks } from "../api/ytMusicApi";
import PlaylistModal from "../components/playlistModal";
import "../styles/player.css";
import { YtMusicTrack } from "../types";
import {
  CaretRightFill,
  ChevronBarLeft,
  ChevronBarRight,
  ChevronLeft,
  ChevronRight,
  MusicNoteBeamed,
  PauseFill,
  Shuffle,
  Repeat1,
  ArrowRepeat,
} from "react-bootstrap-icons";

function formatTime(time: number): string {
  const min = Math.floor(time / 60);
  const sec = Math.floor(time % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

type PlayMode = "sequential" | "shuffle" | "repeat";

// 生成隨機播放列表的輔助函數
const generateShufflePlaylist = (currentIndex: number, length: number) => {
  if (length === 0) return [];
  const indices = Array.from({ length }, (_, i) => i).filter(
    (i) => i !== currentIndex
  );
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return [currentIndex, ...indices];
};

export default function YtMusicPage() {
  const [playlist, setPlaylist] = useState<YtMusicTrack[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const [playMode, setPlayMode] = useState<PlayMode>("sequential");
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);
  const [currentShuffleIndex, setCurrentShuffleIndex] = useState(-1);

  const audioRef = useRef<HTMLAudioElement>(null);
  const currentTrack = playlist[currentTrackIndex];

  // 當播放模式或播放列表變化時，重新生成隨機播放列表
  useEffect(() => {
    if (playMode === "shuffle" && playlist.length > 0) {
      const newShuffledIndices = generateShufflePlaylist(
        currentTrackIndex,
        playlist.length
      );
      setShuffledIndices(newShuffledIndices);
      setCurrentShuffleIndex(0);
    }
  }, [playMode, playlist, currentTrackIndex]);

  // 切換播放模式
  const togglePlayMode = () => {
    setPlayMode((prev) => {
      switch (prev) {
        case "sequential":
          return "shuffle";
        case "shuffle":
          return "repeat";
        case "repeat":
          return "sequential";
        default:
          return "sequential";
      }
    });
  };

  // 獲取下一個曲目索引
  const getNextTrackIndex = useCallback(() => {
    if (playlist.length === 0) return 0;

    switch (playMode) {
      case "repeat":
        return currentTrackIndex;
      case "shuffle":
        if (shuffledIndices.length === 0) return 0;
        const nextIndex = currentShuffleIndex + 1;
        if (nextIndex >= shuffledIndices.length) {
          const newShuffledIndices = generateShufflePlaylist(
            currentTrackIndex,
            playlist.length
          );
          setShuffledIndices(newShuffledIndices);
          setCurrentShuffleIndex(0);
          return newShuffledIndices[0] || 0;
        }
        setCurrentShuffleIndex(nextIndex);
        return shuffledIndices[nextIndex];
      case "sequential":
      default:
        return (currentTrackIndex + 1) % playlist.length;
    }
  }, [
    currentTrackIndex,
    playMode,
    playlist.length,
    shuffledIndices,
    currentShuffleIndex,
  ]);

  // 獲取上一個曲目索引
  const getPrevTrackIndex = useCallback(() => {
    if (playlist.length === 0) return 0;

    switch (playMode) {
      case "repeat":
        return currentTrackIndex;
      case "shuffle":
        if (shuffledIndices.length === 0) return 0;
        const prevIndex = currentShuffleIndex - 1;
        if (prevIndex < 0) return currentTrackIndex;
        setCurrentShuffleIndex(prevIndex);
        return shuffledIndices[prevIndex];
      case "sequential":
      default:
        return currentTrackIndex - 1 >= 0
          ? currentTrackIndex - 1
          : playlist.length - 1;
    }
  }, [
    currentTrackIndex,
    playMode,
    playlist.length,
    shuffledIndices,
    currentShuffleIndex,
  ]);

  // 當切換曲目時，自動播放新曲目（僅在用戶已交互後）
  useEffect(() => {
    if (!audioRef.current || !currentTrack?.objectUrl) return;

    const audio = audioRef.current;
    audio.src = currentTrack.objectUrl;

    const handleCanPlay = () => {
      if (userInteracted) {
        audio.play().catch((error) => {
          console.error("播放失敗:", error);
        });
      }
    };

    audio.addEventListener("canplay", handleCanPlay);
    audio.load();

    return () => {
      audio.removeEventListener("canplay", handleCanPlay);
    };
  }, [currentTrack, userInteracted]);

  // 監聽用戶的首次交互
  useEffect(() => {
    const handleFirstInteraction = () => {
      setUserInteracted(true);
      document.removeEventListener("click", handleFirstInteraction);
      document.removeEventListener("keydown", handleFirstInteraction);
    };

    document.addEventListener("click", handleFirstInteraction);
    document.addEventListener("keydown", handleFirstInteraction);

    return () => {
      document.removeEventListener("click", handleFirstInteraction);
      document.removeEventListener("keydown", handleFirstInteraction);
    };
  }, []);

  const { userId } = useAuth();

  // 初始化播放列表
  useEffect(() => {
    const fetchPlaylist = async () => {
      if (!userId) {
        console.log("用戶未登入，不獲取播放列表");
        setPlaylist([]);
        return;
      }

      try {
        console.log(`正在獲取用戶 ${userId} 的播放列表...`);
        const data = await getUserYtMusicTracks(userId);

        const tracksWithUrls = await Promise.all(
          data.map(async (track: YtMusicTrack) => {
            try {
              console.log(`緩存音頻: ${track.title}`);
              const res = await fetch(track.mp3_url);
              if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

              const blob = await res.blob();
              const objectUrl = URL.createObjectURL(blob);
              return { ...track, objectUrl };
            } catch (error) {
              console.error(`快取失敗: ${track.title}`, error);
              return track; // 返回原始 track，不包含 objectUrl
            }
          })
        );

        setPlaylist(tracksWithUrls);
        console.log(`成功加載 ${tracksWithUrls.length} 首歌曲`);
      } catch (error) {
        console.error("獲取播放列表失敗:", error);
        // 可以考慮在這裡設置一個錯誤狀態，以便在 UI 中顯示錯誤信息
      }
    };

    fetchPlaylist();
  }, [userId]); // 當 userId 變化時重新獲取播放列表

  // 組件卸載時清理
  useEffect(() => {
    return () => {
      playlist.forEach((track) => {
        if (track.objectUrl) {
          URL.revokeObjectURL(track.objectUrl);
        }
      });
    };
  }, [playlist]);

  // 處理刪除曲目
  const handleDeleteTrack = async (trackId: string) => {
    if (!confirm("確定要從播放清單中刪除這首歌嗎？")) {
      return;
    }

    if (!userId) {
      console.error("用戶未登入，無法刪除歌曲");
      return;
    }

    try {
      // 從後端刪除
      await deleteYtMusicTrack({
        token: "YOUR_API_TOKEN", // token
        action: "delete",
        user_id: userId,
        youtube_id: trackId,
      });

      // 從前端狀態中移除
      setPlaylist((prev) => {
        const newPlaylist = prev.filter(
          (track) => track.youtube_id !== trackId
        );

        // 如果刪除的是當前正在播放的曲目，自動播放下一首
        if (currentTrack?.youtube_id === trackId) {
          const currentIndex = playlist.findIndex(
            (t) => t.youtube_id === trackId
          );
          if (newPlaylist.length > 0) {
            const nextIndex =
              currentIndex >= newPlaylist.length ? 0 : currentIndex;
            setCurrentTrackIndex(nextIndex);
          } else {
            setCurrentTrackIndex(0);
          }
        }

        return newPlaylist;
      });
    } catch (error) {
      console.error("刪除曲目失敗:", error);
      alert("刪除曲目失敗，請稍後再試");
    }
  };

  const handlePlay = () => {
    audioRef.current
      ?.play()
      .then(() => {
        setIsPlaying(true);
      })
      .catch((error) => {
        console.error("播放失敗:", error);
        setIsPlaying(false);
      });
  };

  const handlePause = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const playNext = () => {
    setCurrentTrackIndex(getNextTrackIndex());
  };

  const playPrev = () => {
    setCurrentTrackIndex(getPrevTrackIndex());
  };

  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (audio) {
      setCurrentTime(audio.currentTime);
      setDuration(audio.duration || 0);
    }
  };

  const seekForward = () => {
    if (audioRef.current) {
      handleSeek(audioRef.current.currentTime + 5);
    }
  };

  const seekBackward = () => {
    if (audioRef.current) {
      handleSeek(audioRef.current.currentTime - 5);
    }
  };

  const thumbnailUrl = currentTrack
    ? `https://img.youtube.com/vi/${currentTrack.youtube_id}/hqdefault.jpg`
    : "";

  return (
    <main style={{ padding: 32 }}>
      {currentTrack ? (
        <>
          <div className="player-card">
            <div className="player-album-art">
              <img
                src={thumbnailUrl}
                alt="cover"
                className="player-album-img"
              />
            </div>

            <div className="player-controls-row">
              <div className="player-controls-left">
                <div className="player-chevron-group">
                  {/* 播放模式切換 */}
                  <button
                    className="control-button"
                    onClick={togglePlayMode}
                    title={
                      playMode === "sequential"
                        ? "順序播放"
                        : playMode === "shuffle"
                          ? "隨機播放"
                          : "單曲循環"
                    }
                    style={{
                      color: playMode === "repeat" ? "#ff5500" : "inherit",
                      marginLeft: "8px",
                    }}
                  >
                    <div className="d-flex align-items-center">
                      {playMode === "sequential" && (
                        <ArrowRepeat className="control-icon" />
                      )}
                      {playMode === "shuffle" && (
                        <Shuffle className="control-icon" />
                      )}
                      {playMode === "repeat" && (
                        <Repeat1 className="control-icon" />
                      )}
                    </div>
                  </button>

                  {/* 快退 */}
                  <button
                    className="control-button"
                    onClick={seekBackward}
                    title="快退 5 秒"
                  >
                    <div className="d-flex align-items-center">
                      <ChevronLeft className="control-icon" />
                      <span style={{ fontSize: "0.9rem", color: "#666" }}>
                        5s
                      </span>
                    </div>
                  </button>

                  {/* 上一首 */}
                  <button
                    className="control-button"
                    onClick={playPrev}
                    title="上一首"
                  >
                    <div className="d-flex align-items-center">
                      <ChevronBarLeft className="control-icon" />
                    </div>
                  </button>

                  {/* 下一首 */}
                  <button
                    className="control-button"
                    onClick={playNext}
                    title="下一首"
                  >
                    <div className="d-flex align-items-center">
                      <ChevronBarRight className="control-icon" />
                    </div>
                  </button>

                  {/* 快進 */}
                  <button
                    className="control-button"
                    onClick={seekForward}
                    title="快進 5 秒"
                  >
                    <div className="d-flex align-items-center">
                      <span style={{ fontSize: "0.9rem", color: "#666" }}>
                        5s
                      </span>
                      <ChevronRight className="control-icon" />
                    </div>
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
                  style={{
                    border: "8px solid #fff",
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    background: "#e0e3e8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 12px rgba(60,80,120,0.10)",
                    padding: 0,
                    outline: "none",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    if (isPlaying) {
                      handlePause();
                    } else {
                      handlePlay();
                    }
                  }}
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

            <div className="player-progress-row">
              <span className="player-time">{formatTime(currentTime)}</span>
              <input
                type="range"
                className="player-progress-bar"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={(e) => handleSeek(Number(e.target.value))}
              />
              <span className="player-time">{formatTime(duration)}</span>
            </div>
          </div>

          <audio
            ref={audioRef}
            onTimeUpdate={handleTimeUpdate}
            onEnded={playNext}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            style={{ display: "none" }}
          />
        </>
      ) : (
        <div>載入中...</div>
      )}

      {/* 管理按鈕 */}
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
          background: "#ff5500",
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
        <MusicNoteBeamed size={32} />
      </button>

      <PlaylistModal
        show={showModal}
        onClose={() => setShowModal(false)}
        playlist={playlist}
        currentTrackId={currentTrack?.youtube_id}
        onPlay={(trackId) => {
          const index = playlist.findIndex(
            (track) => track.youtube_id === trackId
          );
          if (index !== -1) {
            setCurrentTrackIndex(index);
            handlePlay();
          }
        }}
        onDelete={handleDeleteTrack}
        onAddTrack={async () => {
          if (!userId) {
            console.error("用戶未登入，無法添加歌曲");
            return;
          }
          try {
            const data = await getUserYtMusicTracks(userId);
            const tracksWithUrls = await Promise.all(
              data.map(async (track: YtMusicTrack) => {
                try {
                  const res = await fetch(track.mp3_url);
                  if (!res.ok)
                    throw new Error(`HTTP error! status: ${res.status}`);
                  const blob = await res.blob();
                  const objectUrl = URL.createObjectURL(blob);
                  return { ...track, objectUrl };
                } catch (error) {
                  console.error(`快取失敗: ${track.title}`, error);
                  return { ...track };
                }
              })
            );
            setPlaylist(tracksWithUrls);
          } catch (error) {
            console.error("更新播放列表失敗:", error);
          }
        }}
      />
    </main>
  );
}
