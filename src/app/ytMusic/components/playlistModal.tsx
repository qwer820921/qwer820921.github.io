import { useState } from "react";
import { Modal, Nav } from "react-bootstrap";
import { YtMusicTrack } from "../types";
import PlaylistTab from "./playlistTab";
import SearchTab from "./searchTab";

interface YtMusicPlaylistModalProps {
  show: boolean;
  onClose: () => void;
  playlist: YtMusicTrack[];
  currentTrackId?: string;
  onPlay: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (track: YtMusicTrack) => void;
  onAddTrack: (track: YtMusicTrack) => void;
}

export default function YtMusicPlaylistModal({
  show,
  onClose,
  playlist,
  currentTrackId,
  onPlay,
  onDelete,
  onEdit,
  onAddTrack,
}: YtMusicPlaylistModalProps) {
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
}
