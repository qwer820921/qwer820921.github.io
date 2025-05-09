import React, { useState, useEffect } from "react";
import { TwseStock, StockListItem } from "./types";
import {
  fetchStockList,
  fetchStockData,
  addStockCode,
  removeStockCode,
} from "./api/stockApi";
import { printValue } from "../../utils/createElement";

const StockInfoPage: React.FC = () => {
  const [stockData, setStockData] = useState<TwseStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stockList, setStockList] = useState<StockListItem[]>(
    [] // 用來儲存 id 和 code
  );
  const [newStockCode, setNewStockCode] = useState("");

  const getStockList = async () => {
    try {
      const response = await fetchStockList();

      // 假設 response 是物件，其中包含 stockCodes 陣列
      if (Array.isArray(response)) {
        const stockList = response; // 直接從 stockCodes 中取得陣列
        setStockList(stockList); // 更新股票清單（包含 id 和 code）
      } else {
        throw new Error("stockCodes 不是陣列");
      }
    } catch (err: any) {
      console.error("Error fetching stock list:", err.message);
      setError("無法獲取股票代號清單");
    }
  };

  const getStockData = async () => {
    if (!stockList) return;

    try {
      setLoading(true);
      // 使用 stockCodes 來組合成代號字串
      const codeStr = stockList
        .map((item: StockListItem) => `tse_${item.code}.tw`)
        .join("|");
      const parsedStocks = await fetchStockData(codeStr);

      // 將 id 補進來
      const stocksWithId = parsedStocks
        ?.filter((stock: TwseStock) => stock.ch) // 只保留有 ch 的資料
        .map((stock: TwseStock) => {
          const stockCode = stock.ch.replace(".tw", "");
          const matchedStock = stockList.find((s) => s.code === stockCode);
          return { ...stock, id: matchedStock ? matchedStock.id : undefined };
        });

      setStockData(stocksWithId ?? []);
      setError(null);
      setLoading(false);
    } catch (error: any) {
      console.error("Error fetching stock data:", error.message);
      setError(`無法獲取股票數據：${error.message}`);
      setStockData([]);
      setLoading(false);
    }
  };

  const handleAddStockCode = async () => {
    if (!newStockCode) return;

    // 自動補齊格式：如果是純數字，轉為 tse_2330.tw 格式
    let formattedCode = newStockCode.trim();
    if (/^\d{4}$/.test(formattedCode)) {
      formattedCode = `tse_${formattedCode}.tw`;
    }

    try {
      await addStockCode(formattedCode);
      setNewStockCode("");
      getStockList();
    } catch (error) {
      console.error("Error adding stock code:", error);
      setError("無法新增股票代號");
    }
  };

  const handleRemoveStockCode = async (id?: number) => {
    if (!id) return;
    try {
      await removeStockCode(id);
      getStockList(); // 重新抓取股票清單
    } catch (error) {
      console.error("Error deleting stock code:", error);
      setError("無法刪除股票代號");
    }
  };

  let ignore = true; // 用於判斷是否忽略請求
  useEffect(() => {
    if (ignore) {
      getStockList();
    }

    ignore = false; // 清除時設置為 false
  }, []); // 只在組件初始化時執行

  useEffect(() => {
    if (stockList.length > 0) {
      getStockData();
    }
  }, [stockList]);

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

  return (
    <div className="container py-4">
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
            onClick={getStockData}
            disabled={loading}
          >
            {loading ? "正在刷新..." : "刷新"}
          </button>
        )}
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center mb-4">
          <span>{error}</span>
          <button
            className="btn btn-sm btn-outline-danger"
            onClick={getStockData}
          >
            重試
          </button>
        </div>
      )}

      {/* 加載狀態 */}
      {loading && !error && (
        <div className="text-center mb-4">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">正在加載...</span>
          </div>
          <p className="mt-2">正在加載...</p>
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
        >
          新增
        </button>
      </div>

      {/* 股票數據 */}
      {!error && (
        <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4">
          {stockData.length > 0 ? (
            stockData.map((stock: TwseStock, index: number) => (
              <div key={index} className="col">
                <div className="card h-100">
                  <div className="card-body">
                    <h5 className="card-title">
                      {stock.n} ({stock.c})
                    </h5>
                    <p className="card-text">最新價: {stock.z || "N/A"}</p>
                    <p className="card-text">開盤價: {stock.o || "N/A"}</p>
                    <p className="card-text">最高價: {stock.h || "N/A"}</p>
                    <p className="card-text">最低價: {stock.l || "N/A"}</p>
                    <p className="card-text">成交量: {stock.v || "N/A"} 張</p>
                    <p className="card-text">
                      五檔買價: {stock.bidPrices?.join(", ") || "N/A"}
                    </p>
                    <p className="card-text">
                      五檔賣價: {stock.askPrices?.join(", ") || "N/A"}
                    </p>
                    <button
                      className="btn btn-sm btn-outline-danger mt-2"
                      onClick={() => handleRemoveStockCode(stock.id)}
                      disabled={!stock.id}
                    >
                      刪除股票
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col">
              <p className="text-muted text-center">無數據可顯示</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StockInfoPage;
