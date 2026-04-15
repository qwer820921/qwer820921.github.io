import React from "react";
import { TwseStock } from "../types";
import { formatPrices } from "@/utils/format";
import styles from "../styles/stockInfo.module.css";

interface StockTableProps {
  stockData: (TwseStock & { id?: number; lastUpdated?: number })[];
  isRemoveLoading: boolean;
  onRemove: (id: number) => void;
}

const StockTable: React.FC<StockTableProps> = ({
  stockData,
  isRemoveLoading,
  onRemove,
}) => {
  return (
    <div className="table-responsive">
      <table className="table table-bordered table-hover align-middle">
        <thead className="table-light">
          <tr>
            <th>股票名稱</th>
            <th>最新價</th>
            <th>漲跌</th>
            <th className="text-nowrap">幅度</th>
            <th>開盤</th>
            <th>最高</th>
            <th>最低</th>
            <th className="text-nowrap">成交量(張)</th>
            <th className="text-nowrap">五檔買價 (數量)</th>
            <th className="text-nowrap">五檔賣價 (數量)</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {stockData.length > 0 ? (
            stockData.map((stock, index) => (
              <tr key={stock.id || index}>
                <td className="fw-bold">
                  {stock.n} ({stock.c})
                </td>
                <td
                  key={`price-${stock.lastUpdated}`}
                  className={`fw-bold ${styles["flash-update"]}`}
                >
                  {formatPrices(stock.currentPrice?.toString()) || "-"}
                </td>
                <td
                  key={`change-${stock.lastUpdated}`}
                  className={styles["flash-update"]}
                >
                  {stock.changePoints !== undefined ? (
                    <span
                      className={
                        stock.changePoints > 0
                          ? "text-danger"
                          : stock.changePoints < 0
                            ? "text-success"
                            : ""
                      }
                    >
                      {stock.changePoints > 0 ? "+" : ""}
                      {stock.changePoints === 0
                        ? "-"
                        : stock.changePoints.toFixed(2)}
                    </span>
                  ) : (
                    "N/A"
                  )}
                </td>
                <td>
                  {stock.changePercent !== undefined ? (
                    <span
                      className={
                        stock.changePercent > 0
                          ? "text-danger"
                          : stock.changePercent < 0
                            ? "text-success"
                            : ""
                      }
                    >
                      {stock.changePercent > 0 ? "+" : ""}
                      {stock.changePercent.toFixed(2)}%
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td>{formatPrices(stock.o) || "-"}</td>
                <td>{formatPrices(stock.h) || "-"}</td>
                <td>{formatPrices(stock.l) || "-"}</td>
                <td className="text-nowrap">{stock.v || "-"}</td>
                <td className="text-nowrap" style={{ fontSize: "0.85rem" }}>
                  {stock.bidCombined && stock.bidCombined.length > 0 ? (
                    <div className="d-flex flex-column gap-1">
                      {stock.bidCombined.map((combined, i) => (
                        <div key={i}>{combined}</div>
                      ))}
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="text-nowrap" style={{ fontSize: "0.85rem" }}>
                  {stock.askCombined && stock.askCombined.length > 0 ? (
                    <div className="d-flex flex-column gap-1">
                      {stock.askCombined.map((combined, i) => (
                        <div key={i}>{combined}</div>
                      ))}
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  <button
                    className="btn btn-sm btn-outline-danger text-nowrap"
                    onClick={() => stock.id && onRemove(stock.id)}
                    disabled={!stock.id || isRemoveLoading}
                  >
                    {isRemoveLoading ? "正在刪除..." : "刪除股票"}
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={11} className="text-center text-muted py-4">
                無數據可顯示
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default StockTable;
