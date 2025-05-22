"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAllYtMusicTracks } from "./api/ytMusicApi";
import { YtMusicTrack } from "./types";
import PlaylistModal from "./components/playlistModal";
import {
  ChevronBarLeft,
  ChevronBarRight,
  MusicNoteBeamed,
} from "react-bootstrap-icons";

// 初始化快取
const CACHE_NAME = "audio-cache";
const initCache = async () => {
  if ("caches" in window) {
    try {
      return await caches.open(CACHE_NAME);
    } catch (error) {
      console.warn("無法初始化快取:", error);
      return null;
    }
  }
  return null;
};

// 儲存快取音訊
const cacheAudio = async (url: string, audioBlob: Blob) => {
  try {
    const cache = await initCache();
    if (cache) {
      const response = new Response(audioBlob, {
        headers: { "Content-Type": "audio/mpeg" },
      });
      await cache.put(url, response);
    }
  } catch (error) {
    console.error("快取音訊失敗:", error);
  }
};

// 取得快取音訊
const getCachedAudio = async (url: string): Promise<string | null> => {
  try {
    const cache = await initCache();
    if (cache) {
      const response = await cache.match(url);
      if (response) {
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      }
    }
    return null;
  } catch (error) {
    console.error("讀取快取失敗:", error);
    return null;
  }
};

export default function YtMusicPage() {
  const [playlist, setPlaylist] = useState<YtMusicTrack[]>([]);
  const [currentTrackId, setCurrentTrackId] = useState<string | undefined>(
    undefined
  );
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const nextTrackRef = useRef<string | null>(null);
  const preloadedAudioRef = useRef<HTMLAudioElement | null>(null);

  // 載入全部歌曲
  useEffect(() => {
    const loadPlaylist = async () => {
      try {
        const tracks = await getAllYtMusicTracks();
        setPlaylist(tracks);

        // 預載入第一首歌曲
        if (tracks.length > 0) {
          preloadNextTrack(tracks[0].id, tracks);
        }
      } catch (error) {
        console.error("載入播放清單失敗:", error);
      }
    };

    loadPlaylist();
  }, []);

  // 預載入下一首歌曲
  const preloadNextTrack = useCallback(
    async (currentId: string, tracks = playlist) => {
      if (!tracks?.length) return;

      const currentIndex = tracks.findIndex((t) => t.id === currentId);
      if (currentIndex === -1 || currentIndex >= tracks.length - 1) return;

      const nextTrack = tracks[currentIndex + 1];
      if (!nextTrack?.mp3_url) return;

      try {
        // 清理上一個預載入的音訊
        if (preloadedAudioRef.current) {
          URL.revokeObjectURL(preloadedAudioRef.current.src);
          preloadedAudioRef.current = null;
        }

        nextTrackRef.current = nextTrack.id;
        const directUrl = getDirectLink(nextTrack.mp3_url);

        // 檢查快取
        const cachedUrl = await getCachedAudio(directUrl);
        if (cachedUrl) {
          preloadedAudioRef.current = new Audio(cachedUrl);
          preloadedAudioRef.current.load();
          return;
        }

        // 下載並快取
        const response = await fetch(directUrl);
        if (!response.ok) return;

        const audioBlob = await response.blob();
        await cacheAudio(directUrl, audioBlob);

        // 預載入
        const audioUrl = URL.createObjectURL(audioBlob);
        preloadedAudioRef.current = new Audio(audioUrl);
        preloadedAudioRef.current.load();
      } catch (error) {
        console.error("預載入下一首失敗:", error);
      }
    },
    [playlist]
  );

  const playNextTrack = useCallback(async () => {
    if (playlist.length === 0) return;

    const currentIndex = playlist.findIndex(
      (track) => track.id === currentTrackId
    );
    const nextIndex = (currentIndex + 1) % playlist.length;
    const nextTrack = playlist[nextIndex];

    setCurrentTrackId(nextTrack.id);
    setIsLoading(true);

    // 預載入下下首
    if (playlist.length > nextIndex + 1) {
      await preloadNextTrack(nextTrack.id);
    }
  }, [playlist, currentTrackId, preloadNextTrack]);

  const playPreviousTrack = useCallback(() => {
    if (playlist.length === 0) return;

    const currentIndex = playlist.findIndex(
      (track) => track.id === currentTrackId
    );
    const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    const prevTrack = playlist[prevIndex];

    setCurrentTrackId(prevTrack.id);
    setIsLoading(true);

    // 預載入上一首的前一首（如果存在）
    if (prevIndex > 0) {
      preloadNextTrack(playlist[prevIndex - 1].id);
    }
  }, [playlist, currentTrackId, preloadNextTrack]);

  // 添加組件卸載時的清理
  useEffect(() => {
    return () => {
      if (preloadedAudioRef.current) {
        URL.revokeObjectURL(preloadedAudioRef.current.src);
        preloadedAudioRef.current = null;
      }
    };
  }, []);

  // 取得目前播放曲目
  const currentTrack = playlist.find((t) => t.id === currentTrackId);

  // 處理音訊連結
  const getDirectLink = (url: string) => {
    if (!url) return "";

    console.log("原始連結:", url);

    // 提取 Google Drive 檔案 ID 的輔助函數
    const extractFileId = (url: string): string | null => {
      // 處理各種 Google Drive 連結格式
      const patterns = [
        // 格式1: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
        /drive\.google\.com\/file\/d\/([\w-]+)/,
        // 格式2: https://drive.google.com/open?id=FILE_ID
        /[&?]id=([\w-]+)/,
        // 格式3: https://drive.google.com/uc?export=download&id=FILE_ID
        /export=download[^&]*&id=([\w-]+)/,
        // 格式4: 直接是檔案 ID
        /^[\w-]{20,}$/,
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
          return match[1];
        } else if (match && pattern.test(url)) {
          // 如果是直接匹配的檔案 ID
          return url;
        }
      }
      return null;
    };

    // 提取檔案 ID
    const fileId = extractFileId(url);

    if (fileId) {
      // 使用 Google Drive API v3 獲取檔案內容
      const directLink = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=AIzaSyCdw0dmTNVrbX5gffUbVBk9rChKS6xWqUA`;
      console.log("轉換後的 Google Drive API 連結:", directLink);
      return directLink;
    }

    console.log("使用原始連結 (非 Google Drive 連結):", url);
    return url;
  };

  // 播放控制
  const handlePlay = async (id: string) => {
    const track = playlist.find((t) => t.id === id);
    if (!track?.mp3_url) {
      console.error("找不到曲目或曲目沒有 mp3_url");
      return;
    }

    const audioElement = audioRef.current;
    if (!audioElement) {
      console.error("audio 元素不存在");
      return;
    }

    // 如果已經在播放同一首歌曲，則不處理
    if (currentTrackId === id && !audioElement.paused) {
      console.log("同一首歌曲已在播放中");
      return;
    }

    setCurrentTrackId(id);
    setIsLoading(true);
    console.log("開始處理播放請求，曲目ID:", id);

    // 檢查是否已經預載入
    if (nextTrackRef.current === id && preloadedAudioRef.current) {
      console.log("使用預載入的音訊");
      try {
        const preloadedAudio = preloadedAudioRef.current;
        console.log("預載入音訊來源:", preloadedAudio.src);
        audioElement.src = preloadedAudio.src;
        console.log("嘗試播放預載入音訊...");
        await audioElement.play();
        console.log("預載入音訊播放成功");

        // 預載入下一首
        preloadNextTrack(id);
        return;
      } catch (error) {
        console.warn("使用預載入音訊失敗，回退到正常流程:", error);
      } finally {
        setIsLoading(false);
      }
    }

    const directUrl = getDirectLink(track.mp3_url);
    console.log("開始處理音訊播放，來源URL:", directUrl);

    try {
      // 先檢查快取中是否有這個音訊
      const cachedAudioUrl = await getCachedAudio(directUrl);
      console.log("快取檢查結果:", cachedAudioUrl ? "找到快取" : "無快取");

      if (cachedAudioUrl) {
        // 使用快取的音訊
        console.log("使用快取音訊:", cachedAudioUrl);
        audioElement.src = cachedAudioUrl;
      } else {
        // 離線且沒有快取，直接使用原始連結
        console.log("離線模式，嘗試直接播放原始連結");
        audioElement.src = directUrl;
      }

      // 添加錯誤事件監聽器
      const handleError = () => {
        console.error("音訊播放錯誤:", audioElement.error);
        console.error("當前來源:", audioElement.src);
      };

      audioElement.addEventListener("error", handleError);

      console.log("載入音訊...");
      await audioElement.load();
      console.log("開始播放...");
      await audioElement.play();

      // 播放成功後移除事件監聽器
      audioElement.removeEventListener("error", handleError);
      console.log("播放成功");

      // 預載入下一首
      preloadNextTrack(id);
    } catch (error) {
      console.error("播放過程中出錯:", error);
      // 如果快取出錯，直接使用原始連結播放
      console.log("嘗試直接播放原始連結...");
      audioElement.src = directUrl;
      audioElement.load();
      audioElement.play().catch((e) => {
        console.error("直接播放失敗:", e);
        console.error("錯誤詳細資訊:", e.message);
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 確保音訊元素有正確的 src
  useEffect(() => {
    if (audioRef.current && currentTrack?.mp3_url) {
      const directUrl = getDirectLink(currentTrack.mp3_url);

      // 檢查 URL 是否有效
      if (!directUrl) {
        console.error("無效的音訊 URL");
        return;
      }

      console.log("設置音訊來源:", directUrl);

      // 創建新的 Audio 對象來測試連結
      const testAudio = new Audio();

      // 設置事件處理程序
      testAudio.oncanplay = () => {
        console.log("音訊可以播放");
        // 如果測試成功，設置實際的音訊元素
        if (audioRef.current) {
          audioRef.current.src = directUrl;
          audioRef.current.load();
          audioRef.current.controls = true;
          setIsLoading(false);
        }
      };

      testAudio.onerror = (error) => {
        console.error("音訊載入錯誤:", {
          error,
          url: directUrl,
          networkState: testAudio.networkState,
          errorCode: testAudio.error?.code,
        });

        // 如果直接播放失敗，嘗試使用代理
        const proxyUrl = `https://cors-anywhere.herokuapp.com/${directUrl}`;
        console.log("嘗試使用代理:", proxyUrl);

        if (audioRef.current) {
          audioRef.current.src = proxyUrl;
          audioRef.current.load();
          audioRef.current.controls = true;
        }
      };

      // 嘗試載入測試音訊
      testAudio.src = directUrl;
      testAudio.load();

      // 設置超時
      const timeout = setTimeout(() => {
        console.warn("音訊載入超時");
        if (audioRef.current) {
          audioRef.current.controls = true;
        }
      }, 10000); // 10秒超時

      return () => {
        clearTimeout(timeout);
        testAudio.pause();
        testAudio.src = "";
      };
    }
  }, [currentTrack]);

  // 處理音訊錯誤
  const handleAudioError = (
    e: React.SyntheticEvent<HTMLAudioElement, Event>
  ) => {
    const audio = e.currentTarget;
    console.error("音訊載入錯誤:", {
      error: audio.error,
      networkState: audio.networkState,
      readyState: audio.readyState,
      src: audio.src,
    });

    // 顯示錯誤訊息給用戶
    alert("無法載入音訊，請檢查網路連線或音訊連結是否有效");
  };

  return (
    <div className="container py-4">
      {/* 載入指示器 */}
      {isLoading && (
        <div className="progress mb-3" style={{ height: "4px" }}>
          <div
            className="progress-bar progress-bar-striped progress-bar-animated"
            style={{ width: "100%" }}
          />
        </div>
      )}

      {/* 播放器區 */}
      <div className="mb-4">
        {currentTrack ? (
          <div>
            <div className="mb-2">
              <div className="d-flex align-items-center">
                <strong className="me-2">{currentTrack.title}</strong>
                {isLoading && (
                  <div
                    className="spinner-border spinner-border-sm text-primary"
                    role="status"
                  >
                    <span className="visually-hidden">載入中...</span>
                  </div>
                )}
              </div>
              <div className="text-muted small">{currentTrack.artist}</div>
            </div>
            <div className="audio-player">
              <audio
                ref={audioRef}
                controls
                preload="metadata"
                style={{ width: "100%" }}
                onError={handleAudioError}
                onPlay={() => setIsLoading(false)}
                onPause={() => setIsLoading(false)}
                onWaiting={() => setIsLoading(true)}
                onEnded={playNextTrack}
              >
                您的瀏覽器不支援音訊元素。
              </audio>
              {isLoading && (
                <div className="text-muted small mt-2">
                  <i className="fas fa-spinner fa-spin me-2"></i>
                  載入中...
                </div>
              )}
            </div>
            <div className="player-controls d-flex justify-content-center align-items-center gap-3 my-2">
              <button
                className="chevron-btn chevron-left"
                onClick={playPreviousTrack}
                disabled={playlist.length <= 1}
                title="上一首"
              >
                <ChevronBarLeft size={28} />
              </button>
              <button
                className="chevron-btn chevron-right"
                onClick={playNextTrack}
                disabled={playlist.length <= 1}
                title="下一首"
              >
                <ChevronBarRight size={28} />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-muted">請選擇歌曲開始播放</div>
        )}
      </div>

      <button
        style={{
          position: "fixed",
          bottom: 32,
          right: 32,
          zIndex: 999,
          borderRadius: "50%",
          width: 60,
          height: 60,
          fontSize: 32, // 稍微大一點
          background: "#ff5500",
          color: "#fff",
          border: "none",
          boxShadow: "0 2px 8px rgba(0,0,0,.2)",
          display: "flex", // 新增
          alignItems: "center", // 新增
          justifyContent: "center", // 新增
          padding: 0, // 新增，避免預設 padding 影響
        }}
        onClick={() => setShowModal(true)}
        title="管理播放清單與查詢"
      >
        <MusicNoteBeamed size={32} />
      </button>
      {/* Modal 彈窗 */}
      <PlaylistModal
        show={showModal}
        onClose={() => setShowModal(false)}
        playlist={playlist}
        currentTrackId={currentTrackId}
        onPlay={handlePlay}
        onDelete={() => {}}
        onAddTrack={async () => {
          const data = await getAllYtMusicTracks();
          setPlaylist(
            data.map((item) => ({
              id: item.id,
              title: item.title,
              artist: item.artist,
              youtube_url: item.youtube_url,
              youtube_id: item.youtube_id,
              mp3_url: item.mp3_url,
              status: item.status,
              note: item.note,
            }))
          );
        }}
      />
    </div>
  );
}
