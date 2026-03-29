import React from "react";
import { PlaylistTrack } from "../types/soundcloud";
import { Button, ListGroup } from "react-bootstrap";

interface PlaylistListProps {
  playlist: PlaylistTrack[];
  currentTrackId: string | null;
  onPlay: (trackId: string) => void;
  onDelete: (trackId: string) => void;
  onEdit: (track: PlaylistTrack) => void;
}

const PlaylistList: React.FC<PlaylistListProps> = ({
  playlist,
  currentTrackId,
  onPlay,
  onDelete,
  onEdit,
}) => {
  return (
    <ListGroup>
      {playlist.map((track) => (
        <ListGroup.Item
          key={track.id}
          active={currentTrackId === track.id}
          className="d-flex align-items-center justify-content-between"
        >
          <div
            style={{ flex: 1, cursor: "pointer" }}
            onClick={() => onPlay(track.id)}
          >
            <div>
              <strong>{track.title}</strong>
              <span style={{ color: "#888" }}> by {track.artist}</span>
            </div>
            <div style={{ fontSize: 12, color: "#bbb" }}>{track.url}</div>
          </div>
          <div>
            <Button
              size="sm"
              variant="outline-primary"
              className="me-2"
              onClick={() => onEdit(track)}
            >
              編輯
            </Button>
            <Button
              size="sm"
              variant="outline-danger"
              onClick={() => onDelete(track.id)}
            >
              刪除
            </Button>
          </div>
        </ListGroup.Item>
      ))}
    </ListGroup>
  );
};

export default PlaylistList;
