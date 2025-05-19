import React from "react";
import YoutubeSearchBox from "./YoutubeSearchBox";
import YoutubeSearchResultList from "./YoutubeSearchResultList";
import PlaylistList from "./PlaylistList";
import { YoutubeSearchResult, Track } from "../types";

interface EditPlaylistModalProps {
  show: boolean;
  onClose: () => void;
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  onSearch: () => void;
  isSearching: boolean;
  searchResults: YoutubeSearchResult[];
  playlist: Track[];
  onAddTrack: (video: YoutubeSearchResult) => void;
  onDeleteTrack: (id: string) => void;
  selectedIndex: number;
  onSelectTrack: (i: number) => void;
}

const EditPlaylistModal: React.FC<EditPlaylistModalProps> = ({
  show,
  onClose,
  searchInput,
  onSearchInputChange,
  onSearch,
  isSearching,
  searchResults,
  playlist,
  onAddTrack,
  onDeleteTrack,
  selectedIndex,
  onSelectTrack,
}) => {
  if (!show) return null;
  return (
    <div
      className="modal fade show"
      style={{ display: "block", background: "rgba(0,0,0,0.5)" }}
      tabIndex={-1}
    >
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">編輯播放清單</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <YoutubeSearchBox
              value={searchInput}
              onChange={onSearchInputChange}
              onSearch={onSearch}
              isSearching={isSearching}
            />
            <YoutubeSearchResultList
              results={searchResults}
              playlist={playlist}
              onAddTrack={onAddTrack}
            />
            <hr />
            <label className="form-label">目前播放清單</label>
            <PlaylistList
              playlist={playlist}
              selectedIndex={selectedIndex}
              onDeleteTrack={onDeleteTrack}
              onSelectTrack={onSelectTrack}
            />
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              關閉
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditPlaylistModal;
