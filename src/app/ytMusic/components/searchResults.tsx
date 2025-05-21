import { ListGroup, Button, Spinner } from "react-bootstrap";
import { YtMusicTrack } from "../types";

type YoutubeSearchResult = {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: { default: { url: string } };
  };
};

interface SearchResultsProps {
  results: YoutubeSearchResult[];
  playlist: YtMusicTrack[];
  onAddTrack: (track: YtMusicTrack) => void;
  loading?: boolean;
}

const SearchResults = ({
  results,
  playlist,
  onAddTrack,
  loading,
}: SearchResultsProps) => {
  const isInPlaylist = (youtubeId: string) =>
    playlist.some((track) => track.youtube_id === youtubeId);

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
      {results.map((item) => (
        <ListGroup.Item key={item.id.videoId}>
          <div className="d-flex align-items-center">
            {/* 左側內容自動填滿剩餘空間 */}
            <div
              className="flex-grow-1 d-flex align-items-center"
              style={{ minWidth: 0 }}
            >
              <img
                src={item.snippet.thumbnails.default.url}
                alt={item.snippet.title}
                style={{
                  width: 48,
                  height: 48,
                  objectFit: "cover",
                  borderRadius: 6,
                  marginRight: 12,
                }}
              />
              <div style={{ overflow: "hidden" }}>
                {/* 標題與頻道名稱同一行，2行內顯示，多餘 ... */}
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
                  title={
                    item.snippet.title + " by " + item.snippet.channelTitle
                  }
                >
                  {item.snippet.title}{" "}
                  <span style={{ color: "#888" }}>
                    by {item.snippet.channelTitle}
                  </span>
                </div>
                {/* 網址單獨一行，過長省略 */}
                <a
                  href={`https://www.youtube.com/watch?v=${item.id.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                    lineHeight: "1.3",
                    color: "#bbb",
                    textDecoration: "none",
                    cursor: "pointer",
                    display: "block",
                  }}
                  title={`https://www.youtube.com/watch?v=${item.id.videoId}`}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.textDecoration = "underline")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.textDecoration = "none")
                  }
                >
                  {`https://www.youtube.com/watch?v/${item.id.videoId}`}
                </a>
              </div>
            </div>
            {/* 右側按鈕固定，不換行不縮放 */}
            <Button
              size="sm"
              variant="success"
              disabled={isInPlaylist(item.id.videoId)}
              onClick={() =>
                onAddTrack({
                  id: item.id.videoId,
                  title: item.snippet.title,
                  artist: item.snippet.channelTitle,
                  youtube_url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                  youtube_id: item.id.videoId,
                  mp3_url: "",
                  status: "pending",
                  note: "",
                })
              }
              style={{
                marginLeft: 16,
                fontWeight: 500,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {isInPlaylist(item.id.videoId) ? (
                "已在清單"
              ) : (
                <span>加入清單</span>
              )}
            </Button>
          </div>
        </ListGroup.Item>
      ))}
    </ListGroup>
  );
};

export default SearchResults;
