import React, { useState } from "react";
import { PlaylistTrack, TrackSearchResult } from "../types/soundcloud";
import {
  searchTracks,
  addToPlaylist,
  getPlaylist,
} from "../api/soundcloudPlaylistApi";
import SearchBar from "./searchBar";
import SearchResults from "./searchResults";

interface SearchTabProps {
  playlist: PlaylistTrack[];
  onAddTrack: (track: TrackSearchResult, embedHtml: string) => void;
}

const SearchTab: React.FC<SearchTabProps> = ({ playlist, onAddTrack }) => {
  const [results, setResults] = useState<TrackSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (query: string) => {
    setLoading(true);
    setResults([]);
    try {
      const res = await searchTracks(query);
      setResults(res.collection || []);
    } catch (err) {
      console.error(err);
      // 可加上錯誤提示
    }
    setLoading(false);
  };

  // 新增曲目到 Google Sheet，並延遲 1 秒後重新取得清單
  const handleAddTrack = async (
    track: TrackSearchResult,
    embedHtml: string
  ) => {
    await addToPlaylist({
      title: track.title,
      artist: track.user.username,
      url: track.permalink_url,
      embed_html: embedHtml,
      artwork_url: track.artwork_url || "",
    });
    setTimeout(async () => {
      await getPlaylist();
      // 這裡直接呼叫 onAddTrack，讓父元件刷新資料
      onAddTrack(track, embedHtml);
    }, 1000);
  };

  return (
    <div>
      <SearchBar onSearch={handleSearch} loading={loading} />
      <SearchResults
        results={results}
        playlist={playlist}
        onAddTrack={handleAddTrack}
        loading={loading}
      />
    </div>
  );
};

export default SearchTab;
