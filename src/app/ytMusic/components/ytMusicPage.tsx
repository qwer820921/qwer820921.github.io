/* eslint-disable react-hooks/exhaustive-deps */
"use client";

// 導入必要的 React hooks 和自定義上下文、API、組件及樣式
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext"; // 用於獲取用戶認證資訊
import { deleteYtMusicTrack, getUserYtMusicTracks } from "../api/ytMusicApi"; // API 函數，用於與後端交互
import YtMusicPlaylistModal from "../components/playlistModal"; // 播放列表管理模態框組件
import "../styles/player.css"; // 播放器樣式
import { YtMusicTrack } from "../types"; // 音樂曲目資料型別
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
} from "react-bootstrap-icons"; // 圖標組件，用於播放器控制按鈕
import { formatTime } from "@/utils/format"; // 格式化時間
import { Spinner } from "react-bootstrap";
import { printValue } from "@/utils/createElement";

// 定義播放模式的型別：順序播放、隨機播放、單曲循環
type PlayMode = "sequential" | "shuffle" | "repeat";

// YouTube 音樂播放器頁面主組件
export default function YtMusicPage() {
  // 狀態管理
  // const [originalPlaylist, setOriginalPlaylist] = useState<YtMusicTrack[]>([]); // "原始播放清單", 用於模態框
  const [playlist, setPlaylist] = useState<YtMusicTrack[]>([]); // "播放歌曲清單", 非播放中的歌曲序列
  const [playIndices, setPlayIndices] = useState<number[]>([]); // " '播放歌曲清單'的索引列表",會因為模式而打亂
  const [currentTrackIndex, setCurrentTrackIndex] = useState(-1); // "播放歌曲清單的索引列表"的播放中的索引
  const [showModal, setShowModal] = useState(false); // 控制播放列表Modal顯示
  const [currentTime, setCurrentTime] = useState(0); // 當前播放時間
  const [duration, setDuration] = useState(0); // 曲目總時長
  const [isPlaying, setIsPlaying] = useState(false); // 播放狀態
  const [userInteracted, setUserInteracted] = useState(false); // 用戶是否已進行交互（解決瀏覽器自動播放限制）
  const [playMode, setPlayMode] = useState<PlayMode>("sequential"); // 當前播放模式

  const audioRef = useRef<HTMLAudioElement>(null); // 音頻元素引用
  const [currentTrack, setCurrentTrack] = useState<YtMusicTrack | null>(null);
  const [loadingTracks, setLoadingTracks] = useState<Set<string>>(new Set()); // 追蹤正在加載的曲目 ID

  const { userId } = useAuth(); // 從認證上下文中獲取用戶 ID

  // 切換播放模式：順序 -> 隨機 -> 單曲循環
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

  // 處理曲目刪除
  const handleDeleteTrack = async (trackId: string) => {
    if (!confirm("確定要從播放清單中刪除這首歌嗎？")) return;
    if (!userId) {
      console.error("用戶未登入，無法刪除歌曲");
      return;
    }

    try {
      await deleteYtMusicTrack({
        token: "YOUR_API_TOKEN",
        action: "delete",
        user_id: userId,
        youtube_id: trackId,
      });

      setPlaylist((prevPlaylist) => {
        const newPlaylist = prevPlaylist.filter(
          (track) => track.youtube_id !== trackId
        );

        setPlayIndices((prevIndices) => {
          const actualTrackIndex = prevPlaylist.findIndex(
            (t) => t.youtube_id === trackId
          );
          if (actualTrackIndex === -1) return prevIndices;

          const newPlayIndices = prevIndices.filter(
            (i) => i !== actualTrackIndex
          );

          // 如果刪除的就是正在播放的那一首
          if (playIndices[currentTrackIndex] === actualTrackIndex) {
            if (newPlayIndices.length > 0) {
              setCurrentTrackIndex((prev) =>
                prev >= newPlayIndices.length ? 0 : prev
              );
            } else {
              setCurrentTrackIndex(0);
            }
          } else {
            // 如果刪除的曲目在目前播放前面，currentTrackIndex 需要往前補正
            const deletedIndexInPlayOrder = prevIndices.findIndex(
              (i) => i === actualTrackIndex
            );
            if (
              deletedIndexInPlayOrder !== -1 &&
              deletedIndexInPlayOrder < currentTrackIndex
            ) {
              setCurrentTrackIndex((prev) => Math.max(0, prev - 1));
            }
          }

          return newPlayIndices;
        });

        return newPlaylist;
      });
    } catch (error) {
      console.error("刪除曲目失敗:", error);
      alert("刪除曲目失敗，請稍後再試");
    }
  };

  // 手動釋放 Object URLs
  const releaseMemory = () => {
    playlist.forEach((track) => {
      if (track.objectUrl) {
        URL.revokeObjectURL(track.objectUrl);
      }
    });

    // 清除 objectUrl 欄位，避免再次使用已釋放的 URL
    const updatedPlaylist = playlist.map((track) => ({
      ...track,
      objectUrl: undefined,
    }));

    setPlaylist(updatedPlaylist);
  };

  // 播放音頻
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

  // 暫停音頻
  const handlePause = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  // 調整播放進度
  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // 更新播放進度和曲目總時長
  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (audio) {
      setCurrentTime(audio.currentTime);
      setDuration(audio.duration || 0);
    }
  };

  // 快進 5 秒
  const seekForward = () => {
    if (audioRef.current) {
      handleSeek(audioRef.current.currentTime + 5);
    }
  };

  // 快退 5 秒
  const seekBackward = () => {
    if (audioRef.current) {
      handleSeek(audioRef.current.currentTime - 5);
    }
  };

  // 生成隨機播放索引列表，確保當前曲目始終位於第一位
  const generateShufflePlaylist = (
    currentIndex: number,
    visibleIndices: number[]
  ) => {
    if (visibleIndices.length === 0) return [];

    const currentInVisible = visibleIndices.includes(currentIndex);
    const shuffled = visibleIndices.filter((i) => i !== currentIndex);

    // Fisher-Yates 洗牌
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return currentInVisible ? [currentIndex, ...shuffled] : shuffled;
  };

  // 獲取當前曲目縮圖 URL
  const thumbnailUrl = currentTrack
    ? `https://img.youtube.com/vi/${currentTrack.youtube_id}/hqdefault.jpg`
    : "";

  // 當播放模式變化時，處理播放列表順序
  useEffect(() => {
    if (playlist.length === 0 || currentTrackIndex === -1) {
      return;
    }

    // 過濾出可顯示的項目及其原始索引
    const visibleIndices = playlist
      .map((item, index) => ({
        index,
        isVisible: item.isVisibleInExternalPlaylist,
      }))
      .filter((item) => item.isVisible)
      .map((item) => item.index); // 最後保留的是 index 組成的陣列

    switch (playMode) {
      case "shuffle":
        setPlayIndices(
          generateShufflePlaylist(currentTrackIndex, visibleIndices)
        );
        break;

      case "sequential":
        setPlayIndices(visibleIndices);
        break;

      case "repeat":
        setPlayIndices(Array(visibleIndices.length).fill(currentTrackIndex));
        break;

      default:
        // setPlayIndices([]);
        break;
    }
  }, [playMode, playlist]);

  // 監聽用戶首次交互（點擊或按鍵），解決瀏覽器自動播放限制
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

  let ignore = false;
  useEffect(() => {
    return () => {
      ignore = true;
    };
  }, []);

  // 初始化播放列表，從後端獲取用戶的音樂數據
  useEffect(() => {
    const fetchPlaylist = async () => {
      if (!ignore) return;

      if (!userId) {
        // setPlaylist([]);
        // setPlayIndices([]);
        return;
      }

      try {
        const data = await getUserYtMusicTracks(userId);
        const patchedData = data.map((item) => ({
          ...item,
          isVisibleInExternalPlaylist: true,
        }));

        setPlaylist(patchedData);
        if (patchedData.length > 0) {
          setPlayIndices(
            Array.from({ length: patchedData.length }, (_, i) => i)
          );
          setCurrentTrackIndex(0);

          // ✅ 緩存第一首曲目前，標記為 loading
          const firstTrack = patchedData[0];
          setLoadingTracks((prev) => {
            const newSet = new Set(prev);
            newSet.add(firstTrack.key_id);
            return newSet;
          });

          try {
            const cachedTrack = await cacheTrack(firstTrack);
            setPlaylist((prev) => {
              if (prev[0]?.objectUrl === cachedTrack.objectUrl) return prev;
              const newPlaylist = [...prev];
              newPlaylist[0] = {
                ...newPlaylist[0],
                ...cachedTrack,
              };
              return newPlaylist;
            });
          } catch (e) {
            console.error("第一首曲目快取失敗:", e);
          } finally {
            // ✅ 不論成功與否都移除 loading 標記
            setLoadingTracks((prev) => {
              const newSet = new Set(prev);
              newSet.delete(firstTrack.key_id);
              return newSet;
            });
          }
        }
        // else {
        //   setPlayIndices([]);
        //   setCurrentTrackIndex(0);
        // }
      } catch (error) {
        console.error("獲取播放列表失敗:", error);
        // setPlaylist([]);
        //setPlayIndices([]);
      }
    };

    if (ignore) {
      fetchPlaylist();
    }
  }, [ignore, userId]);

  // 緩存音頻檔案，將遠端 MP3 轉為本地 Blob URL
  const cacheTrack = async (track: YtMusicTrack): Promise<YtMusicTrack> => {
    if (!track || track.objectUrl) {
      return track; // 已緩存或無效曲目，直接返回
    }

    // console.log(`[${new Date().toISOString()}] 開始緩存音頻: ${track.title}`);

    try {
      // console.log(`[${new Date().toISOString()}] 發起音頻請求: ${track.title}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 設置 10 秒請求超時

      try {
        const audioRes = await fetch(track.mp3_url, {
          method: "GET",
          cache: "no-store",
          credentials: "omit",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!audioRes.ok) {
          throw new Error(
            `音頻請求失敗: ${audioRes.status} ${audioRes.statusText}`
          );
        }

        const contentType = audioRes.headers.get("content-type") || "";
        if (!contentType.startsWith("audio/")) {
          throw new Error(`無效的音頻內容類型: ${contentType}`);
        }

        const blob = await audioRes.blob();

        if (!blob || blob.size === 0) {
          throw new Error("獲取到的音頻數據為空");
        }

        const objectUrl = URL.createObjectURL(blob);
        return { ...track, objectUrl };
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] 音頻緩存失敗: ${track.title}`,
        error
      );
      return track; // 緩存失敗，返回原始曲目
    }
  };

  const getNextTrackIndex = useCallback(() => {
    const nextIndex = currentTrackIndex + 1;

    // 如果超出範圍，回到開頭
    if (nextIndex >= playIndices.length) {
      return 0;
    }

    return nextIndex;
  }, [playIndices.length, currentTrackIndex]);

  const getPrevTrackIndex = useCallback(() => {
    const prevIndex = currentTrackIndex - 1;

    // 如果已經是第一首，回到最後一首
    if (prevIndex < 0) {
      return playIndices.length - 1;
    }

    return prevIndex;
  }, [playIndices.length, currentTrackIndex]);

  const playNext = useCallback(() => {
    const nextIndex = getNextTrackIndex();
    setCurrentTrackIndex(nextIndex);
  }, [getNextTrackIndex]);

  const playPrev = useCallback(() => {
    const prevIndex = getPrevTrackIndex();
    setCurrentTrackIndex(prevIndex);
  }, [getPrevTrackIndex]);

  // // 預載下一首歌
  // const preloadNextTrack = async (currentIndex: number) => {
  //   if (!playlist.length || currentIndex === -1) return;

  //   const currentPlayIndex = playIndices.indexOf(currentIndex);
  //   if (currentPlayIndex === -1) return;

  //   const nextPlayIndex = (currentPlayIndex + 1) % playIndices.length;
  //   const nextTrackIndex = playIndices[nextPlayIndex];
  //   const nextTrack = playlist[nextTrackIndex];

  //   // 檢查曲目是否已經加載或正在加載
  //   if (
  //     !nextTrack ||
  //     nextTrack.objectUrl ||
  //     loadingTracks.has(nextTrack.key_id)
  //   ) {
  //     return;
  //   }

  //   try {
  //     // 標記為正在加載
  //     setLoadingTracks((prev) => {
  //       const newSet = new Set(prev);
  //       newSet.add(nextTrack.key_id);
  //       return newSet;
  //     });

  //     const cachedTrack = await cacheTrack(nextTrack);

  //     // 更新播放列表
  //     if (cachedTrack !== nextTrack) {
  //       setPlaylist((prev) => {
  //         if (prev[nextTrackIndex]?.objectUrl === cachedTrack.objectUrl)
  //           return prev;
  //         const newPlaylist = [...prev];
  //         newPlaylist[nextTrackIndex] = cachedTrack;
  //         return newPlaylist;
  //       });
  //     }
  //   } catch (error) {
  //     console.error("預緩存下一首歌曲失敗:", error);
  //   } finally {
  //     // 無論成功與否，都從加載中移除
  //     setLoadingTracks((prev) => {
  //       const newSet = new Set(prev);
  //       newSet.delete(nextTrack.key_id);
  //       return newSet;
  //     });
  //   }
  // };

  // currentTrackIndex 改變 => 播放中的曲目有變
  // playIndices 改變 => 播放模式有變
  // playlist.length 改變 => 原始播放列表新增/刪除
  // useEffect(() => {
  //   if (playIndices.length > 0 && playlist.length > 0) {
  //     preloadNextTrack(currentTrackIndex);
  //   }
  // }, [currentTrackIndex, playIndices, playlist]);

  // 當曲目切換時，自動載入並播放新曲目（僅在用戶已交互後）
  useEffect(() => {
    if (
      !audioRef.current || // 沒有音訊元素
      currentTrackIndex < 0 || // 沒有播放中的曲目
      currentTrackIndex >= playlist.length // 播放中的曲目超出範圍
    )
      return;

    const currentTrack = playlist[currentTrackIndex];
    if (!currentTrack) return;

    const audio = audioRef.current;

    if (!currentTrack.objectUrl) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load(); // 清空舊音訊

      const loadCurrentTrack = async () => {
        if (loadingTracks.has(currentTrack.key_id)) return; // 正在加載中

        try {
          // 標記正在加載
          setLoadingTracks((prev) => {
            const newSet = new Set(prev);
            newSet.add(currentTrack.key_id);
            return newSet;
          });

          const cachedTrack = await cacheTrack(currentTrack);

          // Update the playlist with the cached track's objectUrl if available
          if (cachedTrack?.objectUrl) {
            setPlaylist((prev) => {
              const newList = [...prev];
              if (newList[currentTrackIndex]) {
                newList[currentTrackIndex] = {
                  ...newList[currentTrackIndex],
                  objectUrl: cachedTrack.objectUrl,
                };
              }
              return newList;
            });
          }
        } catch (error) {
          console.error("當前曲目載入失敗:", error);
        } finally {
          // 移除 loading 狀態
          setLoadingTracks((prev) => {
            const newSet = new Set(prev);
            newSet.delete(currentTrack.key_id);
            return newSet;
          });
        }
      };

      loadCurrentTrack();
      return;
    }

    // ✅ 已加載完成，設定音訊來源
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

  useEffect(() => {
    if (
      playlist.length > 0 &&
      playIndices.length > 0 &&
      currentTrackIndex < playIndices.length
    ) {
      const track = playlist[playIndices[currentTrackIndex]];
      setCurrentTrack(track || null);
    } else {
      setCurrentTrack(null);
    }
  }, [currentTrackIndex, playlist]);

  // 渲染播放器 UI
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
                  {/* 播放模式切換按鈕 */}
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

                  {/* 快退 5 秒按鈕 */}
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

                  {/* 上一首按鈕 */}
                  <button
                    className="control-button"
                    onClick={playPrev}
                    title="上一首"
                  >
                    <div className="d-flex align-items-center">
                      <ChevronBarLeft className="control-icon" />
                    </div>
                  </button>

                  {/* 下一首按鈕 */}
                  <button
                    className="control-button"
                    onClick={playNext}
                    title="下一首"
                  >
                    <div className="d-flex align-items-center">
                      <ChevronBarRight className="control-icon" />
                    </div>
                  </button>

                  {/* 快進 5 秒按鈕 */}
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
                {/* 播放/暫停按鈕 */}
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
                  disabled={
                    currentTrack && loadingTracks.has(currentTrack.key_id)
                  } // 🔐 防止點擊
                >
                  {currentTrack && loadingTracks.has(currentTrack.key_id) ? (
                    <Spinner
                      animation="border"
                      variant="secondary"
                      style={{ width: 36, height: 36 }}
                    />
                  ) : isPlaying ? (
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

      {/* 釋放記憶體按鈕 */}
      <button
        style={{
          position: "fixed",
          bottom: 32,
          left: 32, // 原本是 right: 32，改成 left
          zIndex: 999,
          borderRadius: "50%",
          width: 60,
          height: 60,
          fontSize: 28,
          background: "#0066cc",
          color: "#fff",
          border: "none",
          boxShadow: "0 2px 8px rgba(0,0,0,.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
        onClick={releaseMemory}
        title="釋放音檔記憶體"
      >
        🧹
      </button>

      {/* 管理播放列表按鈕 */}
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

      {/* 播放列表管理模態框 */}
      <YtMusicPlaylistModal
        showModal={showModal}
        onClose={() => setShowModal(false)}
        playlist={playlist}
        currentTrackId={currentTrack?.key_id}
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
            const newTracks = await getUserYtMusicTracks(userId);

            setPlaylist((prevPlaylist) => {
              // 建立現有曲目的映射表，保留額外欄位
              const existingTracks = new Map(
                prevPlaylist.map((track) => [track.key_id, track])
              );

              // 合併新舊數據
              return newTracks.map((track) => {
                const existingTrack = existingTracks.get(track.key_id);
                return existingTrack
                  ? { ...track, ...existingTrack } // 保留現有曲目的所有欄位
                  : track; // 新曲目直接使用
              });
            });
          } catch (error) {
            console.error("更新播放列表失敗:", error);
          }
        }}
        setPlaylist={setPlaylist}
      />
      <div className="text-start">{printValue({ playIndices })}</div>
      <div className="text-start">{printValue({ currentTrackIndex })}</div>
      <div className="text-start">{printValue({ currentTrack })}</div>
      <div className="text-start">{printValue({ playlist })}</div>
    </main>
  );
}
