import React from "react";
import { PlaylistTrack, TrackSearchResult } from "../types/soundcloud";
import { Button, ListGroup, Spinner } from "react-bootstrap";

interface SearchResultsProps {
  results: TrackSearchResult[];
  playlist: PlaylistTrack[];
  onAddTrack: (track: TrackSearchResult, embedHtml: string) => void;
  loading?: boolean;
}

const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  playlist,
  onAddTrack,
  loading,
}) => {
  // 判斷是否已在播放清單
  const isInPlaylist = (trackId: string) =>
    playlist.some((t) => t.id === trackId);

  if (loading) {
    return (
      <div className="text-center my-3">
        <Spinner animation="border" />
      </div>
    );
  }
  if (!results.length) {
    return <div className="text-muted text-center my-3">請輸入關鍵字搜尋</div>;
  }
  return (
    <ListGroup>
      {results.map((track) => (
        <ListGroup.Item key={track.id}>
          <div className="d-flex align-items-center">
            <div
              className="flex-grow-1 d-flex align-items-center"
              style={{ minWidth: 0 }}
            >
              <img
                src={
                  track.artwork_url
                    ? track.artwork_url.replace("-large", "-t300x300")
                    : "/images/img14.jpg"
                }
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
                    lineHeight: "1.3",
                  }}
                >
                  {track.title}{" "}
                  <span style={{ color: "#888" }}>
                    by {track.user.username}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#bbb",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                  }}
                >
                  {track.permalink_url}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="success"
              disabled={isInPlaylist(track.id)}
              onClick={() => onAddTrack(track, "")}
              style={{
                marginLeft: 16,
                fontWeight: 500,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {isInPlaylist(track.id) ? "已在清單" : <span>加入清單</span>}
            </Button>
          </div>
        </ListGroup.Item>
      ))}
    </ListGroup>
  );
};

export default SearchResults;
