"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Container, Row, Col, Button, Badge, Spinner } from "react-bootstrap";
import { gameApi, getOrCreatePlayerKey } from "../api/gameApi";
import styles from "../styles/shenmaSanguo.module.css";

type LogDirection = "send" | "receive" | "info" | "error";

interface BridgeLog {
  id: number;
  direction: LogDirection;
  timestamp: string;
  label: string;
  data: object | string;
}

let _logId = 0;

const ShenmaSanguoPage: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<BridgeLog[]>([]);

  // 各步驟的載入狀態
  const [step1Loading, setStep1Loading] = useState(false);
  const [step2Loading, setStep2Loading] = useState(false);
  const [step3Loading, setStep3Loading] = useState(false);

  // 步驟間傳遞的資料
  const gasDataRef = useRef<object | null>(null); // Step1 → Step2
  const godotResultRef = useRef<object | null>(null); // Step2 → Step3

  const addLog = useCallback(
    (direction: LogDirection, label: string, data: object | string) => {
      const now = new Date();
      const ts = `${now.getHours().toString().padStart(2, "0")}:${now
        .getMinutes()
        .toString()
        .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now
        .getMilliseconds()
        .toString()
        .padStart(3, "0")}`;
      setLogs((prev) => [
        { id: _logId++, direction, timestamp: ts, label, data },
        ...prev,
      ]);
    },
    []
  );

  // ── 監聽 Godot 回傳訊息 ──
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;
      if (event.data.__godot_bridge !== true) return;
      godotResultRef.current = event.data;
      addLog("receive", "Godot → Web", event.data);
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [addLog]);

  // 強制 8 秒後關閉 loading
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 8000);
    return () => clearTimeout(timer);
  }, []);

  const handleIframeLoad = () => setTimeout(() => setIsLoading(false), 500);

  // ══════════════════════════════════════════
  //  Step 1：從 GAS 抓取資料
  // ══════════════════════════════════════════
  const handleStep1 = async () => {
    setStep1Loading(true);
    addLog("info", "Step 1 開始", "呼叫 get_heroes_config + get_map_config...");
    try {
      const key = getOrCreatePlayerKey();
      addLog("info", "Player Key", { key });

      // 確保玩家資料存在
      let profile: object;
      try {
        const res = await gameApi.getProfile(key);
        profile = res.profile;
        addLog("receive", "GAS get_profile", res.profile);
      } catch (e: any) {
        if (e.message === "PROFILE_NOT_FOUND") {
          const res = await gameApi.createProfile(key, "旅行者");
          profile = { key, nickname: "旅行者", level: 1, gold: 500 };
          addLog("info", "GAS create_profile", res);
        } else {
          throw e;
        }
      }

      // 取得武將設定 + 地圖設定
      const [heroesRes, mapRes] = await Promise.all([
        gameApi.getHeroesConfig(),
        gameApi.getMapConfig("chapter1_1"),
      ]);
      addLog("receive", "GAS get_heroes_config", heroesRes);
      addLog("receive", "GAS get_map_config", mapRes);

      // 組合出征 payload
      const payload = {
        stage_id: "chapter1_1",
        player: profile,
        team_list: [
          { hero_id: "guan_yu", level: 1, star: 0, slot: 1 },
          { hero_id: "zhou_cang", level: 1, star: 0, slot: 2 },
        ],
        heroes_config: heroesRes.heroes,
        map: mapRes.map,
      };

      gasDataRef.current = payload;
      addLog("info", "Step 1 完成", "出征 Payload 已備妥，可執行 Step 2");
    } catch (e: any) {
      addLog("error", "Step 1 失敗", { error: e.message });
    } finally {
      setStep1Loading(false);
    }
  };

  // ══════════════════════════════════════════
  //  Step 2：傳送 Payload 至 Godot
  // ══════════════════════════════════════════
  const handleStep2 = () => {
    if (!gasDataRef.current) {
      addLog("error", "Step 2 跳過", "請先執行 Step 1");
      return;
    }
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      addLog("error", "Step 2 失敗", "iframe 尚未載入");
      return;
    }
    setStep2Loading(true);
    iframe.contentWindow.postMessage(gasDataRef.current, "*");
    addLog("send", "Web → Godot (postMessage)", gasDataRef.current);
    addLog("info", "Step 2 等待中", "等待 Godot 回傳結算結果...");
    // 等 Godot 回傳後 godotResultRef.current 會被更新
    setTimeout(() => setStep2Loading(false), 500);
  };

  // ══════════════════════════════════════════
  //  Step 3：將 Godot 結算結果存回 GAS
  // ══════════════════════════════════════════
  const handleStep3 = async () => {
    if (!godotResultRef.current) {
      addLog("error", "Step 3 跳過", "尚未收到 Godot 回傳結果");
      return;
    }
    setStep3Loading(true);
    addLog("info", "Step 3 開始", "呼叫 save_result...");
    try {
      const key = getOrCreatePlayerKey();
      const res = await gameApi.saveResult(key, godotResultRef.current);
      addLog("receive", "GAS save_result", res);
      addLog("info", "Step 3 完成", "結算已成功寫入 GAS");
    } catch (e: any) {
      addLog("error", "Step 3 失敗", { error: e.message });
    } finally {
      setStep3Loading(false);
    }
  };

  const clearLogs = () => setLogs([]);

  const badgeColor: Record<LogDirection, string> = {
    send: "primary",
    receive: "success",
    info: "secondary",
    error: "danger",
  };
  const badgeLabel: Record<LogDirection, string> = {
    send: "↑ SEND",
    receive: "↓ RECV",
    info: "● INFO",
    error: "✕ ERR",
  };

  return (
    <Container fluid className={styles.pageContainer}>
      <div className={styles.header}>
        <h1 className="mb-0">神馬三國</h1>
        <p className="text-muted mb-0">
          Phase 0 — GAS ↔ Web ↔ Godot 通訊 Demo
        </p>
      </div>

      <Row className="w-100" style={{ maxWidth: 1280 }}>
        {/* 左側：Godot iframe */}
        <Col xs={12} lg={7} className="mb-3">
          <div className={styles.gameWrapper}>
            {isLoading && (
              <div className={styles.loadingOverlay}>
                <p className={styles.loadingText}>載入戰場中...</p>
              </div>
            )}
            <iframe
              ref={iframeRef}
              src="/games/shenmaSanguo/index.html"
              className={styles.gameIframe}
              onLoad={handleIframeLoad}
              allow="autoplay; fullscreen"
              title="Shenma Sanguo Game"
            />
          </div>

          {/* Godot 端串接說明 */}
          <div className={styles.guide}>
            <h6 className="mb-2">Godot 端 — WebBridge.gd 使用方式</h6>
            <pre
              className={styles.codeBlock}
            >{`# 掛載到 Main 節點 (autoload 或 @onready)
# 確保場景匯出為 Web 平台

extends Node

func _ready():
    if OS.get_name() == "Web":
        # 接收 Web 傳來的 payload
        JavaScriptBridge.eval("""
            window.addEventListener('message', function(e) {
                if (e.data && e.data.stage_id) {
                    window._receive_payload(JSON.stringify(e.data));
                }
            });
        """)

var _js_cb = JavaScriptBridge.create_callback(_on_payload_received)

func _on_payload_received(args):
    var payload = JSON.parse_string(args[0])
    print("[Bridge] 收到 payload: ", payload)
    # 初始化關卡...

# 戰鬥結束後呼叫
func send_result(result: Dictionary):
    result["__godot_bridge"] = true
    if OS.get_name() == "Web":
        var json = JSON.stringify(result)
        JavaScriptBridge.eval(
            "window.parent.postMessage(%s, '*');" % json
        )`}</pre>
          </div>
        </Col>

        {/* 右側：通訊控制台 */}
        <Col xs={12} lg={5} className="mb-3">
          <div className={styles.console}>
            <div className={styles.consoleHeader}>
              <span className={styles.consoleTitle}>Bridge Console</span>
              <Button variant="outline-secondary" size="sm" onClick={clearLogs}>
                清除
              </Button>
            </div>

            {/* 三步驟控制 */}
            <div className={styles.stepSection}>
              <div className={styles.stepItem}>
                <div className={styles.stepLabel}>Step 1 — 從 GAS 讀取資料</div>
                <div className={styles.stepDesc}>
                  呼叫 get_profile + get_heroes_config + get_map_config
                </div>
                <Button
                  variant="outline-info"
                  size="sm"
                  className="w-100 mt-1"
                  onClick={handleStep1}
                  disabled={step1Loading}
                >
                  {step1Loading ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-1" />
                      讀取中...
                    </>
                  ) : (
                    "執行 Step 1"
                  )}
                </Button>
              </div>

              <div className={styles.stepArrow}>↓</div>

              <div className={styles.stepItem}>
                <div className={styles.stepLabel}>
                  Step 2 — 出征（Web → Godot）
                </div>
                <div className={styles.stepDesc}>
                  postMessage 傳送 Payload，等待 Godot 回傳結算
                </div>
                <Button
                  variant="outline-primary"
                  size="sm"
                  className="w-100 mt-1"
                  onClick={handleStep2}
                  disabled={step2Loading || !gasDataRef.current}
                >
                  {step2Loading ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-1" />
                      傳送中...
                    </>
                  ) : (
                    "執行 Step 2"
                  )}
                </Button>
              </div>

              <div className={styles.stepArrow}>↓</div>

              <div className={styles.stepItem}>
                <div className={styles.stepLabel}>Step 3 — 存回 GAS</div>
                <div className={styles.stepDesc}>
                  呼叫 save_result，將 Godot 結算結果寫入 battle_logs
                </div>
                <Button
                  variant="outline-success"
                  size="sm"
                  className="w-100 mt-1"
                  onClick={handleStep3}
                  disabled={step3Loading || !godotResultRef.current}
                >
                  {step3Loading ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-1" />
                      儲存中...
                    </>
                  ) : (
                    "執行 Step 3"
                  )}
                </Button>
              </div>
            </div>

            {/* 訊息日誌 */}
            <div className={styles.logSection}>
              <p className={styles.sectionLabel}>
                訊息日誌（{logs.length} 筆）
              </p>
              <div className={styles.logList}>
                {logs.length === 0 && (
                  <p className={styles.emptyLog}>點擊 Step 1 開始...</p>
                )}
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`${styles.logEntry} ${styles[`logEntry_${log.direction}`]}`}
                  >
                    <div className={styles.logMeta}>
                      <Badge
                        bg={badgeColor[log.direction]}
                        className={styles.logBadge}
                      >
                        {badgeLabel[log.direction]}
                      </Badge>
                      <span className={styles.logLabel}>{log.label}</span>
                      <span className={styles.logTime}>{log.timestamp}</span>
                    </div>
                    <pre className={styles.logData}>
                      {typeof log.data === "string"
                        ? log.data
                        : JSON.stringify(log.data, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Col>
      </Row>
    </Container>
  );
};

export default ShenmaSanguoPage;
