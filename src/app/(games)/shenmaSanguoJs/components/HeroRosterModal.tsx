"use client";

import React, { useState } from "react";
import { Modal, Button, Row, Col, Badge, Alert } from "react-bootstrap";
import { PlayerState } from "../types/player";
import { BUILTIN_HEROES_CONFIG } from "../engine/builtinData";
import styles from "../styles/shenmaSanguoJs.module.css";

interface HeroRosterModalProps {
  show: boolean;
  player: PlayerState | null;
  onClose: () => void;
  /** 升級：共用帳號要等伺服器回應（扣點數與屬性由伺服器計算後讀回），訪客在本機 */
  onUpgradeHero: (
    heroId: string
  ) => Promise<{ success: boolean; error?: string; cost?: number }>;
  /** 升級預覽（費用與成長）；不支援的武將回 null */
  upgradePreview: (
    heroId: string
  ) => { cost: number | null; atk: number; def: number; hp: number } | null;
  /** 不能升級的原因（唯讀、結果待確認等）；可以升級時是 null */
  writeDisabledReason?: string | null;
  /** 共用帳號：費用由伺服器計算（畫面的數字只是預估） */
  serverPriced?: boolean;
}

export const HeroRosterModal: React.FC<HeroRosterModalProps> = ({
  show,
  player,
  onClose,
  onUpgradeHero,
  upgradePreview,
  writeDisabledReason = null,
  serverPriced = false,
}) => {
  const [selectedJob, setSelectedJob] = useState<string>("all");
  const [selectedHeroId, setSelectedHeroId] = useState<string>("hero_ma_chao");
  const [feedback, setFeedback] = useState<{
    type: "success" | "danger";
    msg: string;
  } | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  if (!player) return null;

  // 存檔裡沒有可以顯示的武將（武將設定讀不到，或存檔的武將這裡都還不支援）：只顯示說明，不崩潰
  const currentHero =
    player.heroes.find((h) => h.hero_id === selectedHeroId) ?? player.heroes[0];
  if (!currentHero) {
    return (
      <Modal
        show={show}
        onHide={onClose}
        centered
        contentClassName={styles.darkModalContent}
      >
        <Modal.Header
          closeButton
          closeVariant="white"
          className={styles.modalHeader}
        >
          <Modal.Title className="text-warning fw-bold">
            麾下名將名錄與修為升級
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className={styles.modalBody}>
          <Alert
            variant="secondary"
            className="small mb-0"
            data-testid="hero-roster-empty"
          >
            目前沒有可以顯示的武將：武將設定還沒讀到，或存檔裡的武將這裡還不支援。請稍後在主公資訊按「手動同步」。
          </Alert>
        </Modal.Body>
      </Modal>
    );
  }
  const heroCfg = BUILTIN_HEROES_CONFIG.find(
    (c) => c.hero_id === currentHero.hero_id
  );

  // 技能與對空描述
  const getHeroSkillDesc = (heroId: string) => {
    const norm = heroId.replace(/^hero_/, "");
    switch (norm) {
      case "ma_chao":
        return {
          name: "西涼突襲",
          desc: "每場戰鬥首次普通攻擊造成 2.5 倍致命爆發傷害！",
        };
      case "zhao_yun":
        return {
          name: "單騎救主",
          desc: "受直接攻擊時有 15% 機率完全閃避並化解傷害。",
        };
      case "guan_yu":
        return {
          name: "青龍偃月",
          desc: "釋放青龍神威，射程內所有地面敵人移動速度降低 10%。",
        };
      case "zhang_fei":
        return {
          name: "當陽怒吼",
          desc: "普攻命中敵方目標造成 0.5 秒擊暈（打斷移動與攻擊）。",
        };
      case "zhou_yu":
        return {
          name: "赤壁烈火",
          desc: "攻擊附加灼燒，每秒造成 20% 攻擊力跳傷，持續 3 秒。",
        };
      case "huang_zhong":
        return {
          name: "百步穿楊",
          desc: "被動射程提升 1.5 倍，狙擊遠程敵陣。",
        };
      case "liu_bei":
        return {
          name: "昭烈仁德",
          desc: "防禦光環：提升射程內其他友軍武將 20% 防禦力。",
        };
      case "wei_yan":
        return {
          name: "狂骨嗜血",
          desc: "攻擊命中後吸血，恢復實扣傷害 15% 生命值。",
        };
      case "cao_cao":
        return {
          name: "短歌行",
          desc: "指揮光環：提升射程內其他友軍武將 15% 攻擊速度。",
        };
      case "xia_hou_dun":
        return {
          name: "拔矢啖睛",
          desc: "受擊反傷：受到近戰攻擊將所受實扣傷害 20% 反彈給敵人。",
        };
      case "liao_hua":
        return {
          name: "百戰不屈",
          desc: "生命低於 30% 時觸發堅韌減傷，受到傷害降低 20%。",
        };
      case "yan_liang":
        return {
          name: "威壓萬軍",
          desc: "威壓光環：降低射程內所有敵軍 10% 攻擊力。",
        };
      case "sun_shang_xiang":
        return {
          name: "連環雙射",
          desc: "普攻命中後有 20% 機率追加一記 100% 普攻連擊！",
        };
      default:
        return { name: "勇冠三軍", desc: "三國名將作戰特技。" };
    }
  };

  const isAntiAir = heroCfg?.job === "archer" || heroCfg?.job === "mage";
  const skill = getHeroSkillDesc(currentHero.hero_id);
  const preview = upgradePreview(currentHero.hero_id);
  const upgradeCost = preview?.cost ?? null;
  const canAfford = upgradeCost !== null && player.gold >= upgradeCost;
  const blockedReason =
    writeDisabledReason ?? (preview ? null : "這位武將這裡還不支援升級");

  // 等伺服器（或本機）回應之後才顯示結果；進行中按鈕停用，不重複送出
  const handleUpgrade = async () => {
    if (upgrading) return;
    setFeedback(null);
    setUpgrading(true);
    const fromLevel = currentHero.level;
    try {
      const res = await onUpgradeHero(currentHero.hero_id);
      if (res.success) {
        const paid =
          typeof res.cost === "number" ? `，扣除 🪙 ${res.cost}` : "";
        setFeedback({
          type: "success",
          msg: `${heroCfg?.name} 已升級（Lv.${fromLevel} → Lv.${fromLevel + 1}）${paid}。`,
        });
      } else {
        setFeedback({ type: "danger", msg: res.error || "升級失敗" });
      }
    } finally {
      setUpgrading(false);
    }
  };

  const filteredHeroes = player.heroes.filter((h) => {
    if (selectedJob === "all") return true;
    const cfg = BUILTIN_HEROES_CONFIG.find((c) => c.hero_id === h.hero_id);
    return cfg?.job === selectedJob;
  });

  return (
    <Modal
      show={show}
      onHide={onClose}
      centered
      size="lg"
      contentClassName={styles.darkModalContent}
    >
      <Modal.Header
        closeButton
        closeVariant="white"
        className={styles.modalHeader}
      >
        <Modal.Title className="text-warning fw-bold d-flex align-items-center gap-2">
          <span>📜</span>
          <span>麾下名將名錄與修為升級</span>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className={styles.modalBody}>
        {feedback && (
          <Alert
            variant={feedback.type}
            className="py-2 small mb-3"
            dismissible
            onClose={() => setFeedback(null)}
          >
            {feedback.msg}
          </Alert>
        )}

        <Row className="g-3">
          {/* 左側：名將分類與點選名冊 */}
          <Col xs={12} md={5}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-secondary small fw-bold">名將名冊</span>
              <div className="btn-group btn-group-sm">
                {[
                  { id: "all", label: "全部" },
                  { id: "cavalry", label: "騎" },
                  { id: "infantry", label: "步" },
                  { id: "archer", label: "弓" },
                  { id: "mage", label: "法" },
                ].map((t) => (
                  <Button
                    key={t.id}
                    variant={
                      selectedJob === t.id ? "warning" : "outline-secondary"
                    }
                    size="sm"
                    onClick={() => setSelectedJob(t.id)}
                    style={{ fontSize: "0.7rem", padding: "2px 6px" }}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>

            <div style={{ maxHeight: 380, overflowY: "auto" }} className="pe-1">
              {filteredHeroes.map((h) => {
                const cfg = BUILTIN_HEROES_CONFIG.find(
                  (c) => c.hero_id === h.hero_id
                );
                const isSelected = h.hero_id === currentHero.hero_id;
                return (
                  <div
                    key={h.hero_id}
                    className={`p-2 mb-2 rounded cursor-pointer transition ${isSelected ? styles.heroRosterInTeam : styles.heroRosterCard}`}
                    style={{
                      border: isSelected
                        ? "2px solid #ffca28"
                        : "1px solid rgba(255,255,255,0.1)",
                    }}
                    onClick={() => {
                      setSelectedHeroId(h.hero_id);
                      setFeedback(null);
                    }}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <div className="d-flex align-items-center gap-2">
                        <strong className="text-light">{cfg?.name}</strong>
                        <Badge bg="secondary" style={{ fontSize: "0.65rem" }}>
                          {cfg?.job}
                        </Badge>
                      </div>
                      <span className="text-warning small fw-bold">
                        Lv.{h.level}
                      </span>
                    </div>
                    <div
                      className="d-flex justify-content-between text-secondary small mt-1"
                      style={{ fontSize: "0.72rem" }}
                    >
                      <span>攻: {h.atk}</span>
                      <span>防: {h.def}</span>
                      <span>體: {h.hp}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Col>

          {/* 右側：名將精修與屬性預覽 */}
          <Col xs={12} md={7}>
            <div
              className="p-3 rounded h-100 d-flex flex-column justify-content-between"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(212,175,55,0.3)",
              }}
            >
              <div>
                {/* 頂部稱號與對空特徵 */}
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <div>
                    <h4 className="text-warning fw-bold mb-0">
                      {heroCfg?.name}
                    </h4>
                    <span className="text-secondary small">
                      職業: {heroCfg?.job} | 攻速: {heroCfg?.attack_speed}s |
                      射程: {heroCfg?.attack_range}格
                    </span>
                  </div>
                  <div>
                    <Badge
                      bg={isAntiAir ? "success" : "info"}
                      className="fw-bold"
                    >
                      {isAntiAir ? "🏹 可擊飛行" : "🛡️ 僅限地面"}
                    </Badge>
                  </div>
                </div>

                {/* 四圍屬性儀表 */}
                <div
                  className="p-2 rounded mb-3"
                  style={{ background: "rgba(0,0,0,0.3)" }}
                >
                  <Row className="g-2 text-center">
                    <Col xs={3}>
                      <div className="text-secondary small">等級</div>
                      <div className="text-warning fw-bold fs-5">
                        Lv.{currentHero.level}
                      </div>
                    </Col>
                    <Col xs={3}>
                      <div className="text-secondary small">攻擊力</div>
                      <div className="text-danger fw-bold fs-5">
                        {currentHero.atk}
                      </div>
                    </Col>
                    <Col xs={3}>
                      <div className="text-secondary small">防禦力</div>
                      <div className="text-primary fw-bold fs-5">
                        {currentHero.def}
                      </div>
                    </Col>
                    <Col xs={3}>
                      <div className="text-secondary small">生命值</div>
                      <div className="text-success fw-bold fs-5">
                        {currentHero.hp}
                      </div>
                    </Col>
                  </Row>
                </div>

                {/* 戰鬥武將專屬技能 */}
                <div
                  className="p-2 rounded mb-3"
                  style={{
                    background: "rgba(255,202,40,0.06)",
                    border: "1px solid rgba(255,202,40,0.2)",
                  }}
                >
                  <div className="text-warning small fw-bold mb-1">
                    ⚡ 傳世技能・{skill.name}
                  </div>
                  <p className="text-light small mb-0">{skill.desc}</p>
                </div>

                {/* 升級預覽 */}
                <div
                  className="p-2 rounded mb-3"
                  style={{ background: "rgba(0,0,0,0.2)" }}
                >
                  <div className="text-secondary small mb-1">
                    升級至 Lv.{currentHero.level + 1} 後加成：
                  </div>
                  <div className="d-flex justify-content-around text-light small">
                    <span className="text-danger">
                      攻擊 +{preview?.atk ?? "?"}
                    </span>
                    <span className="text-primary">
                      防禦 +{preview?.def ?? "?"}
                    </span>
                    <span className="text-success">
                      生命 +{preview?.hp ?? "?"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 升級操作按鈕 */}
              <div className="pt-2 border-top border-secondary">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="text-secondary small">
                    當前世界金幣:{" "}
                    <strong className="text-warning">
                      🪙 {player.gold.toLocaleString()}
                    </strong>
                  </span>
                  <span
                    className={
                      canAfford
                        ? "text-warning fw-bold small"
                        : "text-danger fw-bold small"
                    }
                  >
                    升級需耗費: 🪙 {upgradeCost ?? "?"}
                    {serverPriced ? "（伺服器計算）" : ""}
                  </span>
                </div>
                {blockedReason && (
                  <div
                    className="text-secondary small mb-2"
                    data-testid="hero-upgrade-blocked"
                  >
                    {blockedReason}
                  </div>
                )}
                <Button
                  variant="warning"
                  className="w-100 fw-bold py-2"
                  disabled={!canAfford || upgrading || blockedReason !== null}
                  onClick={() => void handleUpgrade()}
                  data-testid="hero-upgrade"
                >
                  {upgrading
                    ? "升級中，等待伺服器回應…"
                    : canAfford
                      ? `提升修為 (消耗 🪙 ${upgradeCost})`
                      : "世界金幣不足，無法升級"}
                </Button>
              </div>
            </div>
          </Col>
        </Row>
      </Modal.Body>
    </Modal>
  );
};
