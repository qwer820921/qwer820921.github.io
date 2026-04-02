"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { TwseStock, StockListItem } from "../types";
import {
  fetchStockList,
  fetchStockDataTWSE,
  addStockCode,
  removeStockCode,
} from "../api/stockApi";

import { Modal, Button } from "react-bootstrap";
import "../styles/stockInfo.module.css";

// 子組件
import AddStockForm from "./AddStockForm";
import RefreshControl from "./RefreshControl";
import StockTable from "./StockTable";
import StockCardList from "./StockCardList";
import StockSkeleton from "./StockSkeleton";

const StockInfoPage: React.FC = () => {
  const [windowWidth, setWindowWidth] = useState(0);
  const [stockData, setStockData] = useState<(TwseStock & { id?: number })[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);
  const [stockList, setStockList] = useState<StockListItem[]>([]);
  const [newStockCode, setNewStockCode] = useState("");
  const [showDelModal, setShowDelModal] = useState(false);
  const [removeId, setRemoveId] = useState<number | undefined>(undefined);
  const [isRemoveLoading, setIsRemoveLoading] = useState(false);
  const [isAddLoading, setIsAddLoading] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMsg, setErrorModalMsg] = useState("");
  const isFetchingRef = React.useRef(false); // 請求鎖，防止連打

  // 1. 核心請求邏輯 (僅包裝在 useCallback 以穩定依賴)
  const fetchPrices = useCallback(async (currentList: StockListItem[]) => {
    if (isFetchingRef.current || !currentList.length) {
      if (!currentList.length) setStockData([]);
      return;
    }

    isFetchingRef.current = true;
    try {
      const codes = currentList.map((item) => item.code);
      const parsedStocks = await fetchStockDataTWSE(codes);

      const stocksWithId = parsedStocks
        ?.filter((stock) => stock && stock.c) // 過濾無效數據
        .map((stock: TwseStock) => {
          const stockCode = stock.c; // 直接使用純數字代碼
          const matchedStock = currentList.find((s) => s.code === stockCode);
          return {
            ...stock,
            id: matchedStock ? matchedStock.id : undefined,
            lastUpdated: Date.now(),
          };
        });

      setStockData(stocksWithId ?? []);
      setError(null);
    } catch (err: any) {
      console.error("Fetch Data Error:", err.message);
      setError(`資料刷新失敗：${err.message}`);
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  // 2. 獲取清單 (僅執行 read 操作)
  const getStockListOnly = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetchStockList();
      if (Array.isArray(response)) {
        setStockList(response);

        // [UX 優化] 第一階段：先將清單基本資料（名稱、代碼、市場）呈呈現畫面上
        const placeholderData = response.map((item) => ({
          c: item.code,
          n: item.name || "載入中...",
          id: item.id,
          ex: item.market || "",
          // 其餘價格欄位暫時留空，UI 會自動顯示 "-"
        })) as any[];

        setStockData(placeholderData);
        setIsFirstLoad(false);
      } else {
        throw new Error("無法獲取股票代號清單");
      }
    } catch (err: any) {
      setError("資料載入失敗：" + err.message);
    } finally {
      setIsLoading(false);
      setIsFirstLoad(false);
    }
  }, []);

  // 3. 核心數據同步器：當「清單」或「API 來源」變動時，更新價格
  useEffect(() => {
    if (stockList.length > 0) {
      fetchPrices(stockList);
    }
  }, [stockList, fetchPrices]);

  // 4. 純刷新數據 (外部手動點擊)
  const handleManualRefresh = useCallback(async () => {
    setIsLoading(true);
    await fetchPrices(stockList);
    setIsLoading(false);
  }, [fetchPrices, stockList]);

  // 5. 新增股票
  const handleAddStock = useCallback(async () => {
    if (!newStockCode) return;
    setIsAddLoading(true);
    try {
      const formattedCode = newStockCode.trim();
      const response = await addStockCode(formattedCode);

      // 檢查後端回傳的業務邏輯錯誤 (例如 200 OK 但含有 error 欄位的情況)
      if (response && response.error) {
        setErrorModalMsg(response.error);
        setShowErrorModal(true);
        setIsAddLoading(false);
        return;
      }

      // 新增成功後立即結束新增載入狀態
      setIsAddLoading(false);
      setNewStockCode("");

      // 非同步執行清單更新，不再阻塞新增按鈕的 Loading 狀態
      getStockListOnly();
      setError(null);
    } catch (error: any) {
      // 捕獲網路錯誤或 API 拋出的錯誤
      setErrorModalMsg(error.message);
      setShowErrorModal(true);
      setIsAddLoading(false);
    }
  }, [newStockCode, getStockListOnly]);

  // 6. 刪除股票
  const handleRemoveStock = useCallback(async () => {
    if (!removeId) return;
    setIsRemoveLoading(true);
    try {
      await removeStockCode(removeId);
      await getStockListOnly(); // 重新整理清單
      setShowDelModal(false);
    } catch (error: any) {
      setError(`刪除失敗：${error.message}`);
    } finally {
      setIsRemoveLoading(false);
      setRemoveId(undefined);
    }
  }, [removeId, getStockListOnly]);

  // 視窗大小監聽
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 初始化載入
  useEffect(() => {
    getStockListOnly();
  }, [getStockListOnly]);

  // 自動刷新時鐘 (5秒一次，不使用 progress state 以提升性能)
  useEffect(() => {
    if (isAutoRefresh && stockList.length > 0) {
      const interval = setInterval(() => {
        fetchPrices(stockList);
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [isAutoRefresh, stockList, fetchPrices]);

  const isDesktop = useMemo(() => windowWidth >= 992, [windowWidth]);

  return (
    <div
      className="container"
      style={{ paddingTop: "70px", minHeight: "100vh" }}
    >
      {/* SEO 隱藏元件 */}
      <h1 className="visually-hidden">台股資訊 - 即時報價系統</h1>

      <div className="row justify-content-center mb-4">
        <div className="col-12 col-lg-10">
          <h1 className="mb-4 text-center fw-bold text-primary">台股資訊</h1>

          {/* 刷新控制 */}
          <RefreshControl
            isAutoRefresh={isAutoRefresh}
            setIsAutoRefresh={setIsAutoRefresh}
            isLoading={isLoading}
            onRefresh={handleManualRefresh}
          />

          {/* 錯誤提示 */}
          {error && (
            <div className="alert alert-danger d-flex justify-content-between align-items-center mb-4 shadow-sm">
              <span>{error}</span>
              <Button
                variant="outline-danger"
                size="sm"
                onClick={getStockListOnly}
              >
                重試
              </Button>
            </div>
          )}

          {/* 新增股票表單 */}
          <AddStockForm
            newStockCode={newStockCode}
            setNewStockCode={setNewStockCode}
            isAddLoading={isAddLoading}
            onAdd={handleAddStock}
          />

          {/* 數據內容 */}
          <div className="mt-4">
            {isFirstLoad ? (
              <StockSkeleton />
            ) : (
              <>
                {isDesktop ? (
                  <StockTable
                    stockData={stockData}
                    isRemoveLoading={isRemoveLoading}
                    onRemove={(id) => {
                      setRemoveId(id);
                      setShowDelModal(true);
                    }}
                  />
                ) : (
                  <StockCardList
                    stockData={stockData}
                    isRemoveLoading={isRemoveLoading}
                    onRemove={(id) => {
                      setRemoveId(id);
                      setShowDelModal(true);
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 確認刪除對話框 */}
      <Modal show={showDelModal} onHide={() => setShowDelModal(false)} centered>
        <Modal.Header closeButton className="border-0 pb-0">
          <Modal.Title className="fw-bold">確認刪除</Modal.Title>
        </Modal.Header>
        <Modal.Body className="py-4">
          您確定要將這隻股票從清單中移除嗎？此動作將無法復原。
        </Modal.Body>
        <Modal.Footer className="border-0 pt-0">
          <Button variant="light" onClick={() => setShowDelModal(false)}>
            按錯了
          </Button>
          <Button
            variant="danger"
            onClick={handleRemoveStock}
            disabled={isRemoveLoading}
          >
            {isRemoveLoading ? "處理中..." : "確定刪除"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* 錯誤提示對話框 */}
      <Modal
        show={showErrorModal}
        onHide={() => setShowErrorModal(false)}
        centered
      >
        <Modal.Header closeButton className="border-0 pb-0 text-danger">
          <Modal.Title className="fw-bold">
            <i className="bi bi-exclamation-triangle-fill me-2"></i>
            發生錯誤
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="py-4">{errorModalMsg}</Modal.Body>
        <Modal.Footer className="border-0 pt-0">
          <Button variant="primary" onClick={() => setShowErrorModal(false)}>
            我知道了
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default StockInfoPage;
