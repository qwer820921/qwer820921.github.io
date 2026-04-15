import React from "react";
import { TwseStock } from "../types";
import { formatPrices } from "@/utils/format";

interface StockCardListProps {
  stockData: (TwseStock & { id?: number; lastUpdated?: number })[];
  isRemoveLoading: boolean;
  onRemove: (id: number) => void;
}

const StockCardList: React.FC<StockCardListProps> = ({
  stockData,
  isRemoveLoading,
  onRemove,
}) => {
  return (
    <div className="row">
      {stockData.map((stock, index) => (
        <div className="col-12 mb-3" key={stock.id || index}>
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white d-flex justify-content-between align-items-center py-3 border-0">
              <h5 className="mb-0 fw-bold text-dark">
                {stock.n}{" "}
                <small className="text-muted fw-normal">({stock.c})</small>
              </h5>
              <button
                className="btn btn-sm btn-outline-danger"
                onClick={() => stock.id && onRemove(stock.id)}
                disabled={!stock.id || isRemoveLoading}
              >
                {isRemoveLoading ? "處理中" : "刪除"}
              </button>
            </div>
            <div className="card-body pt-0">
              <div
                className="accordion accordion-flush"
                id={`accordion-${index}`}
              >
                <div className="accordion-item border-0">
                  <h2 className="accordion-header" id={`heading-${index}`}>
                    <button
                      key={stock.lastUpdated}
                      className="accordion-button collapsed px-0 shadow-none flash-update"
                      type="button"
                      data-bs-toggle="collapse"
                      data-bs-target={`#collapse-${index}`}
                      style={{ backgroundColor: "transparent" }}
                    >
                      <div className="d-flex w-100 justify-content-between pe-3">
                        <div className="fw-bold">
                          最新價:{" "}
                          <span className="ms-1">
                            {formatPrices(stock.currentPrice?.toString()) ||
                              "-"}
                          </span>
                        </div>
                        <div
                          className={
                            (stock.changePercent ?? 0) > 0
                              ? "text-danger"
                              : (stock.changePercent ?? 0) < 0
                                ? "text-success"
                                : ""
                          }
                          style={{ fontWeight: 600 }}
                        >
                          {(stock.changePercent ?? 0) > 0
                            ? "▲"
                            : (stock.changePercent ?? 0) < 0
                              ? "▼"
                              : ""}
                          {stock.changePercent?.toFixed(2) ?? "0.00"}%
                        </div>
                      </div>
                    </button>
                  </h2>
                  <div
                    id={`collapse-${index}`}
                    className="accordion-collapse collapse"
                    data-bs-parent={`#accordion-${index}`}
                  >
                    <div className="accordion-body px-0 py-2 border-top">
                      <DetailRow label="昨收價" value={formatPrices(stock.y)} />
                      <DetailRow label="開盤價" value={formatPrices(stock.o)} />
                      <DetailRow label="最高價" value={formatPrices(stock.h)} />
                      <DetailRow label="最低價" value={formatPrices(stock.l)} />
                      <DetailRow
                        label="漲跌點數"
                        value={stock.changePoints?.toFixed(2)}
                        color={
                          (stock.changePoints ?? 0) > 0
                            ? "#dc3545"
                            : (stock.changePoints ?? 0) < 0
                              ? "#198754"
                              : "inherit"
                        }
                      />
                      <DetailRow label="成交量 (張)" value={stock.v} />

                      <div className="row mt-3 g-2">
                        <div className="col-6">
                          <div className="bg-light p-2 rounded">
                            <div className="fw-bold small mb-1 text-primary">
                              五檔買價 (數量)
                            </div>
                            <div style={{ fontSize: "0.75rem" }}>
                              {stock.bidCombined?.map((item, i) => (
                                <div
                                  key={i}
                                  className="py-1 border-bottom-dashed text-nowrap"
                                >
                                  {item}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="col-6">
                          <div className="bg-light p-2 rounded">
                            <div className="fw-bold small mb-1 text-danger">
                              五檔賣價 (數量)
                            </div>
                            <div style={{ fontSize: "0.75rem" }}>
                              {stock.askCombined?.map((item, i) => (
                                <div
                                  key={i}
                                  className="py-1 border-bottom-dashed text-nowrap"
                                >
                                  {item}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const DetailRow = ({
  label,
  value,
  color,
}: {
  label: string;
  value: any;
  color?: string;
}) => (
  <div className="d-flex justify-content-between py-2 small">
    <div className="text-muted">{label}</div>
    <div style={{ color, fontWeight: 500 }}>{value ?? "-"}</div>
  </div>
);

export default StockCardList;
