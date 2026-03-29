import React from "react";
import { YoutubeSearchResult, Track } from "../types";

interface YoutubeSearchResultListProps {
  results: YoutubeSearchResult[];
  playlist: Track[];
  onAddTrack: (video: YoutubeSearchResult) => void;
}

const YoutubeSearchResultList: React.FC<YoutubeSearchResultListProps> = ({
  results,
  playlist,
  onAddTrack,
}) => {
  return results.length > 0 ? (
    <ul className="list-group mt-1">
      {results.map((item) => {
        const exists = playlist.some((t) => t.id === item.id.videoId);
        return (
          <li
            key={item.id.videoId}
            className="list-group-item d-flex align-items-center"
          >
            <img
              src={item.snippet.thumbnails.default.url}
              alt="thumb"
              className="me-2"
            />
            <span className="flex-grow-1">{item.snippet.title}</span>
            <button
              className="btn btn-sm btn-success"
              disabled={exists}
              onClick={() => onAddTrack(item)}
            >
              {exists ? "已存在" : "加入"}
            </button>
          </li>
        );
      })}
    </ul>
  ) : null;
};

export default YoutubeSearchResultList;
