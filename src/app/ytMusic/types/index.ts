export interface YtMusicTrack {
  id: string; // 主鍵，等於 youtube_id
  title: string;
  artist: string;
  youtube_url: string;
  youtube_id: string;
  mp3_url: string;
  status: string;
  note?: string;
}

export interface CreateYtMusicTrackParams {
  token: string;
  id: string; // = youtube_id
  title: string;
  artist: string;
  youtube_url: string;
  youtube_id: string;
}
