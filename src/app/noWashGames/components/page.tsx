"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  UpgradeOption,
  GameAttribute,
  EffectType,
  GeneralShopItem,
  RelicItem,
  RelicEffectType,
  GameState,
  Rarity,
  PopupMessage,
} from "../types";
import {
  GameConfigs,
  getGameConfigs,
  loadPlayerSave,
  savePlayerProgress,
} from "../api/gameApi";

const INITIAL_STATE: GameState = {
  gold: 0,
  combo: 0,
  attributes: {
    [GameAttribute.STRENGTH]: { value: 10, bonusMultiplier: 1 },
    [GameAttribute.ATTACK_SPEED]: { value: 1, bonusMultiplier: 1 },
    [GameAttribute.CRITICAL_CHANCE]: { value: 5, bonusMultiplier: 1 },
    [GameAttribute.GOLD_BONUS]: { value: 0, bonusMultiplier: 1 },
  },
  stage: {
    currentLevel: 1,
    currentHp: 100,
    maxHp: 100,
    monsterName: "史萊姆",
    isLucky: false,
    isBoss: false,
    timer: 0,
    maxTimer: 0,
  },
  clickProgress: { currentClicks: 0, totalClicks: 0, pendingUpgrades: 0 },
  shop: { generalItems: [], relics: [] },
  ui: { isUpgradeModalOpen: false, currentOptions: [] },
};

export default function NoWashGamesPage() {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const [remoteConfigs, setRemoteConfigs] = useState<GameConfigs | null>(null);
  const [popups, setPopups] = useState<PopupMessage[]>([]);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [shopTab, setShopTab] = useState<"GENERAL" | "RELIC">("GENERAL");
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [saveKey, setSaveKey] = useState<string>("");

  // 初始化時從 localStorage 讀取 saveKey 並自動下載存檔
  useEffect(() => {
    const autoLoadSave = async () => {
      const storedKey = localStorage.getItem("noWashGames_saveKey");
      if (storedKey) {
        setSaveKey(storedKey);
        // 自動下載存檔
        try {
          const data = await loadPlayerSave(storedKey);
          if (data) {
            setGameState(data);
            setLastSaveTime(new Date());
          }
        } catch (error) {
          console.error("自動讀取存檔失敗:", error);
        }
      }
    };
    autoLoadSave();
  }, []);

  // 當 saveKey 變更時，自動存入 localStorage
  useEffect(() => {
    if (saveKey) {
      localStorage.setItem("noWashGames_saveKey", saveKey);
    }
  }, [saveKey]);
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // =============================================================================
  // 1. 輔助與計算
  // =============================================================================
  const triggerPopup = useCallback(
    (text: string, isClick: boolean, isCrit: boolean) => {
      const id = Math.random();
      setPopups((prev) => [...prev, { id, text, isClick, isCrit }]);
      setTimeout(
        () => setPopups((prev) => prev.filter((p) => p.id !== id)),
        800
      );
    },
    []
  );

  const currentStats = useMemo(() => {
    const attr = gameState.attributes;
    const str =
      attr[GameAttribute.STRENGTH].value *
      attr[GameAttribute.STRENGTH].bonusMultiplier;
    const spd =
      attr[GameAttribute.ATTACK_SPEED].value *
      attr[GameAttribute.ATTACK_SPEED].bonusMultiplier;
    const critRate = Math.min(
      (attr[GameAttribute.CRITICAL_CHANCE].value *
        attr[GameAttribute.CRITICAL_CHANCE].bonusMultiplier) /
        100,
      1
    );
    const goldBonus =
      (1 + attr[GameAttribute.GOLD_BONUS].value / 100) *
      attr[GameAttribute.GOLD_BONUS].bonusMultiplier;

    // 1. 基礎金幣加成 (Base): 來自商店或加法進化，例如 50 代表 +50%
    const goldBaseValue = attr[GameAttribute.GOLD_BONUS].value;

    // 2. 金幣倍率 (Multiplier): 來自乘法進化，例如 1.5 代表 1.5 倍
    const goldMulti = attr[GameAttribute.GOLD_BONUS].bonusMultiplier;

    // 3. 最終乘數 (Total Multiplier): 用於實際金幣獲得計算
    const finalGoldMultiplier = (1 + goldBaseValue / 100) * goldMulti;

    let baseDps = str * spd * (1 + critRate);
    gameState.shop.relics
      .filter((r) => r.isOwned)
      .forEach((relic) => {
        if (relic.relicEffect === RelicEffectType.FINAL_DAMAGE_BOOST)
          baseDps *= 1 + relic.effectValue;
        if (relic.relicEffect === RelicEffectType.COMBO_STREAK) {
          baseDps *= 1 + Math.min(gameState.combo * relic.effectValue, 0.5);
        }
      });
    return {
      dps: baseDps,
      goldMultiplier: goldBonus,
      critRate,
      displayGoldBase: goldBaseValue, // 顯示面板上的基礎值
      displayGoldMulti: goldMulti, // 顯示面板上的倍率
      displayGoldTotal: Math.round((finalGoldMultiplier - 1) * 100), // 顯示總加成百分比
    };
  }, [gameState.attributes, gameState.shop.relics, gameState.combo]);

  // =============================================================================
  // 2. 雲端同步
  // =============================================================================
  const handleSave = useCallback(
    async (isAuto = false) => {
      if (!saveKey) return;
      setIsSyncing(true);

      try {
        await savePlayerProgress(saveKey, gameState);
        setLastSaveTime(new Date());

        if (!isAuto) {
          alert("✅ 存檔上傳成功！您的進度已同步至雲端。");
          setIsSaveModalOpen(false);
        }
      } catch (error) {
        console.error("存檔失敗:", error);
      } finally {
        // 稍作延遲讓 UI 動畫順暢
        setTimeout(() => setIsSyncing(false), 1000);
      }
    },
    [saveKey, gameState]
  );

  const handleLoad = useCallback(
    async (isAuto = false) => {
      if (!saveKey) {
        if (!isAuto) alert("請輸入存檔代碼");
        return;
      }
      setIsSyncing(true);

      try {
        const data = await loadPlayerSave(saveKey);
        if (data) {
          setGameState(data);
          setLastSaveTime(new Date());
          if (!isAuto) {
            alert("📥 讀檔成功！歡迎回來，冒險者。");
            setIsSaveModalOpen(false);
          }
        } else {
          if (!isAuto) alert("❓ 找不到存檔。請確認代碼是否正確。");
        }
      } catch (error) {
        console.error("讀取存檔失敗:", error);
      } finally {
        setIsSyncing(false);
      }
    },
    [saveKey]
  );

  useEffect(() => {
    if (!saveKey) return;
    const timer = setInterval(() => handleSave(true), 60000);
    return () => clearInterval(timer);
  }, [handleSave, saveKey]);

  useEffect(() => {
    const initGame = async () => {
      try {
        const configs = await getGameConfigs();
        setRemoteConfigs(configs);
        setGameState((prev) => ({
          ...prev,
          shop: {
            generalItems: configs.generalShop.map((item: GeneralShopItem) => ({
              ...item,
              currentLevel: item.currentLevel || 0,
            })),
            relics: configs.relics.map((relic: RelicItem) => ({
              ...relic,
              isOwned: relic.isOwned || false,
            })),
          },
        }));
      } catch (error) {
        console.error("載入設定失敗:", error);
      }
    };
    initGame();
  }, []);

  // =============================================================================
  // 3. 遊戲核心循環
  // =============================================================================
  useEffect(() => {
    const tick = 100;
    const timer = setInterval(() => {
      setGameState((prev) => {
        const next = { ...prev };
        const dt = tick / 1000;

        const autoRelic = prev.shop.relics.find(
          (r) => r.relicEffect === RelicEffectType.AUTO_CLICKER && r.isOwned
        );
        if (autoRelic) {
          next.clickProgress.currentClicks += autoRelic.effectValue * dt;
          if (next.clickProgress.currentClicks >= 10) {
            next.clickProgress.currentClicks = 0;
            next.clickProgress.pendingUpgrades += 1;
          }
        }

        if (prev.stage.isBoss) {
          next.stage.timer -= dt;
          if (next.stage.timer <= 0) {
            const backLevel = Math.max(1, prev.stage.currentLevel - 1);
            return {
              ...prev,
              combo: 0,
              stage: {
                ...prev.stage,
                currentLevel: backLevel,
                isBoss: false,
                currentHp: 100,
                timer: 0,
              },
            };
          }
        }

        next.stage.currentHp -= currentStats.dps * dt;
        if (next.stage.currentHp <= 0) {
          const nextLevel = prev.stage.currentLevel + 1;
          const isBoss = nextLevel % 10 === 0;
          const reward = nextLevel * 10 * currentStats.goldMultiplier;
          const nextHp =
            Math.floor(100 * Math.pow(1.22, nextLevel - 1)) * (isBoss ? 5 : 1);

          triggerPopup(`+${Math.floor(reward)}G`, false, false);
          return {
            ...next,
            gold: prev.gold + reward,
            combo: prev.combo + 1,
            stage: {
              currentLevel: nextLevel,
              currentHp: nextHp,
              maxHp: nextHp,
              monsterName: isBoss ? "🔱 區域首領 🔱" : `怪物 Lv.${nextLevel}`,
              isLucky: false,
              isBoss,
              timer: isBoss ? 30 : 0,
              maxTimer: 30,
            },
          };
        }
        return next;
      });
    }, tick);
    return () => clearInterval(timer);
  }, [currentStats, triggerPopup]);

  // =============================================================================
  // 4. 進化與動作
  // =============================================================================
  const handleManualClick = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 100);

    const isCrit = Math.random() < currentStats.critRate;
    const earned = Math.ceil(1 * currentStats.goldMultiplier);

    triggerPopup(isCrit ? "CRIT!!" : `+${earned}G`, true, isCrit);
    setGameState((prev) => ({
      ...prev,
      gold: prev.gold + earned,
      clickProgress: {
        ...prev.clickProgress,
        currentClicks:
          prev.clickProgress.currentClicks + 1 >= 10
            ? 0
            : prev.clickProgress.currentClicks + 1,
        pendingUpgrades:
          prev.clickProgress.currentClicks + 1 >= 10
            ? prev.clickProgress.pendingUpgrades + 1
            : prev.clickProgress.pendingUpgrades,
        totalClicks: prev.clickProgress.totalClicks + 1,
      },
    }));
  };

  const buyGeneralItem = (item: GeneralShopItem) => {
    const curLv = Number(item.currentLevel) || 0;
    const baseP = Number(item.basePrice) || 0;
    const multi = Number(item.priceMultiplier) || 1;
    const price = Math.floor(baseP * Math.pow(multi, curLv));

    if (gameState.gold < price) return alert("金幣不足");
    setGameState((prev) => {
      const attr = prev.attributes[item.targetAttribute];
      const inc =
        item.targetAttribute === GameAttribute.ATTACK_SPEED ? 0.05 : 10;
      return {
        ...prev,
        gold: prev.gold - price,
        attributes: {
          ...prev.attributes,
          [item.targetAttribute]: { ...attr, value: attr.value + inc },
        },
        shop: {
          ...prev.shop,
          generalItems: prev.shop.generalItems.map((i) =>
            i.id === item.id
              ? { ...i, currentLevel: (Number(i.currentLevel) || 0) + 1 }
              : i
          ),
        },
      };
    });
  };

  const generateUpgrades = () => {
    if (!remoteConfigs) return;
    const pool = [...remoteConfigs.upgradePool];
    const selected: UpgradeOption[] = [];
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      selected.push({
        ...pool[idx],
        id: Math.random().toString(),
      } as UpgradeOption);
    }
    setGameState((prev) => ({
      ...prev,
      ui: { isUpgradeModalOpen: true, currentOptions: selected },
    }));
  };

  const selectUpgrade = (opt: UpgradeOption) => {
    setGameState((prev) => {
      const attr = prev.attributes[opt.targetAttribute];
      const newAttr = { ...attr };
      if (opt.effectType === EffectType.ADDITIVE)
        newAttr.value += opt.effectValue;
      else newAttr.bonusMultiplier += opt.effectValue;
      return {
        ...prev,
        attributes: { ...prev.attributes, [opt.targetAttribute]: newAttr },
        clickProgress: {
          ...prev.clickProgress,
          pendingUpgrades: prev.clickProgress.pendingUpgrades - 1,
        },
        ui: { isUpgradeModalOpen: false, currentOptions: [] },
      };
    });
  };

  const buyRelic = (relic: RelicItem) => {
    if (gameState.gold < relic.price || relic.isOwned) return;
    setGameState((prev) => ({
      ...prev,
      gold: prev.gold - relic.price,
      shop: {
        ...prev.shop,
        relics: prev.shop.relics.map((r) =>
          r.id === relic.id ? { ...r, isOwned: true } : r
        ),
      },
    }));
  };

  return (
    <div
      className={`min-vh-100 d-flex ${isShaking ? "shake-anim" : ""}`}
      style={{
        backgroundColor: "#f1f5f9",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {popups.map((p) => (
        <div
          key={p.id}
          className={`popup-text ${p.isCrit ? "crit" : ""}`}
          style={{ left: "50%", top: "40%", zIndex: 9999 }}
        >
          {p.text}
        </div>
      ))}

      <div
        className="bg-dark text-white d-flex flex-column align-items-center py-4 shadow"
        style={{ width: "80px", zIndex: 100 }}
      >
        <div
          className="mb-4 text-center"
          onClick={() => setIsSaveModalOpen(true)}
          style={{ cursor: "pointer" }}
        >
          <div className={`fs-2 ${isSyncing ? "animate-spin" : ""}`}>☁️</div>
          <small style={{ fontSize: "10px" }}>同步</small>
        </div>
        <div
          className="text-center"
          onClick={() => setIsShopOpen(true)}
          style={{ cursor: "pointer" }}
        >
          <div className="fs-2 text-warning">🛒</div>
          <small style={{ fontSize: "10px" }}>商店</small>
        </div>
      </div>

      <div className="flex-grow-1 p-4 overflow-auto">
        <div className="container">
          <div className="row g-4 justify-content-center">
            <div className="col-12 d-flex justify-content-between align-items-center text-dark">
              <h4 className="fw-bold mb-0">萬事屋免洗遊戲</h4>
              {saveKey && (
                <span className="badge bg-white text-dark border shadow-sm">
                  {isSyncing ? "⚡ 同步中" : `存檔: ${saveKey}`}
                </span>
              )}
            </div>

            <div className="col-12 text-center">
              <div className="card shadow border-0 p-4 bg-white text-dark">
                <h2 className="fw-bold">
                  STAGE {gameState.stage.currentLevel}
                </h2>
                <div
                  className="progress mt-3"
                  style={{ height: "30px", borderRadius: "15px" }}
                >
                  <div
                    className={`progress-bar progress-bar-striped progress-bar-animated ${gameState.stage.isBoss ? "bg-danger" : "bg-success"}`}
                    style={{
                      width: `${(gameState.stage.currentHp / gameState.stage.maxHp) * 100}%`,
                    }}
                  >
                    <b>
                      {Math.ceil(gameState.stage.currentHp).toLocaleString()} HP
                    </b>
                  </div>
                </div>
              </div>
            </div>

            {/* 數據指標 - 完整顯示所有屬性 */}
            {/* 數據指標區塊 */}
            <div className="col-md-4">
              <div className="card shadow border-0 h-100 p-3 bg-white text-dark">
                <h5 className="border-bottom pb-2 fw-bold text-center">
                  數據指標
                </h5>
                <div className="py-2 px-1">
                  <div className="d-flex justify-content-between mb-2">
                    <span>持有金幣:</span>
                    <b className="text-success">
                      ${gameState.gold.toLocaleString()}
                    </b>
                  </div>
                  <div className="d-flex justify-content-between mb-2">
                    <span>秒傷 (DPS):</span>
                    <b>{currentStats.dps.toFixed(1)}</b>
                  </div>
                  <div className="d-flex justify-content-between mb-2">
                    <span>暴擊機率:</span>
                    <b className="text-danger">
                      {(currentStats.critRate * 100).toFixed(1)}%
                    </b>
                  </div>

                  <hr className="my-2" />

                  {/* 拆解金幣收益結構 */}
                  <div className="d-flex justify-content-between mb-1">
                    <small className="text-muted">金幣基礎加成:</small>
                    <small className="fw-bold">
                      +{currentStats.displayGoldBase}%
                    </small>
                  </div>
                  <div className="d-flex justify-content-between mb-1">
                    <small className="text-muted">金幣獲得倍率:</small>
                    <small className="fw-bold text-primary">
                      x{currentStats.displayGoldMulti.toFixed(2)}
                    </small>
                  </div>
                  <div className="d-flex justify-content-between mt-2 pt-1 border-top border-light">
                    <span className="fw-bold">最終收益加成:</span>
                    <b className="text-warning">
                      +{currentStats.displayGoldTotal}%
                    </b>
                  </div>

                  <hr />
                  <div className="text-muted small text-center">
                    總點擊次數: {gameState.clickProgress.totalClicks}
                  </div>
                </div>
              </div>
            </div>

            {/* 攻擊與能量區 */}
            <div className="col-md-4 text-center">
              <div className="card shadow border-0 h-100 p-4 bg-white text-dark d-flex flex-column align-items-center justify-content-center">
                <div className="d-flex justify-content-center w-100 mb-4">
                  <button
                    className="attack-btn shadow"
                    onClick={handleManualClick}
                  >
                    ATTACK
                  </button>
                </div>

                <div className="w-100 px-2">
                  <div className="d-flex justify-content-between mb-1">
                    <small className="text-muted fw-bold">進化能量</small>
                    <small className="text-muted">
                      {Math.floor(gameState.clickProgress.currentClicks)}/10
                    </small>
                  </div>
                  <div
                    className="progress"
                    style={{ height: "10px", borderRadius: "5px" }}
                  >
                    <div
                      className="progress-bar bg-warning"
                      style={{
                        width: `${(gameState.clickProgress.currentClicks / 10) * 100}%`,
                        transition: "width 0.2s ease",
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* 進化區 */}
            <div className="col-md-4">
              <div className="card shadow border-0 h-100 p-3 bg-white text-dark">
                <h5 className="border-bottom pb-2 fw-bold text-center">
                  能力進化
                </h5>
                {gameState.clickProgress.pendingUpgrades > 0 &&
                  !gameState.ui.isUpgradeModalOpen && (
                    <button
                      className="btn btn-success w-100 py-3 mt-2 fw-bold animate-pulse"
                      onClick={generateUpgrades}
                    >
                      ⚡ 進行進化 ⚡
                    </button>
                  )}
                <div className="list-group mt-2">
                  {gameState.ui.isUpgradeModalOpen &&
                    gameState.ui.currentOptions.map((opt) => (
                      <button
                        key={opt.id}
                        className={`list-group-item list-group-item-action mb-2 rarity-card rarity-${opt.rarity.toLowerCase()}`}
                        onClick={() => selectUpgrade(opt)}
                      >
                        <div className="d-flex justify-content-between align-items-center">
                          <span className="fw-bold small">{opt.name}</span>
                          <span
                            className={`badge rarity-tag-${opt.rarity.toLowerCase()}`}
                            style={{ fontSize: "0.6rem" }}
                          >
                            {opt.rarity}
                          </span>
                        </div>
                        <div
                          style={{ fontSize: "0.7rem" }}
                          className="text-muted mt-1 text-start"
                        >
                          {opt.description}
                        </div>
                        {opt.rarity === Rarity.LEGEND && (
                          <div className="legend-shimmer" />
                        )}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 商店 Modal */}
      {isShopOpen && (
        <div
          className="modal show d-block shadow"
          style={{ backgroundColor: "rgba(0,0,0,0.8)", zIndex: 1050 }}
        >
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content border-0">
              <div className="modal-header bg-dark text-white border-0">
                <h5 className="modal-title">萬事屋商店</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setIsShopOpen(false)}
                ></button>
              </div>
              <div className="modal-body p-0 text-dark text-dark">
                <ul className="nav nav-tabs nav-fill">
                  <li className="nav-item">
                    <button
                      className={`nav-link rounded-0 ${shopTab === "GENERAL" ? "active" : ""}`}
                      onClick={() => setShopTab("GENERAL")}
                    >
                      屬性升級
                    </button>
                  </li>
                  <li className="nav-item">
                    <button
                      className={`nav-link rounded-0 ${shopTab === "RELIC" ? "active" : ""}`}
                      onClick={() => setShopTab("RELIC")}
                    >
                      稀有文物
                    </button>
                  </li>
                </ul>
                <div
                  className="p-4 overflow-auto"
                  style={{ maxHeight: "400px" }}
                >
                  {shopTab === "GENERAL"
                    ? gameState.shop.generalItems.map((item) => {
                        const curLv = Number(item.currentLevel) || 0;
                        const baseP = Number(item.basePrice) || 0;
                        const multi = Number(item.priceMultiplier) || 1;
                        const price = Math.floor(
                          baseP * Math.pow(multi, curLv)
                        );
                        return (
                          <div
                            key={item.id}
                            className="d-flex justify-content-between align-items-center mb-3 p-3 bg-light rounded text-dark"
                          >
                            <div>
                              <b>{item.name}</b>{" "}
                              <small className="text-muted ms-1">
                                (Lv.{curLv})
                              </small>
                            </div>
                            <button
                              className={`btn btn-sm ${gameState.gold >= price ? "btn-success" : "btn-secondary disabled"}`}
                              onClick={() => buyGeneralItem(item)}
                            >
                              💰 ${isNaN(price) ? 0 : price.toLocaleString()}
                            </button>
                          </div>
                        );
                      })
                    : gameState.shop.relics.map((relic) => (
                        <div
                          key={relic.id}
                          className="d-flex justify-content-between align-items-center mb-3 p-3 border border-info rounded bg-white text-dark"
                        >
                          <div>
                            <b>{relic.name}</b>
                            <br />
                            <small className="text-muted">
                              {relic.description}
                            </small>
                          </div>
                          <button
                            className={`btn btn-sm ${relic.isOwned ? "btn-secondary disabled" : gameState.gold >= Number(relic.price) ? "btn-warning" : "btn-secondary disabled"}`}
                            onClick={() => buyRelic(relic)}
                          >
                            {relic.isOwned
                              ? "已持有"
                              : `💰 $${Number(relic.price).toLocaleString()}`}
                          </button>
                        </div>
                      ))}
                </div>
              </div>
              <div className="modal-footer bg-light border-0 fw-bold text-success text-end d-block">
                目前金幣: ${gameState.gold.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 雲端同步 Modal - 包含按鈕鎖定機制 */}
      {isSaveModalOpen && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.8)", zIndex: 1100 }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 text-dark">
              <div className="modal-header bg-primary text-white border-0">
                <h5 className="modal-title">雲端同步</h5>
                <button
                  className="btn-close btn-close-white"
                  onClick={() => setIsSaveModalOpen(false)}
                ></button>
              </div>
              <div className="modal-body p-4 text-dark">
                <div className="position-relative">
                  <input
                    type="text"
                    className="form-control mb-1 shadow-sm"
                    placeholder="請輸入存檔金鑰"
                    value={saveKey}
                    onChange={(e) => setSaveKey(e.target.value)}
                    disabled={isSyncing}
                  />
                  <div className="text-end w-100" style={{ minHeight: "20px" }}>
                    <small className="text-muted" style={{ fontSize: "11px" }}>
                      {isSyncing
                        ? "⚡ 同步中..."
                        : lastSaveTime
                          ? `最後同步: ${lastSaveTime.toLocaleTimeString()}`
                          : "尚未進行同步"}
                    </small>
                  </div>
                </div>

                <div className="row g-2 mt-2">
                  <div className="col-6">
                    <button
                      className="btn btn-outline-primary w-100 fw-bold"
                      onClick={() => handleLoad(false)}
                      disabled={isSyncing}
                    >
                      {isSyncing ? "⌛ 等待中" : "📥 下載讀檔"}
                    </button>
                  </div>
                  <div className="col-6">
                    <button
                      className="btn btn-primary w-100 fw-bold"
                      onClick={() => handleSave(false)}
                      disabled={isSyncing}
                    >
                      {isSyncing ? "⌛ 上傳中" : "📤 上傳存檔"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .shake-anim {
          animation: shake 0.15s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
          transform: translate3d(0, 0, 0);
          backface-visibility: hidden;
        }
        @keyframes shake {
          10%,
          90% {
            transform: translate3d(-1px, 0, 0);
          }
          20%,
          80% {
            transform: translate3d(2px, 0, 0);
          }
          30%,
          50%,
          70% {
            transform: translate3d(-4px, 0, 0);
          }
          40%,
          60% {
            transform: translate3d(4px, 0, 0);
          }
        }
        .attack-btn {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          border: 6px solid #f8fafc;
          background: #3b82f6;
          color: white;
          font-weight: 900;
          cursor: pointer;
          transition: transform 0.1s;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .attack-btn:active {
          transform: scale(0.92);
        }
        .popup-text {
          position: absolute;
          font-weight: 900;
          color: #fbbf24;
          pointer-events: none;
          animation: floatUp 0.8s ease-out forwards;
          text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
        }
        .popup-text.crit {
          color: #ef4444;
          font-size: 2.2rem;
          text-shadow: 0 0 10px white;
        }
        @keyframes floatUp {
          0% {
            transform: translate(-50%, 0);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -100px);
            opacity: 0;
          }
        }
        .rarity-card {
          border: 2px solid #dee2e6;
          position: relative;
          overflow: hidden;
          transition: transform 0.2s;
        }
        .rarity-card:hover {
          transform: translateY(-2px);
        }
        .rarity-common {
          border-color: #94a3b8;
        }
        .rarity-rare {
          border-color: #3b82f6;
        }
        .rarity-epic {
          border-color: #a855f7;
          box-shadow: 0 0 10px rgba(168, 85, 247, 0.3);
        }
        .rarity-legend {
          border-color: #f59e0b;
          box-shadow: 0 0 20px rgba(245, 158, 11, 0.5);
          animation: legend-pulse 2s infinite;
        }
        .rarity-tag-common {
          background: #64748b;
          color: white;
        }
        .rarity-tag-rare {
          background: #2563eb;
          color: white;
        }
        .rarity-tag-epic {
          background: #9333ea;
          color: white;
        }
        .rarity-tag-legend {
          background: #d97706;
          color: white;
        }
        .legend-shimmer {
          position: absolute;
          top: -100%;
          left: -100%;
          width: 300%;
          height: 300%;
          background: linear-gradient(
            45deg,
            transparent 45%,
            rgba(255, 255, 255, 0.6) 50%,
            transparent 55%
          );
          animation: shimmer 3s infinite;
          pointer-events: none;
        }
        @keyframes shimmer {
          0% {
            transform: translate(-30%, -30%);
          }
          100% {
            transform: translate(30%, 30%);
          }
        }
        @keyframes legend-pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.02);
          }
        }
        .animate-spin {
          animation: spin 2s linear infinite;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
