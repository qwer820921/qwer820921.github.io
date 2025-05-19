import React from "react";

interface YoutubeSearchBoxProps {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  isSearching: boolean;
}

const YoutubeSearchBox: React.FC<YoutubeSearchBoxProps> = ({
  value,
  onChange,
  onSearch,
  isSearching,
}) => (
  <div className="mb-3">
    <label className="form-label">搜尋 YouTube 標題</label>
    <div className="input-group">
      <input
        type="text"
        className="form-control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="請輸入影片標題"
      />
      <button
        className="btn btn-primary"
        type="button"
        onClick={onSearch}
        disabled={isSearching}
      >
        {isSearching ? "查詢中…" : "查詢"}
      </button>
    </div>
    {isSearching && <div className="small text-muted">搜尋中…</div>}
  </div>
);

export default YoutubeSearchBox;
