/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import styles from "../styles/invoice.module.css";
import { LotteryPeriod, CheckResult } from "../types";
import { getAllWinningLists } from "../api/invoiceApi";
import { parseInvoiceQRCode, fullCheck } from "../utils";
import { useToast } from "@/components/common/Toast";
import { playWinSound, playLoseSound } from "@/utils/soundEffects";

interface ScannedInvoice {
  id: string; // 唯一識別碼 (避免 key error)
  number: string;
  period: string; // 格式化後的期別
  result: CheckResult;
  timestamp: Date;
}

const QrScanner: React.FC = () => {
  const [allPeriods, setAllPeriods] = useState<LotteryPeriod[]>([]);
  const [scannedList, setScannedList] = useState<ScannedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<
    boolean | null
  >(null);

  // 防止重複掃描（短期記憶）
  const lastScannedRef = useRef<string | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = "reader";

  const toast = useToast();

  // 手動重試權限
  const [retryCount, setRetryCount] = useState(0);
  const handleRetryPermission = () => {
    setError(null);
    setHasCameraPermission(null);
    setRetryCount((prev) => prev + 1);
  };

  // 1. 載入中獎號碼資料
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const periods = await getAllWinningLists();
      setAllPeriods(periods);
    } catch (err) {
      console.error("Failed to load lottery data:", err);
      setError("無法載入中獎號碼資料");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 2. 初始化並啟動掃描器
  useEffect(() => {
    let isMounted = true;
    let html5QrCode: Html5Qrcode | null = null;

    const startScanner = async () => {
      // 確保 DOM 元素存在且資料已載入
      // 注意：這裡不擋 error，因為 error 可能是上次失敗的狀態，retry 時會先被清除或我們希望它重跑
      if (loading || !document.getElementById(scannerContainerId)) return;

      // 如果已經有實例，先清理舊的 (雖然 cleanup 會做，但以防萬一)
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            await html5QrCodeRef.current.stop();
          }
          html5QrCodeRef.current.clear();
        } catch (e) {
          console.warn("Cleanup previous scanner failed", e);
        }
        html5QrCodeRef.current = null;
      }

      try {
        html5QrCode = new Html5Qrcode(scannerContainerId);
        html5QrCodeRef.current = html5QrCode;

        // 取得相機列表
        const cameras = await Html5Qrcode.getCameras().catch((err) => {
          console.warn("Unable to get cameras", err);
          throw new Error("Permission Denied or No Cameras");
        });

        if (!isMounted) return;

        if (cameras && cameras.length > 0) {
          setHasCameraPermission(true);
          setError(null); // 清除錯誤

          // 優先使用後鏡頭
          const cameraId = cameras[0].id; // 預設第一個
          // 嘗試尋找後鏡頭
          const backCamera = cameras.find((cam) =>
            cam.label.toLowerCase().includes("back")
          );
          const targetId = backCamera ? backCamera.id : cameraId;

          if (!html5QrCodeRef.current) return;

          await html5QrCode.start(
            targetId,
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0,
            },
            (decodedText) => {
              if (!isMounted) return;
              handleScanSuccess(decodedText);
            },
            (_errorMessage) => {
              // 掃描失敗忽略
            }
          );

          if (isMounted) setIsScanning(true);
        } else {
          if (isMounted) {
            setHasCameraPermission(false);
            setError("找不到相機裝置");
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error("Error starting scanner:", err);
          setHasCameraPermission(false);
          setError("無法啟動相機，請確認權限");
        }
      }
    };

    // 延遲啟動以確保 DOM render 完成
    const timer = setTimeout(startScanner, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);

      // 清理掃描器
      if (html5QrCodeRef.current) {
        const scannerToStop = html5QrCodeRef.current;
        html5QrCodeRef.current = null; // 立即清除 ref 防止重複調用

        // 停止掃描並清理
        (async () => {
          try {
            if (scannerToStop.isScanning) {
              await scannerToStop.stop();
            }
            await scannerToStop.clear();
          } catch (err) {
            console.error("Failed to cleanup scanner:", err);
          }
        })();
      }
    };
  }, [loading, allPeriods, retryCount]); // 加入 retryCount

  const handleScanSuccess = (decodedText: string) => {
    // 解析發票 QR Code
    const invoiceData = parseInvoiceQRCode(decodedText);

    if (!invoiceData) {
      // console.log("非發票 QR Code:", decodedText);
      return;
    }

    // 防抖動：檢查是否與上一張相同
    const scanKey = `${invoiceData.period}-${invoiceData.number}`;
    if (lastScannedRef.current === scanKey) {
      return;
    }

    lastScannedRef.current = scanKey;
    setTimeout(() => {
      lastScannedRef.current = null;
    }, 3000);

    // 開始對獎
    const periodData = allPeriods.find((p) => p.period === invoiceData.period);

    if (!periodData) {
      toast.warning(`期別 ${invoiceData.period} 尚未開獎或無資料`);
      return;
    }

    const result = fullCheck(invoiceData.number, periodData);

    if (result.isWinner) {
      playWinSound(); // 播放中獎音效
      toast.success(
        `🎉 中獎了！${invoiceData.period} ${invoiceData.number} - ${result.prize?.name} ${result.prize?.amount ? `$${result.prize.amount}` : ""}`
      );
    } else {
      playLoseSound(); // 播放未中獎音效
      toast.info(`😢 沒中獎 - ${invoiceData.period} ${invoiceData.number}`);
    }

    const newRecord: ScannedInvoice = {
      id: crypto.randomUUID(),
      number: invoiceData.number,
      period: invoiceData.period,
      result: result,
      timestamp: new Date(),
    };

    setScannedList((prev) => [newRecord, ...prev]);
  };

  return (
    <div className={styles.glassCard}>
      <h2 className="text-center text-white mb-4">📷 掃描電子發票</h2>

      {loading && <div className="text-center text-white">載入資料中...</div>}

      {/* 權限錯誤處理 UI */}
      {!loading && hasCameraPermission === false && (
        <div className="text-center p-4">
          <div className="text-danger mb-3" style={{ fontSize: "3rem" }}>
            🔒
          </div>
          <h4 className="text-white mb-3">無法存取相機</h4>
          <p className="text-white-50 mb-4">
            請檢查瀏覽器網址列的相機圖示，
            <br />
            確認已設定為「允許」存取。
          </p>
          <button
            className="btn btn-primary px-4 py-2"
            onClick={handleRetryPermission}
          >
            重新啟動相機
          </button>
        </div>
      )}

      {/* 一般錯誤 (非權限相關) */}
      {!loading && error && hasCameraPermission !== false && (
        <div className="text-center p-4">
          <div className="text-danger mb-3" style={{ fontSize: "3rem" }}>
            ⚠️
          </div>
          <p className="text-danger mb-4">{error}</p>
          <button className="btn btn-warning px-4 py-2" onClick={loadData}>
            🔄 重新載入
          </button>
        </div>
      )}

      {!loading && !error && hasCameraPermission !== false && (
        <>
          <div className="position-relative mb-3">
            <div
              id={scannerContainerId}
              className={styles.scannerContainer}
            ></div>
            {!isScanning && (
              <div className="position-absolute top-50 start-50 translate-middle text-white fw-bold">
                📷 啟動相機中...
              </div>
            )}
          </div>

          <div className={styles.scannerHint}>
            請將電子發票 QR Code 對準框框
          </div>

          {/* 掃描歷史紀錄 */}
          {scannedList.length > 0 && (
            <div className="mt-4">
              <h3 className="text-white text-lg mb-3 border-bottom pb-2">
                掃描紀錄
              </h3>
              <div className={styles.historyList}>
                {scannedList.map((record) => (
                  <div
                    key={record.id}
                    className={`${styles.historyItem} ${record.result.isWinner ? styles.historyWin : ""}`}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <div className="text-white-50 text-xs">
                          {record.period}
                        </div>
                        <div className="fw-bold text-white fs-5 font-monospace">
                          {record.number}
                        </div>
                      </div>
                      <div className="text-end">
                        {record.result.isWinner ? (
                          <>
                            <div className="badge bg-danger mb-1">
                              {record.result.prize?.name}
                            </div>
                            <div className="text-warning fw-bold">
                              {record.result.prize?.amount
                                ? `$${record.result.prize.amount}`
                                : "金額依實際領獎"}
                            </div>
                          </>
                        ) : (
                          <div className="badge bg-secondary">未中獎</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default QrScanner;
