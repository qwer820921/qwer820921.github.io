export interface YtMusicTrack {
  key_id: string; // 主鍵，等於 youtube_id
  title: string;
  artist: string;
  youtube_url: string;
  youtube_id: string;
  mp3_url: string;
  status: string;
  note?: string;

  // 加入的欄位
  loadStatus?: "loading" | "loaded" | "error"; // 新增的載入狀態
  objectUrl?: string;
  audioSrc?: string; // 可以是 blob:https:// 開頭或 https://...，餵給 audio 元素用
  isCached?: boolean; // 是否來自 Cache API
  isDownloaded?: boolean; // 是否為本次 session 下載
  isVisibleInExternalPlaylist?: boolean; // 是否在外部播放清單中顯示
}
