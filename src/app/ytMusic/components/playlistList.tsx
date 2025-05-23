import React, { useCallback, useEffect, useMemo, useState } from "react";
import { YtMusicTrack } from "../types";
import { Button, Form, ListGroup } from "react-bootstrap";

interface PlaylistListProps {
  showModal: boolean;
  playlist: YtMusicTrack[];
  currentTrackId?: string;
  onPlay: (id: string) => void;
  onDelete: (id: string) => void;
  setPlaylist: (tracks: YtMusicTrack[]) => void;
  onClose: () => void;
}

const PlaylistList: React.FC<PlaylistListProps> = ({
  showModal,
  playlist,
  currentTrackId,
  onPlay,
  onDelete,
  setPlaylist,
  onClose,
}) => {
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]); // 紀錄勾選的曲目 ID

  // 每次 showModal 變化時，初始化 selectedTracks
  useEffect(() => {
    if (showModal) {
      setSelectedTracks(
        playlist
          .filter((track) => track.isVisibleInExternalPlaylist !== false)
          .map((track) => track.key_id)
      );
    }
  }, [showModal, playlist]);

  // 檢查某個曲目是否被選中
  // 檢查曲目是否被選中
  const isTrackSelected = useCallback(
    (track: YtMusicTrack) => {
      // 當前播放的曲目始終視為選中
      if (track.key_id === currentTrackId) return true;
      return selectedTracks.includes(track.key_id);
    },
    [selectedTracks, currentTrackId]
  );

  // 計算全選狀態：'all' - 全選, 'none' - 全不選, 'some' - 部分選中
  const selectAllState = useMemo(() => {
    const visibleTracks = playlist.filter(
      (track) => track.isVisibleInExternalPlaylist !== false
    );
    const selectedCount = visibleTracks.filter(isTrackSelected).length;
    if (selectedCount === 0) return "none";
    if (selectedCount === visibleTracks.length) return "all";
    return "some";
  }, [playlist, selectedTracks]);

  // 切換全選狀態
  const toggleSelectAll = () => {
    if (selectAllState === "all") {
      // 取消全選時，保留當前播放的曲目
      setSelectedTracks(currentTrackId ? [currentTrackId] : []);
    } else {
      setSelectedTracks(playlist.map((track) => track.key_id)); // 全選可見曲目
    }
  };

  // 切換單個曲目的選擇狀態
  const toggleTrackSelection = (track: YtMusicTrack) => {
    // 如果是當前播放的曲目，不允許取消選中
    if (track.key_id === currentTrackId) return;

    const trackId = track.key_id;
    if (isTrackSelected(track)) {
      setSelectedTracks(selectedTracks.filter((id) => id !== trackId));
    } else {
      setSelectedTracks([...selectedTracks, trackId]);
    }
  };

  // 確認按鈕點擊處理
  const handleConfirm = () => {
    // 將 selectedTracks 轉換為 YtMusicTrack[] 並更新 playlist
    const newPlaylist = playlist.map((track) => ({
      ...track,
      isVisibleInExternalPlaylist: selectedTracks.includes(track.key_id),
    }));
    setPlaylist(newPlaylist);
    onClose();
  };

  // 檢查是否有選中項目
  const hasSelectedItems = selectedTracks.length > 0;

  if (playlist.length === 0) {
    return <div className="text-muted text-center my-3">播放清單是空的</div>;
  }
  return (
    <div className="d-flex flex-column" style={{ height: "100%" }}>
      {/* 頂部操作欄 - 固定在頂部 */}
      <div
        className="d-flex align-items-center"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10, // 提高 z-index，確保高於下方所有元素
          backgroundColor: "#fff", // 確保背景完全不透明
          padding: "0.5rem 1rem",
          border: "1px solid rgba(0,0,0,0.125)",
          borderTopLeftRadius: "0.25rem",
          borderTopRightRadius: "0.25rem",
          borderBottom: "1px solid rgba(0,0,0,0.125)", // 恢復底部邊框，避免視覺斷層
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)", // 添加底部陰影，增強層次感
        }}
      >
        <Form.Check
          type="checkbox"
          id="selectAll"
          checked={selectAllState === "all"}
          onChange={toggleSelectAll}
          className="me-2"
          style={{ marginLeft: "0.5rem" }}
        />
        <div
          className="flex-grow-1 d-flex align-items-center"
          style={{ minWidth: 0 }}
        >
          <div style={{ width: 48, marginRight: 12 }} />
          <span
            style={{
              fontWeight: 600,
              display: "inline-block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "100%",
            }}
          >
            全選
          </span>
        </div>
        <Button
          variant="primary"
          onClick={handleConfirm}
          disabled={!hasSelectedItems}
          size="sm"
          style={{
            marginLeft: 16,
            width: "60px",
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          確認
        </Button>
      </div>

      {/* 播放列表 - 獨立滾動 */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          maxHeight: "calc(100% - 56px)",
        }}
      >
        <ListGroup
          style={{
            borderTop: "none", // 移除頂部邊框，與上方操作欄銜接
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
          }}
        >
          {playlist.map((track, index) => {
            const trackId = track.key_id;
            const isActive = currentTrackId === trackId;
            const thumbnailUrl = `https://img.youtube.com/vi/${track.youtube_id}/hqdefault.jpg`;

            return (
              <ListGroup.Item
                key={`${trackId}-${index}`}
                active={isActive}
                className="d-flex align-items-center"
              >
                <Form.Check
                  type="checkbox"
                  checked={isTrackSelected(track)}
                  onChange={() => toggleTrackSelection(track)}
                  onClick={(e) => e.stopPropagation()}
                  className="me-2"
                  style={{
                    marginLeft: "0.5rem",
                    opacity: track.key_id === currentTrackId ? 0.7 : 1,
                    cursor:
                      track.key_id === currentTrackId
                        ? "not-allowed"
                        : "pointer",
                  }}
                  disabled={track.key_id === currentTrackId}
                />
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
                    width: "60px",
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
      </div>
    </div>
  );
};

export default PlaylistList;
