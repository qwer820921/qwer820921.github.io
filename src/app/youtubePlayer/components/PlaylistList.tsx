import React from "react";
import { Track } from "../types";

interface PlaylistListProps {
  playlist: Track[];
  selectedIndex: number;
  onDeleteTrack: (id: string) => void;
  onSelectTrack: (i: number) => void;
}

const PlaylistList: React.FC<PlaylistListProps> = ({
  playlist,
  selectedIndex,
  onDeleteTrack,
  onSelectTrack,
}) => (
  <ul className="list-group">
    {playlist.map((track, i) => (
      <li
        key={track.id}
        className={
          "list-group-item d-flex justify-content-between align-items-center" +
          (i === selectedIndex ? " active" : "")
        }
        onClick={() => onSelectTrack(i)}
        style={{ cursor: "pointer" }}
      >
        <span>{track.title}</span>
        <span className="text-muted ms-2">{track.artist}</span>
        <button
          className="btn btn-sm btn-danger ms-2"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteTrack(track.id);
          }}
        >
          刪除
        </button>
      </li>
    ))}
  </ul>
);

export default PlaylistList;
