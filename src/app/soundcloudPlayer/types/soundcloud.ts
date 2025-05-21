// SoundCloud 曲目搜尋結果
// SoundCloud 曲目搜尋結果
export interface TrackSearchResult {
  id: string;
  title: string;
  user: {
    username: string;
  };
  permalink_url: string;
  artwork_url?: string;
}

// 播放清單中的曲目
export interface PlaylistTrack {
  id: string; // Google Sheet 自動產生的流水號
  title: string;
  artist: string;
  url: string;
  added_at: string; // ISO 字串
  embed_html: string;
  artwork_url?: string;
  duration?: number; // 單位: 毫秒，對應 SoundCloud API
}
