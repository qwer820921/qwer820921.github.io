import React, { useState } from "react";
import { Modal, Nav } from "react-bootstrap";
import PlaylistTab from "./playlistTab";
import SearchTab from "./searchTab";
import { PlaylistTrack, TrackSearchResult } from "../types/soundcloud";

interface PlaylistModalProps {
  show: boolean;
  onClose: () => void;
  playlist: PlaylistTrack[];
  currentTrackId: string | null;
  onPlay: (trackId: string) => void;
  onDelete: (trackId: string) => void;
  onEdit: (track: PlaylistTrack) => void;
  onAddTrack: (track: TrackSearchResult, embedHtml: string) => void;
}

const PlaylistModal: React.FC<PlaylistModalProps> = ({
  show,
  onClose,
  playlist,
  currentTrackId,
  onPlay,
  onDelete,
  onEdit,
  onAddTrack,
}) => {
  const [activeTab, setActiveTab] = useState<"playlist" | "search">("playlist");

  return (
    <Modal show={show} onHide={onClose} size="xl" centered scrollable>
      <Modal.Header closeButton>
        <Nav
          variant="tabs"
          activeKey={activeTab}
          onSelect={(k: string | null) => {
            if (k === "playlist" || k === "search") setActiveTab(k);
          }}
        >
          <Nav.Item>
            <Nav.Link eventKey="playlist">播放清單</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="search">搜尋</Nav.Link>
          </Nav.Item>
        </Nav>
      </Modal.Header>
      <Modal.Body style={{ minHeight: 400 }}>
        {activeTab === "playlist" ? (
          <PlaylistTab
            playlist={playlist}
            currentTrackId={currentTrackId}
            onPlay={onPlay}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        ) : (
          <SearchTab onAddTrack={onAddTrack} playlist={playlist} />
        )}
      </Modal.Body>
    </Modal>
  );
};

export default PlaylistModal;
