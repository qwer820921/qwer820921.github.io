import React from "react";
import { PlaylistTrack } from "../types/soundcloud";
import PlaylistList from "./playlistList";

interface PlaylistTabProps {
  playlist: PlaylistTrack[];
  currentTrackId: string | null;
  onPlay: (trackId: string) => void;
  onDelete: (trackId: string) => void;
  onEdit: (track: PlaylistTrack) => void;
}

const PlaylistTab: React.FC<PlaylistTabProps> = ({
  playlist,
  currentTrackId,
  onPlay,
  onDelete,
  onEdit,
}) => {
  return (
    <div>
      <PlaylistList
        playlist={playlist}
        currentTrackId={currentTrackId}
        onPlay={onPlay}
        onDelete={onDelete}
        onEdit={onEdit}
      />
      {/* 這裡可以擴充更多播放清單相關功能 */}
    </div>
  );
};

export default PlaylistTab;
