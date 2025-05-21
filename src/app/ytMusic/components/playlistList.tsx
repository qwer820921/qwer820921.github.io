import React from "react";
import { YtMusicTrack } from "../types";
import { Button, ListGroup } from "react-bootstrap";

interface PlaylistListProps {
  playlist: YtMusicTrack[];
  currentTrackId?: string;
  onPlay: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (track: YtMusicTrack) => void;
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
          key={track.id || track.youtube_id}
          active={currentTrackId === (track.id || track.youtube_id)}
          className="d-flex align-items-center justify-content-between"
        >
          <div
            style={{ flex: 1, cursor: "pointer" }}
            onClick={() => onPlay(track.id || track.youtube_id)}
          >
            <div>
              <strong>{track.title}</strong>
              <span style={{ color: "#888" }}> by {track.artist}</span>
            </div>
            <div style={{ fontSize: 12, color: "#bbb" }}>
              {track.youtube_url}
            </div>
            <div style={{ fontSize: 12, color: "#bbb" }}>{track.status}</div>
          </div>
          <div>
            {onEdit && (
              <Button
                size="sm"
                variant="outline-primary"
                className="me-2"
                onClick={() => onEdit(track)}
              >
                編輯
              </Button>
            )}
            <Button
              size="sm"
              variant="outline-danger"
              onClick={() => onDelete(track.id || track.youtube_id)}
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
