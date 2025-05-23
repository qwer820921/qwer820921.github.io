import { YtMusicTrack } from "../types";
import PlaylistList from "./playlistList";
interface PlaylistTabProps {
  showModal: boolean;
  playlist: YtMusicTrack[];
  currentTrackId?: string;
  onPlay: (id: string) => void;
  onDelete: (id: string) => void;
  setPlaylist: (tracks: YtMusicTrack[]) => void;
  onClose: () => void;
}

export default function PlaylistTab({
  showModal,
  playlist,
  currentTrackId,
  onPlay,
  onDelete,
  setPlaylist,
  onClose,
}: PlaylistTabProps) {
  return (
    <div>
      {playlist.length === 0 ? (
        <div className="text-muted text-center py-4">尚無歌曲，請先新增</div>
      ) : (
        <PlaylistList
          showModal={showModal}
          playlist={playlist}
          currentTrackId={currentTrackId}
          onPlay={onPlay}
          onDelete={onDelete}
          setPlaylist={setPlaylist}
          onClose={onClose}
        />
      )}
    </div>
  );
}
