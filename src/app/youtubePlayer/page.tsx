/* app/youtube-player/page.tsx — Tier 4 進階互動 & 社群 */
"use client";

import { createContext, useCallback, useEffect, useRef, useState } from "react";
import YouTube, { YouTubeProps } from "react-youtube";
import "bootstrap/dist/css/bootstrap.min.css";
import { QueueCtx, Track, YoutubeSearchResult } from "./types";
import { getAllTracks, createTrack, deleteTrack } from "./api/TrackApi";
import { YOUTUBE_API_KEY } from "../../config/youtube";
import EditPlaylistModal from "./components/EditPlaylistModal";
import {
  ChevronLeft,
  ChevronRight,
  ChevronBarLeft,
  ChevronBarRight,
  PlayFill,
  PauseFill,
  ArrowRepeat,
  Shuffle,
  VolumeUpFill,
  VolumeDownFill,
} from "react-bootstrap-icons";

// 讓播放器控制列的圓形按鈕 icon 完全置中
// 建議放在全域 CSS，但這裡用 style jsx 方便快速覆蓋
// 若你用 SCSS/CSS module 也可移植
const BtnCircleStyle = () => (
  <style jsx global>{`
    .btn-circle {
      display: flex !important;
      align-items: center;
      justify-content: center;
      padding: 0 8px !important;
      height: 44px;
      min-width: 0;
      width: auto;
      border-radius: 50% !important;
      font-size: 1.35rem;
      box-sizing: border-box;
      transition: background 0.2s;
    }
    .btn-circle svg {
      display: block;
      margin: 0;
      font-size: 1.35rem;
    }
  `}</style>
);

const QueueContext = createContext<QueueCtx | null>(null);

/****************** 歌詞 API ******************/
async function fetchLyrics(artist: string, title: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
    );
    if (!res.ok) return "";
    const data = await res.json();
    return data.lyrics || "";
  } catch {
    return "";
  }
}

/****************** 主元件 ******************/
export default function YouTubePlayerPage() {
  const playerRef = useRef<YouTube>(null);
  const [ready, setReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [volume, setVolume] = useState(50);
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("載入中…");
  // 播放狀態
  const [isPlaying, setIsPlaying] = useState(false);
  // 快進/快退秒數
  const [seekStep, setSeekStep] = useState(5);

  // 清單：初始為空，進頁面時自動抓取
  const [list, setList] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);

  // 取得雲端清單
  const refreshList = useCallback(async () => {
    try {
      const tracks = await getAllTracks();
      setList(tracks);
    } catch (e) {
      console.error("取得清單失敗", e);
    }
  }, []);

  // 首次載入自動抓取
  useEffect(() => {
    refreshList();
  }, [refreshList]);

  /****************** Scrobble ***************/
  const scrobble = (event: "play" | "skip" | "complete", vid: string) => {
    fetch("/api/scrobble", {
      method: "POST",
      body: JSON.stringify({ event, vid, ts: Date.now() }),
    }).catch(() => {});
  };

  /****************** IFrame 事件 ***************/
  const onReady: YouTubeProps["onReady"] = async (e) => {
    const p = e.target;
    setVolume(await p.getVolume());
    const data = await p.getVideoData();
    setTitle(data.title);
    setReady(true);
    setDuration(await p.getDuration());
  };
  const onStateChange: YouTubeProps["onStateChange"] = (e) => {
    if (list.length === 0 || !list[index]) return;
    if (e.data === 0) {
      scrobble("complete", list[index].id);
      next();
    }
    if (e.data === 1) {
      scrobble("play", list[index].id);
      setIsPlaying(true);
    }
    if (e.data === 2) {
      setIsPlaying(false);
    }
  };

  /****************** 控制 ***************/
  const playById = async (i: number) => {
    if (list.length === 0 || !list[i]) return;
    setIndex(i);
    setLyrics("載入中…");
    playerRef.current?.internalPlayer.loadVideoById(list[i].id);
    const track = list[i];
    if (track && track.artist && track.title) {
      const lyrics = await fetchLyrics(track.artist, track.title);
      setLyrics(lyrics || "（查無歌詞）");
    } else {
      setLyrics("（查無歌詞）");
    }
  };
  const next = useCallback(() => {
    setIndex((i) => {
      if (list.length === 0) return i;
      const ni = shuffle
        ? Math.floor(Math.random() * list.length)
        : i + 1 < list.length
          ? i + 1
          : repeat
            ? 0
            : i;
      if (ni !== i && list[i]) {
        scrobble("skip", list[i].id);
        playById(ni);
      }
      return ni;
    });
  }, [list, shuffle, repeat]);
  const prev = () => {
    if (list.length === 0) return;
    const ni = index === 0 ? list.length - 1 : index - 1;
    playById(ni);
  };

  const toggle = async () => {
    const p = playerRef.current?.internalPlayer;
    if (!p) return;
    const state = await p.getPlayerState();
    if (state === 1) {
      p.pauseVideo();
    } else {
      p.playVideo();
    }
  };

  /****************** 進度更新 ***************/
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(async () => {
      const p = playerRef.current?.internalPlayer;
      if (!p) return;
      setCurrent(await p.getCurrentTime());
      setDuration(await p.getDuration());
    }, 500);
    return () => clearInterval(id);
  }, [ready]);

  useEffect(() => {
    (async () => {
      setLyrics("載入中…");
      const track = list[index];
      if (track && track.artist && track.title) {
        const lyrics = await fetchLyrics(track.artist, track.title);
        setLyrics(lyrics || "（查無歌詞）");
      } else {
        setLyrics("（查無歌詞）");
      }
    })();
  }, [index, list]);

  const format = (sec: number) =>
    `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

  const queueValue: QueueCtx = {
    list,
    index,
    shuffle,
    repeat,
    next,
    prev,
    setShuffle,
    setRepeat,
    setIndex: playById,
  };

  // 編輯清單 Modal 狀態
  const [showModal, setShowModal] = useState(false);
  const [searchInput, setSearchInput] = useState("");

  const [searchResults, setSearchResults] = useState<YoutubeSearchResult[]>([]);

  const [isSearching, setIsSearching] = useState(false);

  // 搜尋 YouTube
  const searchYoutube = useCallback(async (query: string) => {
    if (!query) return;
    setIsSearching(true);
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`
      );
      const data = await res.json();
      setSearchResults(data.items || []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Modal 查詢按鈕觸發查詢
  const handleSearch = () => {
    if (searchInput) searchYoutube(searchInput);
    else setSearchResults([]);
  };

  // Modal 新增歌曲（API 寫入）
  const handleAddTrack = async (video: YoutubeSearchResult) => {
    const newTrack: Track = {
      id: video.id.videoId,
      artist: video.snippet.channelTitle,
      title: video.snippet.title,
    };
    try {
      await createTrack(newTrack);
      await refreshList();
    } catch {
      alert("加入失敗");
    }
  };

  // 刪除歌曲（API 刪除）
  const handleDeleteTrack = async (trackId: string) => {
    try {
      await deleteTrack(trackId);
      await refreshList();
    } catch {
      alert("刪除失敗");
    }
  };

  /****************** 主 UI ***************/
  return (
    <QueueContext.Provider value={queueValue}>
      <BtnCircleStyle />
      {/* 編輯清單 Modal */}
      <EditPlaylistModal
        show={showModal}
        onClose={() => setShowModal(false)}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSearch={handleSearch}
        isSearching={isSearching}
        searchResults={searchResults}
        playlist={list}
        onAddTrack={handleAddTrack}
        onDeleteTrack={handleDeleteTrack}
        selectedIndex={index}
        onSelectTrack={setIndex}
      />
      <main className="container py-4">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h1 className="h5 fw-bold mb-0">YouTube Player</h1>
          <button
            className="btn btn-sm btn-outline-primary ms-2"
            onClick={() => setShowModal(true)}
          >
            編輯清單
          </button>
        </div>

        {/* YouTube IFrame */}
        {list.length > 0 && list[index] && (
          <YouTube
            ref={playerRef}
            videoId={list[index].id}
            opts={{ height: "0", width: "0", playerVars: { controls: 0 } }}
            onReady={onReady}
            onStateChange={onStateChange}
          />
        )}

        {/* Cover & Share */}
        <div className="d-flex flex-column align-items-center mb-2">
          {list.length > 0 && list[index] && (
            <img
              src={`https://i.ytimg.com/vi/${list[index].id}/hqdefault.jpg`}
              className="rounded-4 shadow w-75"
              alt={title}
            />
          )}
          <p className="fw-medium mt-2 text-center px-2">
            {title || "載入中…"}
          </p>
        </div>

        {/* 進度 */}
        <div className="d-flex align-items-center gap-2 mb-2">
          <span className="small" style={{ width: 40 }}>
            {format(current)}
          </span>
          <input
            type="range"
            className="form-range flex-grow-1"
            min={0}
            max={Number.isFinite(duration) && duration > 0 ? duration : 1}
            value={Number.isFinite(current) ? current : 0}
            onChange={(e) =>
              playerRef.current?.internalPlayer.seekTo(
                Number(e.target.value),
                true
              )
            }
          />
          <span className="small" style={{ width: 40 }}>
            {format(duration)}
          </span>
        </div>

        {/* 歌詞 */}
        <div
          className="border rounded p-3 mb-2"
          style={{ maxHeight: 150, overflowY: "auto", whiteSpace: "pre-wrap" }}
        >
          {lyrics}
        </div>

        {/* Controls（循環、快退、播放/暫停、快進、循環） */}
        <div className="d-flex justify-content-center align-items-center gap-2 mb-3">
          {/* 循環按鈕（最左） */}
          <button
            className={`btn btn-circle  ${repeat ? "btn-warning" : "btn-outline-warning"}`}
            title="循環播放"
            style={{ width: 40, height: 40, borderRadius: "50%" }}
            onClick={() => setRepeat(!repeat)}
          >
            <ArrowRepeat />
          </button>
          {/* 向後X秒 */}
          <button
            className="btn btn-circle btn-outline-secondary px-2"
            style={{
              minWidth: 40,
              height: 44,
              borderRadius: "50%",
              padding: "0 6px",
              fontSize: "1rem",
            }}
            onClick={() =>
              playerRef.current?.internalPlayer.seekTo(
                Math.max(0, current - seekStep),
                true
              )
            }
            title={`快退${seekStep}秒`}
          >
            <div
              className="d-flex align-items-center justify-content-center gap-1"
              style={{ width: "100%" }}
            >
              <ChevronLeft style={{ fontSize: "1.2em", flexShrink: 0 }} />
              <span
                className="fw-bold text-muted"
                style={{
                  fontSize: "1em",
                  minWidth: "1.5em",
                  textAlign: "center",
                }}
              >
                {seekStep}s
              </span>
            </div>
          </button>
          {/* 上一首 */}
          <button
            className="btn btn-circle btn-outline-primary"
            style={{ width: 40, height: 40, borderRadius: "50%" }}
            onClick={prev}
            title="上一首"
          >
            <ChevronBarLeft />
          </button>
          {/* 播放/暫停 */}
          <button
            className="btn btn-circle btn-primary"
            style={{
              width: 50,
              height: 50,
              borderRadius: "50%",
              fontSize: "1.5rem",
            }}
            onClick={toggle}
            title={isPlaying ? "暫停" : "播放"}
          >
            {isPlaying ? <PauseFill /> : <PlayFill />}
          </button>
          {/* 下一首 */}
          <button
            className="btn btn-circle btn-outline-primary"
            style={{ width: 40, height: 40, borderRadius: "50%" }}
            onClick={next}
            title="下一首"
          >
            <ChevronBarRight />
          </button>
          {/* 向前X秒 */}
          <button
            className="btn btn-circle btn-outline-secondary px-2"
            style={{
              minWidth: 40,
              height: 44,
              borderRadius: "50%",
              padding: "0 6px",
              fontSize: "1rem",
            }}
            onClick={() =>
              playerRef.current?.internalPlayer.seekTo(
                Math.min(duration, current + seekStep),
                true
              )
            }
            title={`快進${seekStep}秒`}
          >
            <div
              className="d-flex align-items-center justify-content-center gap-1"
              style={{ width: "100%" }}
            >
              <span
                className="fw-bold text-muted"
                style={{
                  fontSize: "1em",
                  minWidth: "1.5em",
                  textAlign: "center",
                }}
              >
                {seekStep}s
              </span>
              <ChevronRight style={{ fontSize: "1.2em", flexShrink: 0 }} />
            </div>
          </button>
          {/* 隨機按鈕（最右） */}
          <button
            className={`btn btn-circle ${shuffle ? "btn-info" : "btn-outline-info"}`}
            style={{ width: 40, height: 40, borderRadius: "50%" }}
            onClick={() => setShuffle(!shuffle)}
            title="隨機播放"
          >
            <Shuffle />
          </button>
        </div>

        {/* 秒數設定 */}
        <div className="d-flex justify-content-center align-items-center gap-2 mb-3">
          <label className="form-label mb-0 me-2">快進/快退秒數</label>
          <input
            type="number"
            min={1}
            max={30}
            value={seekStep}
            onChange={(e) => setSeekStep(Number(e.target.value))}
            style={{ width: 60 }}
            className="form-control form-control-sm"
          />
          <span className="small text-muted">秒</span>
        </div>

        {/* 音量控制單獨一行 */}
        <div className="d-flex justify-content-center align-items-center gap-2 mb-4">
          <VolumeDownFill />
          <input
            type="range"
            className="form-range"
            style={{ maxWidth: 120 }}
            min={0}
            max={100}
            value={volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              playerRef.current?.internalPlayer.setVolume(v);
            }}
          />
          <VolumeUpFill />
        </div>
      </main>
    </QueueContext.Provider>
  );
}
