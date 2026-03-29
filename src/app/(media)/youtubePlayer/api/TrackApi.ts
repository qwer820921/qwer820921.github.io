import axios from "axios";
import { Track } from "../types";

// Google Apps Script Web App URL
export const BASE_URL =
  "https://script.google.com/macros/s/AKfycbzsuuu3BCArDw4Z_YjetPxEocch_b6-wBFNQrBxgR3gQACASyqxZ1_q41yXytgO-1VS/exec";

/**
 * 查詢全部 Track
 * GET /exec
 */
export const getAllTracks = async (): Promise<Track[]> => {
  const response = await axios.get(BASE_URL);
  if (!Array.isArray(response.data))
    throw new Error("Unexpected response format");
  return response.data as Track[];
};

/**
 * 查詢單一 Track
 * GET /exec?id=VIDEO_ID
 */
export const getTrackById = async (id: string): Promise<Track | undefined> => {
  const response = await axios.get(`${BASE_URL}?id=${encodeURIComponent(id)}`);
  if (!Array.isArray(response.data))
    throw new Error("Unexpected response format");
  return response.data[0] as Track | undefined;
};

/**
 * 新增 Track
 * POST { action: 'create', id, title, artist, lrc?, lyrics? }
 */
export const createTrack = async (track: Omit<Track, "addedAt">) => {
  const response = await axios.post(
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
  return response.data;
};

/**
 * 更新 Track
 * POST { action: 'update', id, title?, artist?, lrc?, lyrics? }
 */
export const updateTrack = async (
  track: Partial<Omit<Track, "addedAt">> & { id: string }
) => {
  const response = await axios.post(
    BASE_URL,
    {
      action: "update",
      ...track,
    },
    {
      headers: {
        "Content-Type": "text/plain",
      },
      withCredentials: false,
    }
  );
  return response.data;
};

/**
 * 刪除 Track
 * POST { action: 'delete', id }
 */
export const deleteTrack = async (id: string) => {
  const response = await axios.post(
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
  return response.data;
};
