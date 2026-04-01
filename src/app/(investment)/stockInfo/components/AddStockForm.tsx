import React from "react";

interface AddStockFormProps {
  newStockCode: string;
  setNewStockCode: (value: string) => void;
  isAddLoading: boolean;
  onAdd: () => void;
}

const AddStockForm: React.FC<AddStockFormProps> = ({
  newStockCode,
  setNewStockCode,
  isAddLoading,
  onAdd,
}) => {
  return (
    <div className="input-group mb-3">
      <input
        type="text"
        className="form-control"
        placeholder="輸入股票代號 (如 2330)"
        value={newStockCode}
        onChange={(e) => setNewStockCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && newStockCode && !isAddLoading) {
            onAdd();
          }
        }}
      />
      <button
        className="btn btn-outline-secondary"
        onClick={onAdd}
        disabled={!newStockCode || isAddLoading}
      >
        {isAddLoading ? (
          <>
            <span
              className="spinner-border spinner-border-sm me-2"
              role="status"
              aria-hidden="true"
            ></span>
            新增中...
          </>
        ) : (
          "新增"
        )}
      </button>
    </div>
  );
};

export default AddStockForm;
