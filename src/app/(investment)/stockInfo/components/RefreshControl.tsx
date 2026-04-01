import React from "react";

interface RefreshControlProps {
  isAutoRefresh: boolean;
  setIsAutoRefresh: (value: boolean) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

const RefreshControl: React.FC<RefreshControlProps> = ({
  isAutoRefresh,
  setIsAutoRefresh,
  isLoading,
  onRefresh,
}) => {
  return (
    <div className="d-flex justify-content-between align-items-center mb-4">
      <div className="form-check form-switch">
        <input
          className="form-check-input"
          type="checkbox"
          id="refreshModeSwitch"
          checked={isAutoRefresh}
          onChange={() => setIsAutoRefresh(!isAutoRefresh)}
        />
        <label className="form-check-label ms-1" htmlFor="refreshModeSwitch">
          {isAutoRefresh ? "自動刷新開啟" : "自動刷新模式"}
        </label>
      </div>
      {!isAutoRefresh && (
        <button
          className="btn btn-primary d-flex align-items-center"
          onClick={onRefresh}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span
                className="spinner-border spinner-border-sm me-2"
                role="status"
              ></span>
              正在刷新...
            </>
          ) : (
            "手動刷新"
          )}
        </button>
      )}
    </div>
  );
};

export default RefreshControl;
