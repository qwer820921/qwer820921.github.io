import axios from "axios";
import { YtMusicTrack } from "../types";

// Google Apps Script Web App URL
export const BASE_URL =
  "https://script.google.com/macros/s/AKfycbwGBc88EWVv6G1x-mChE8EBVaPgdVoaYE3H86QwDRQUNB1H3o5pAnAKJCDahfNlLz7L/exec";

/**
 * 取得全部 YT Music 清單
 */
export const getAllYtMusicTracks = async (): Promise<YtMusicTrack[]> => {
  const res = await axios.get(BASE_URL + "?action=list");
  if (!Array.isArray(res.data)) throw new Error("Unexpected response format");
  return res.data as YtMusicTrack[];
};

/**
 * 取得單筆（by id）
 */
export const getYtMusicTrackById = async (
  id: string
): Promise<YtMusicTrack | undefined> => {
  const res = await axios.get(
    `${BASE_URL}?action=detail&id=${encodeURIComponent(id)}`
  );
  if (Array.isArray(res.data)) return res.data[0] as YtMusicTrack | undefined;
  if (res.data && typeof res.data === "object" && res.data.id)
    return res.data as YtMusicTrack;
  return undefined;
};

/**
 * 新增（只需傳入 token 與 youtube_url，其餘自動處理）
 */
export interface CreateYtMusicTrackParams {
  token: string;
  youtube_url: string;
  youtube_id: string;
  title: string;
  artist: string;
} // id 欄位已移除

export const createYtMusicTrack = async (params: CreateYtMusicTrackParams) => {
  // 不再傳 id
  const res = await axios.post(BASE_URL, params, {
    headers: {
      "Content-Type": "text/plain",
    },
    withCredentials: false,
  });
  return res.data;
};
