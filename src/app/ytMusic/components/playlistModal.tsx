import { useState } from "react";
import { Modal, Nav } from "react-bootstrap";
import { YtMusicTrack } from "../types";
import PlaylistTab from "./playlistTab";
import SearchTab from "./searchTab";

interface YtMusicPlaylistModalProps {
  showModal: boolean;
  onClose: () => void;
  playlist: YtMusicTrack[];
  currentTrackId?: string;
  onPlay: (id: string) => void;
  onDelete: (id: string) => void;
  onAddTrack: (track: YtMusicTrack) => void;
  setPlaylist: (tracks: YtMusicTrack[]) => void;
}

export default function YtMusicPlaylistModal({
  showModal,
  onClose,
  playlist,
  currentTrackId,
  onPlay,
  onDelete,
  onAddTrack,
  setPlaylist,
}: YtMusicPlaylistModalProps) {
  const [activeTab, setActiveTab] = useState<"playlist" | "search">("playlist");

  return (
    <Modal show={showModal} onHide={onClose} size="xl" centered scrollable>
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
      <Modal.Body style={{ minHeight: 400, paddingTop: 0 }}>
        <div
          className={
            activeTab === "playlist" ? "tab-pane active" : "tab-pane d-none"
          }
        >
          <PlaylistTab
            showModal={showModal}
            playlist={playlist}
            currentTrackId={currentTrackId}
            onPlay={onPlay}
            onDelete={onDelete}
            setPlaylist={setPlaylist}
            onClose={onClose}
          />
        </div>
        <div
          className={
            activeTab === "search" ? "tab-pane active" : "tab-pane d-none"
          }
        >
          <SearchTab onAddTrack={onAddTrack} playlist={playlist} />
        </div>
      </Modal.Body>
    </Modal>
  );
}
