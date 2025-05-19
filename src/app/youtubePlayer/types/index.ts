/****************** 型別 ******************/
// Track 型別：對應 YouTube Search API 回傳的影片資料
export interface Track {
  id: string; // YouTube videoId
  title: string; // 影片標題
  artist: string; // 頻道名稱（channelTitle）
  lrc?: string; // LRC 歌詞
  lyrics?: string; // 純文字歌詞
  addedAt?: number; // 加入清單的時間
}
export interface QueueCtx {
  list: Track[];
  index: number;
  shuffle: boolean;
  repeat: boolean;
  next: () => void;
  prev: () => void;
  setShuffle: (v: boolean) => void;
  setRepeat: (v: boolean) => void;
  setIndex: (i: number) => void;
}

export interface YoutubeSearchResult {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: { default: { url: string } };
  };
}
