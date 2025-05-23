import React from "react";
import { YtMusicTrack } from "../types";
import { Button, ListGroup } from "react-bootstrap";

interface PlaylistListProps {
  playlist: YtMusicTrack[];
  currentTrackId?: string;
  onPlay: (id: string) => void;
  onDelete: (id: string) => void;
}

const PlaylistList: React.FC<PlaylistListProps> = ({
  playlist,
  currentTrackId,
  onPlay,
  onDelete,
}) => {
  if (playlist.length === 0) {
    return <div className="text-muted text-center my-3">播放清單是空的</div>;
  }

  return (
    <ListGroup>
      {playlist.map((track, index) => {
        const trackId = track.id || track.youtube_id;
        const isActive = currentTrackId === trackId;
        const thumbnailUrl = `https://img.youtube.com/vi/${track.youtube_id}/hqdefault.jpg`;

        return (
          <ListGroup.Item
            key={`${trackId}-${index}`}
            active={isActive}
            className="d-flex align-items-center"
          >
            <div
              className="flex-grow-1 d-flex align-items-center"
              style={{ minWidth: 0 }}
            >
              <img
                src={thumbnailUrl}
                alt={track.title}
                style={{
                  width: 48,
                  height: 48,
                  objectFit: "cover",
                  borderRadius: 6,
                  marginRight: 12,
                }}
              />
              <div style={{ overflow: "hidden" }}>
                <div
                  style={{
                    fontWeight: 600,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "normal",
                    maxWidth: "100%",
                    cursor: "pointer",
                  }}
                  onClick={() => onPlay(trackId)}
                >
                  {track.title}
                </div>
                <div
                  className="text-muted small mt-1"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {track.artist}
                </div>
              </div>
            </div>
            <Button
              variant="outline-danger"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(trackId);
              }}
              style={{
                marginLeft: 16,
                fontWeight: 500,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              刪除
            </Button>
          </ListGroup.Item>
        );
      })}
    </ListGroup>
  );
};

export default PlaylistList;
