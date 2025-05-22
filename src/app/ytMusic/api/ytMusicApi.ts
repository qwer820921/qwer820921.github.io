import axios from "axios";
import { YtMusicTrack } from "../types";

export const BASE_URL =
  "https://script.google.com/macros/s/AKfycbyPcd7XZSeUUoNvZTKJtBYgzgDyh1rB3fUXRMNxo0A38yg-FM2AzvYBcAd60jyA2hEZ/exec";

/**
 * ✅ 取得某個使用者的播放清單
 */
export const getUserYtMusicTracks = async (
  user_id: string
): Promise<YtMusicTrack[]> => {
  const res = await axios.get(BASE_URL, {
    params: { user_id },
  });
  if (!Array.isArray(res.data)) throw new Error("Unexpected response format");
  return res.data as YtMusicTrack[];
};

/**
 * ✅ 新增一首歌
 */
export interface CreateYtMusicTrackParams {
  token: string;
  action: "create";
  user_id: string;
  youtube_url: string;
  youtube_id: string;
  title: string;
  artist: string;
}

export const createYtMusicTrack = async (params: CreateYtMusicTrackParams) => {
  const res = await axios.post(BASE_URL, params, {
    headers: { "Content-Type": "text/plain" },
  });
  return res.data;
};

/**
 * ✅ 刪除一首歌（依 user_id + youtube_id）
 */
export interface DeleteYtMusicTrackParams {
  token: string;
  action: "delete";
  user_id: string;
  youtube_id: string;
}

export const deleteYtMusicTrack = async (params: DeleteYtMusicTrackParams) => {
  const res = await axios.post(BASE_URL, params, {
    headers: { "Content-Type": "text/plain" },
  });
  return res.data;
};

/**
 * ✅ 使用者登入
 */
export interface LoginParams {
  action: "login";
  username: string;
  password: string;
}

export interface LoginResult {
  success: boolean;
  user_id: string;
  username: string;
  message: string;
}

export const loginUser = async (params: LoginParams): Promise<LoginResult> => {
  const res = await axios.post(BASE_URL, params, {
    headers: { "Content-Type": "text/plain" },
  });
  return res.data;
};
