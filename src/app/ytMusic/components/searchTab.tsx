import { useState } from "react";
import { YtMusicTrack } from "../types";
import { YOUTUBE_API_KEY } from "@/config/youtube";
import SearchResults from "./searchResults";
import { YoutubeSearchResult } from "@/app/youtubePlayer/types";
import { mockYoutubeResults } from "../mocks/mockData";
import { createYtMusicTrack } from "../api/ytMusicApi";

interface SearchTabProps {
  onAddTrack: (track: YtMusicTrack) => void;
  playlist: YtMusicTrack[];
}

interface SearchBarProps {
  onSearch: () => void;
  query: string;
  setQuery: (query: string) => void;
  isSearching: boolean;
  loading?: boolean;
}

const SearchBar = ({
  onSearch,
  query,
  setQuery,
  isSearching,
  loading,
}: SearchBarProps) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onSearch();
    }
  };

  return (
    <div className="d-flex mb-3">
      <input
        type="text"
        className="form-control me-2"
        placeholder="輸入 YouTube 關鍵字或網址..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button
        className="btn btn-primary"
        disabled={loading || isSearching}
        onClick={onSearch}
      >
        {loading || isSearching ? "搜尋中..." : "搜尋"}
      </button>
    </div>
  );
};

export default function SearchTab({ onAddTrack, playlist }: SearchTabProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YoutubeSearchResult[]>(
    mockYoutubeResults as YoutubeSearchResult[]
  );
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // TODO: 實作 YouTube 搜尋 API 串接
  const handleSearch = async () => {
    if (!query) return;
    setIsSearching(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&q=${encodeURIComponent(
          query
        )}&key=${YOUTUBE_API_KEY}`
      );
      const data = await res.json();
      setResults(data.items || []);
    } catch {
      setResults([]);
      setError("搜尋失敗，請稍後再試");
    } finally {
      setIsSearching(false);
      setLoading(false);
    }
  };

  // 新增曲目到播放清單
  const handleAddTrack = async (track: YoutubeSearchResult) => {
    try {
      setLoading(true);
      // 1. 呼叫 API 新增
      await createYtMusicTrack({
        token: "YOUR_SECRET_TOKEN",
        youtube_url: `https://www.youtube.com/watch?v=${track.id.videoId}`,
        youtube_id: track.id.videoId,
        title: track.snippet.title,
        artist: track.snippet.channelTitle,
      });

      // 2. 新增成功後重新取得清單
      setTimeout(async () => {
        onAddTrack({
          id: track.id.videoId,
          title: track.snippet.title,
          artist: track.snippet.channelTitle,
          youtube_url: `https://www.youtube.com/watch?v=${track.id.videoId}`,
          youtube_id: track.id.videoId,
          mp3_url: "", // 根據需要設置
          status: "active", // 根據需要設置
        });
      }, 1000);
    } catch (error) {
      console.error("新增曲目失敗:", error);
      setError("新增曲目失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <SearchBar
        onSearch={handleSearch}
        query={query}
        setQuery={setQuery}
        isSearching={isSearching}
        loading={loading}
      />
      {error && <div className="text-danger mb-2">{error}</div>}
      <SearchResults
        results={results}
        playlist={playlist}
        onAddTrack={handleAddTrack}
        loading={loading}
      />
    </div>
  );
}
