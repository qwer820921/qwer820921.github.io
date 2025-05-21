import { useState } from "react";
import { YtMusicTrack } from "../types";
import { YOUTUBE_API_KEY } from "@/config/youtube";
import SearchResults from "./searchResults";

interface SearchTabProps {
  onAddTrack: (track: YtMusicTrack) => void;
  playlist: YtMusicTrack[];
}

type YoutubeSearchResult = {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: { default: { url: string } };
  };
};

interface SearchBarProps {
  onSearch: () => void;
  query: string;
  setQuery: (query: string) => void;
  isSearching: boolean;
}

const SearchBar = ({
  onSearch,
  query,
  setQuery,
  isSearching,
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
        disabled={isSearching}
        onClick={onSearch}
      >
        {isSearching ? "搜尋中..." : "搜尋"}
      </button>
    </div>
  );
};

export default function SearchTab({ onAddTrack, playlist }: SearchTabProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YoutubeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TODO: 實作 YouTube 搜尋 API 串接
  const handleSearch = async () => {
    if (!query) return;
    setIsSearching(true);
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
    }
  };

  return (
    <div>
      <SearchBar
        onSearch={handleSearch}
        query={query}
        setQuery={setQuery}
        isSearching={isSearching}
      />
      {error && <div className="text-danger mb-2">{error}</div>}
      <SearchResults
        results={results}
        playlist={playlist}
        onAddTrack={onAddTrack}
      />
    </div>
  );
}
