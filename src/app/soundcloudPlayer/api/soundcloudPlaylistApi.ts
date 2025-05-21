import axios from "axios";
import { PlaylistTrack, TrackSearchResult } from "../types/soundcloud";

const BASE_URL =
  "https://script.google.com/macros/s/AKfycbxRVvA4PknDe8qHM8-ObBrE3_iWhGFdpJegZgk72-pR8WzY5GyZIsqRxE1bbcQEPW-arw/exec";

// 查詢 SoundCloud 曲目
export async function searchTracks(
  query: string
): Promise<{ collection: TrackSearchResult[] }> {
  const res = await axios.get(BASE_URL, {
    params: { action: "search", q: query },
  });
  return res.data;
}

// 取得播放清單
export async function getPlaylist(): Promise<PlaylistTrack[]> {
  const res = await axios.get(BASE_URL, {
    params: { action: "get_playlist" },
  });
  return res.data;
}

// 新增歌曲到播放清單
export async function addToPlaylist(track: {
  title: string;
  artist: string;
  url: string;
  embed_html?: string;
  artwork_url?: string;
}): Promise<PlaylistTrack> {
  const res = await axios.post(
    BASE_URL,
    {
      action: "create",
      ...track,
    },
    {
      headers: {
        "Content-Type": "text/plain",
      },
      withCredentials: false,
    }
  );
  return res.data;
}

// 刪除播放清單中的歌曲
export async function deleteFromPlaylist(id: string | number): Promise<void> {
  const res = await axios.post(
    BASE_URL,
    {
      action: "delete",
      id,
    },
    {
      headers: {
        "Content-Type": "text/plain",
      },
      withCredentials: false,
    }
  );
  return res.data;
}

// 編輯播放清單中的歌曲
export async function editPlaylistItem(track: {
  id: string | number;
  title?: string;
  artist?: string;
  url?: string;
  embed_html?: string;
}) {
  const res = await axios.post(
    BASE_URL,
    {
      action: "edit",
      ...track,
    },
    {
      headers: {
        "Content-Type": "text/plain",
      },
      withCredentials: false,
    }
  );
  return res.data;
}
