import { YtMusicTrack } from "../types";

interface PlaylistTabProps {
  playlist: YtMusicTrack[];
  currentTrackId?: string;
  onPlay: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (track: YtMusicTrack) => void;
}

import PlaylistList from "./playlistList";

export default function PlaylistTab({
  playlist,
  currentTrackId,
  onPlay,
  onDelete,
  onEdit,
}: PlaylistTabProps) {
  return (
    <div>
      {playlist.length === 0 ? (
        <div className="text-muted text-center py-4">尚無歌曲，請先新增</div>
      ) : (
        <PlaylistList
          playlist={playlist}
          currentTrackId={currentTrackId}
          onPlay={onPlay}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      )}
    </div>
  );
}
