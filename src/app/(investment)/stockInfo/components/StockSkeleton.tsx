import React from "react";

const StockSkeleton: React.FC = () => {
  return (
    <div className="stock-skeleton">
      {/* 桌面版骨架 */}
      <div className="d-none d-lg-block">
        <div className="table-responsive">
          <table className="table table-bordered align-middle">
            <thead className="table-light">
              <tr>
                {Array(11).fill(0).map((_, i) => (
                  <th key={i}><div className="skeleton" style={{ width: "80%", height: "20px" }}></div></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array(5).fill(0).map((_, rowIndex) => (
                <tr key={rowIndex}>
                  {Array(11).fill(0).map((_, colIndex) => (
                    <td key={colIndex}><div className="skeleton" style={{ width: "90%", height: "20px" }}></div></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 手機版骨架 */}
      <div className="d-lg-none">
        {Array(3).fill(0).map((_, i) => (
          <div key={i} className="card shadow-sm mb-3">
            <div className="card-header bg-white">
              <div className="skeleton" style={{ width: "60%", height: "24px" }}></div>
            </div>
            <div className="card-body">
              <div className="skeleton mb-2" style={{ width: "100%", height: "40px" }}></div>
              <div className="skeleton" style={{ width: "100%", height: "40px" }}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StockSkeleton;
