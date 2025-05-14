/* eslint-disable prettier/prettier */
import React, { useState, useEffect } from "react";
import { TwseStock, StockListItem } from "./types";
import {
  fetchStockList,
  fetchStockData,
  addStockCode,
  removeStockCode,
  fetchStockData2,
} from "./api/stockApi";
import { printValue } from "../../utils/createElement";
import { formatPrices } from "../../utils/format";
import { Button, Modal } from "react-bootstrap";
import LoadingOverlay from "../../components/common/loadingOverlay";
import SEO from "../../components/common/seo/seo";

const StockInfoPage: React.FC = () => {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth); //監聽視窗大小
  const [stockData, setStockData] = useState<TwseStock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stockList, setStockList] = useState<StockListItem[]>(
    [] // 用來儲存 id 和 code
  );
  const [newStockCode, setNewStockCode] = useState("");
  const [showDelModal, setShowDelModal] = useState(false); //控制刪除提示視窗
  const [removeId, setRemoveId] = useState<number | undefined>(undefined); //要刪除的id
  const [isRemoveLoading, setIsRemoveLoading] = useState(false); //刪除時的狀態
  const [isAddLoading, setIsAddLoading] = useState(false); //新增時的狀態

  const getStockListAndData = async () => {
    setIsLoading(true);
    try {
      const response = await fetchStockList();
      if (Array.isArray(response)) {
        setStockList(response); // 更新 stockList（觸發 useEffect，但我們會移除）
        // 直接接著抓資料
        const codeStr = response.map((item) => `tse_${item.code}.tw`).join("|");
        const parsedStocks = await fetchStockData(codeStr);
        // await fetchStockData2();

        const stocksWithId = parsedStocks?.map((stock) => {
          const stockCode = stock.ch.replace(".tw", "");
          const matchedStock = response.find((s) => s.code === stockCode);
          return { ...stock, id: matchedStock ? matchedStock.id : undefined };
        });

        setStockData(stocksWithId ?? []);
        setError(null);
      } else {
        throw new Error("stockCodes 不是陣列");
      }
    } catch (err: any) {
      console.error("錯誤:", err.message);
      setError("資料載入失敗：" + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getStockData = async () => {
    if (!stockList) return;

    try {
      setIsLoading(true);
      // 使用 stockCodes 來組合成代號字串
      const codeStr = stockList
        .map((item: StockListItem) => `tse_${item.code}.tw`)
        .join("|");
      const parsedStocks = await fetchStockData(codeStr);

      // 將 id 補進來
      const stocksWithId = parsedStocks?.map((stock: TwseStock) => {
        const stockCode = stock.ch.replace(".tw", "");
        const matchedStock = stockList.find((s) => s.code === stockCode);
        return { ...stock, id: matchedStock ? matchedStock.id : undefined };
      });

      setStockData(stocksWithId ?? []);
      setError(null);
      setIsLoading(false);
    } catch (error: any) {
      console.error("Error fetching stock data:", error.message);
      setError(`無法獲取股票數據：${error.message}`);
      // setStockData([]);
      setIsLoading(false);
    }
  };

  const handleAddStockCode = async () => {
    if (!newStockCode) return;

    let formattedCode = newStockCode.trim();
    if (/^\d{4}$/.test(formattedCode)) {
      formattedCode = `${formattedCode}`;
    }

    setIsAddLoading(true); // 開始新增，設為 loading

    try {
      await addStockCode(formattedCode);
      setNewStockCode("");
      await getStockListAndData(); // 確保等待資料刷新完成
      setError(null); // 清除錯誤
    } catch (error) {
      console.error("Error adding stock code:", error);
      setError("無法新增股票代號");
    } finally {
      setIsAddLoading(false); // 結束 loading
    }
  };

  const handleRemoveStockCode = async () => {
    if (!removeId) return;

    // 設定刪除狀態
    setIsRemoveLoading(true);

    try {
      await removeStockCode(removeId);
      getStockListAndData(); // 重新抓取股票清單
    } catch (error) {
      console.error("Error deleting stock code:", error);
      setError("無法刪除股票代號");
    } finally {
      // 設定刪除狀態結束
      setIsRemoveLoading(false);
    }
  };

  let ignore = true; // 用於判斷是否忽略請求
  useEffect(() => {
    if (ignore) {
      getStockListAndData();
    }

    ignore = false; // 清除時設置為 false
  }, []); // 只在組件初始化時執行

  useEffect(() => {
    if (isAutoRefresh) {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            getStockData();
            return 0;
          }
          return prev + 20;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isAutoRefresh, stockList]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isDesktop = windowWidth >= 992; // 判斷是否為桌面版

  return (
    <div className="container py-4">
      <>
        <SEO
          title="子yee 萬事屋 | 台股資訊 - 即時股市數據"
          description="子yee 萬事屋提供台股資訊與即時股市數據，幫助您掌握投資機會！"
          keywords="子yee 萬事屋, 台股資訊, 股市數據, 投資機會"
        />
        <div
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            opacity: 0,
          }}
        >
          <h1>台股資訊</h1>
          <p>查看最新的台股數據...</p>
        </div>
      </>
      {/* Loading Spinner Overlay */}
      <LoadingOverlay isLoading={isLoading} />
      <h1 className="mb-4 text-center">台股資訊</h1>
      {/* <div className="text-start">{printValue(stockData)}</div> */}
      {/* <div className="text-start">{printValue(stockList)}</div> */}

      {/* 模式切換 */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div className="form-check form-switch">
          <input
            className="form-check-input"
            type="checkbox"
            id="refreshModeSwitch"
            checked={isAutoRefresh}
            onChange={() => {
              setIsAutoRefresh(!isAutoRefresh);
              setProgress(0);
            }}
          />
          <label className="form-check-label" htmlFor="refreshModeSwitch">
            {isAutoRefresh ? "自動刷新開啟" : "手動刷新"}
          </label>
        </div>
        {!isAutoRefresh && (
          <button
            className="btn btn-primary"
            onClick={getStockListAndData}
            disabled={isLoading}
          >
            {isLoading ? "正在刷新..." : "刷新"}
          </button>
        )}
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center mb-4">
          <span>{error}</span>
          <button
            className="btn btn-sm btn-outline-danger"
            onClick={getStockListAndData}
          >
            重試
          </button>
        </div>
      )}

      {/* 新增股票代號 */}
      <div className="input-group mb-3">
        <input
          type="text"
          className="form-control"
          placeholder="輸入股票代號 (如 2330)"
          value={newStockCode}
          onChange={(e) => setNewStockCode(e.target.value)}
        />
        <button
          className="btn btn-outline-secondary"
          onClick={handleAddStockCode}
          disabled={!newStockCode || isAddLoading}
        >
          {isAddLoading ? "新增中..." : "新增"}
        </button>
      </div>

      {/* 股票數據 */}
      {!error && (
        <>
          {/* 桌機版：表格呈現 */}
          {isDesktop ? (
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
                      <tr key={index}>
                        <td>
                          {stock.n} ({stock.c})
                        </td>
                        <td>
                          {formatPrices(stock.currentPrice?.toString()) || "-"}
                        </td>
                        <td>
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
                        <td className="text-nowrap">
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
                        <td className="text-nowrap">
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
                            onClick={() => {
                              setShowDelModal(true);
                              setRemoveId(stock.id);
                            }}
                            disabled={!stock.id || isRemoveLoading}
                          >
                            {isRemoveLoading ? "正在刪除..." : "刪除股票"}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="text-center text-muted">
                        無數據可顯示
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            // 手機/平板版：每檔一個手風琴
            <div className="row">
              {stockData.map((stock, index) => (
                <div className="col-12 mb-3" key={index}>
                  <div className="d-flex justify-content-between align-items-top mb-3">
                    <div className="m-2">
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => {
                          setShowDelModal(true);
                          setRemoveId(stock.id);
                        }}
                        disabled={!stock.id || isRemoveLoading}
                      >
                        {isRemoveLoading ? "正在刪除..." : "刪除股票"}
                      </button>
                    </div>
                    <div
                      className="accordion"
                      id={`accordion-${index}`}
                      style={{ flex: 1 }}
                    >
                      <div className="accordion-item">
                        <h2
                          className="accordion-header"
                          id={`heading-${index}`}
                        >
                          <button
                            className="accordion-button collapsed"
                            type="button"
                            data-bs-toggle="collapse"
                            data-bs-target={`#collapse-${index}`}
                            aria-expanded="false"
                            aria-controls={`collapse-${index}`}
                          >
                            {stock.n} ({stock.c})
                          </button>
                        </h2>
                        <div
                          id={`collapse-${index}`}
                          className="accordion-collapse collapse"
                          aria-labelledby={`heading-${index}`}
                        >
                          <div className="accordion-body">
                            {[
                              {
                                label: "最新價",
                                value: formatPrices(
                                  stock.currentPrice?.toString()
                                ),
                              },
                              { label: "漲跌", value: stock.changePoints },
                              {
                                label: "幅度",
                                value: stock.changePercent,
                              },
                              { label: "開盤價", value: formatPrices(stock.o) },
                              { label: "最高價", value: formatPrices(stock.h) },
                              { label: "最低價", value: formatPrices(stock.l) },
                              {
                                label: "成交量 (張)",
                                value: stock.v ? `${stock.v}` : "N/A",
                              },
                            ].map((item, idx) => (
                              <>
                                {item.label === "漲跌" &&
                                typeof item.value === "number" ? (
                                  <div
                                    key={idx}
                                    className="d-flex border-bottom py-2"
                                  >
                                    <div
                                      className="fw-bold text-start"
                                      style={{ width: "50%" }}
                                    >
                                      {item.label}
                                    </div>
                                    <div
                                      className="text-start"
                                      style={{
                                        width: "50%",
                                        color:
                                          item.value > 0
                                            ? "red" // 漲則顯示紅色
                                            : item.value < 0
                                              ? "green" // 跌則顯示綠色
                                              : "inherit", // 其他狀況（例如為 0 或 undefined）使用默認顏色
                                      }}
                                    >
                                      {item.value !== undefined
                                        ? `${item.value.toFixed(2)}`
                                        : "N/A"}
                                    </div>
                                  </div>
                                ) : item.label === "幅度" &&
                                  typeof item.value === "number" ? (
                                  <div
                                    key={idx}
                                    className="d-flex border-bottom py-2"
                                  >
                                    <div
                                      className="fw-bold text-start"
                                      style={{ width: "50%" }}
                                    >
                                      {item.label}
                                    </div>
                                    <div
                                      className="text-start"
                                      style={{
                                        width: "50%",
                                        color:
                                          item.value > 0
                                            ? "red" // 漲則顯示紅色
                                            : item.value < 0
                                              ? "green" // 跌則顯示綠色
                                              : "inherit", // 其他狀況（例如為 0 或 undefined）使用默認顏色
                                      }}
                                    >
                                      {item.value !== undefined
                                        ? `${item.value.toFixed(2)}%`
                                        : "N/A"}
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    key={idx}
                                    className="d-flex border-bottom py-2"
                                  >
                                    <div
                                      className="fw-bold text-start"
                                      style={{ width: "50%" }}
                                    >
                                      {item.label}
                                    </div>
                                    <div
                                      className="text-start"
                                      style={{ width: "50%" }}
                                    >
                                      {item.value !== undefined
                                        ? item.value
                                        : "N/A"}
                                    </div>
                                  </div>
                                )}
                              </>
                            ))}

                            {/* 五檔買價（數量） */}
                            <div className="d-flex border-bottom py-2">
                              <div
                                className="fw-bold text-start"
                                style={{ width: "50%" }}
                              >
                                五檔買價（數量）
                              </div>
                              <div
                                className="text-start"
                                style={{ width: "50%" }}
                              >
                                {stock.bidCombined &&
                                stock.bidCombined.length > 0 ? (
                                  <div>
                                    {stock.bidCombined.map((combined, idx) => (
                                      <div key={idx} className="text-nowrap">
                                        {combined}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  "N/A"
                                )}
                              </div>
                            </div>

                            {/* 五檔賣價（數量） */}
                            <div className="d-flex py-2">
                              <div
                                className="fw-bold text-start"
                                style={{ width: "50%" }}
                              >
                                五檔賣價（數量）
                              </div>
                              <div
                                className="text-start"
                                style={{ width: "50%" }}
                              >
                                {stock.askCombined &&
                                stock.askCombined.length > 0 ? (
                                  <div>
                                    {stock.askCombined.map((combined, idx) => (
                                      <div key={idx} className="text-nowrap">
                                        {combined}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  "N/A"
                                )}
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
          )}
        </>
      )}

      {/* 確認刪除 Modal */}
      <Modal
        show={showDelModal}
        onHide={() => {
          setRemoveId(undefined);
          setShowDelModal(false);
        }}
      >
        <Modal.Header closeButton>
          <Modal.Title>確認刪除</Modal.Title>
        </Modal.Header>
        <Modal.Body>您確定要刪除這隻股票嗎？這將無法復原。</Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => {
              setRemoveId(undefined);
              setShowDelModal(false);
            }}
          >
            取消
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (removeId) {
                handleRemoveStockCode();
                setShowDelModal(false);
              }
            }}
          >
            確定刪除
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default StockInfoPage;
