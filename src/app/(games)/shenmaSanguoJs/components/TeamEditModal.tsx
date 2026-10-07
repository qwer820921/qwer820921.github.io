"use client";

import React, { useState } from "react";
import { Modal, Button, Row, Col, Badge, ProgressBar, Alert } from "react-bootstrap";
import { PlayerState, TeamSlot } from "../types/player";
import { BUILTIN_HEROES_CONFIG } from "../engine/builtinData";
import styles from "../styles/shenmaSanguoJs.module.css";

interface TeamEditModalProps {
  show: boolean;
  player: PlayerState | null;
  onClose: () => void;
  onSaveTeam: (team: TeamSlot[]) => void;
}

const MAX_TEAM_SIZE = 5;

// 武將出征 Cost 權重估算
const HERO_COST_MAP: Record<string, number> = {
  hero_ma_chao: 12,
  hero_zhao_yun: 12,
  hero_guan_yu: 15,
  hero_zhang_fei: 14,
  hero_zhou_yu: 14,
  hero_huang_zhong: 12,
  hero_liu_bei: 11,
  hero_wei_yan: 10,
  hero_cao_cao: 14,
  hero_xia_hou_dun: 11,
  hero_liao_hua: 9,
  hero_yan_liang: 10,
  hero_sun_shang_xiang: 11,
};

export const TeamEditModal: React.FC<TeamEditModalProps> = ({
  show,
  player,
  onClose,
  onSaveTeam,
}) => {
  const [team, setTeam] = useState<string[]>([]);
  const [prevTeamSignature, setPrevTeamSignature] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<string>("all");
  const [feedback, setFeedback] = useState<string | null>(null);

  const currentSignature = `${show}_${player?.key}_${player?.team?.map((t) => t.hero_id).join(",")}`;
  if (prevTeamSignature !== currentSignature) {
    setPrevTeamSignature(currentSignature);
    const heroIds = (player?.team || [])
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((t) => t.hero_id);
    setTeam(heroIds);
  }

  if (!player) return null;

  // 計算隊伍總 Cost
  const totalCost = team.reduce((acc, hid) => acc + (HERO_COST_MAP[hid] || 10), 0);
  const isOverCost = totalCost > player.capacity;
  const costPercent = Math.min(100, Math.round((totalCost / player.capacity) * 100));

  // 取得武將資訊
  const getHeroInfo = (heroId: string) => {
    const heroState = player.heroes.find((h) => h.hero_id === heroId);
    const cfg = BUILTIN_HEROES_CONFIG.find((c) => c.hero_id === heroId);
    return {
      name: cfg?.name || heroId,
      job: cfg?.job || "武將",
      level: heroState?.level || 1,
      star: heroState?.star || 1,
      atk: heroState?.atk || 100,
      def: heroState?.def || 50,
      hp: heroState?.hp || 1000,
      cost: HERO_COST_MAP[heroId] || 10,
    };
  };

  // 入隊
  const handleAddHero = (heroId: string) => {
    if (team.includes(heroId)) {
      setFeedback("該名將已在出征隊伍中");
      return;
    }
    if (team.length >= MAX_TEAM_SIZE) {
      setFeedback("出征隊伍已滿員 (最多 5 位)，請先移出其他名將");
      return;
    }
    setFeedback(null);
    setTeam([...team, heroId]);
  };

  // 出隊
  const handleRemoveHero = (index: number) => {
    setFeedback(null);
    const newTeam = [...team];
    newTeam.splice(index, 1);
    setTeam(newTeam);
  };

  // 左右換位
  const handleMove = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= team.length) return;
    const newTeam = [...team];
    const temp = newTeam[index];
    newTeam[index] = newTeam[targetIndex];
    newTeam[targetIndex] = temp;
    setTeam(newTeam);
  };

  // 一鍵推薦
  const handleAutoRecommend = () => {
    const sorted = [...player.heroes].sort((a, b) => b.level - a.level || b.atk - a.atk);
    const top5 = sorted.slice(0, MAX_TEAM_SIZE).map((h) => h.hero_id);
    setTeam(top5);
    setFeedback("已為您自動配置最高戰力名將！");
  };

  // 一鍵清空
  const handleClear = () => {
    setTeam([]);
    setFeedback("隊伍已清空");
  };

  // 儲存出征隊伍
  const handleSave = () => {
    if (team.length === 0) {
      setFeedback("請至少配置一位出征武將！");
      return;
    }
    if (isOverCost) {
      setFeedback("隊伍 Cost 超出主公容量上限，請調整陣容！");
      return;
    }

    const newSlots: TeamSlot[] = team.map((hero_id, slot) => ({
      slot,
      hero_id,
    }));

    onSaveTeam(newSlots);
    onClose();
  };

  // 篩選武將錄
  const filteredHeroes = player.heroes.filter((h) => {
    if (selectedJob === "all") return true;
    const cfg = BUILTIN_HEROES_CONFIG.find((c) => c.hero_id === h.hero_id);
    return cfg?.job === selectedJob;
  });

  return (
    <Modal show={show} onHide={onClose} centered size="lg" contentClassName={styles.darkModalContent}>
      <Modal.Header closeButton closeVariant="white" className={styles.modalHeader}>
        <Modal.Title className="text-warning fw-bold d-flex align-items-center gap-2">
          <span>⚔️</span>
          <span>出征隊伍編排 (限額 5 位名將)</span>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className={styles.modalBody}>
        {feedback && (
          <Alert variant="info" className="py-2 small mb-3" dismissible onClose={() => setFeedback(null)}>
            {feedback}
          </Alert>
        )}

        {/* 隊伍容量 Cost 條與操作鈕 */}
        <div className="p-3 rounded mb-3" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span className="text-light small fw-bold">隊伍統率容量 (Cost Limit)</span>
            <span className={isOverCost ? "text-danger fw-bold" : "text-warning fw-bold"}>
              {totalCost} / {player.capacity} Cost
            </span>
          </div>
          <ProgressBar
            now={costPercent}
            variant={isOverCost ? "danger" : costPercent > 80 ? "warning" : "success"}
            style={{ height: 8, borderRadius: 4, backgroundColor: "rgba(0,0,0,0.5)" }}
            className="mb-2"
          />
          <div className="d-flex justify-content-between align-items-center">
            <small className="text-secondary">
              戰場佈防選單將嚴格以此 5 位名將出戰（隨主公等級提升容量上限）。
            </small>
            <div className="d-flex gap-2">
              <Button variant="outline-info" size="sm" onClick={handleAutoRecommend}>
                ⚡ 一鍵推薦
              </Button>
              <Button variant="outline-secondary" size="sm" onClick={handleClear}>
                清空
              </Button>
            </div>
          </div>
        </div>

        {/* 5 個出征席次槽位 */}
        <h6 className="text-warning fw-bold mb-2">🎯 當前出征陣列 (Slot 1 ~ 5)</h6>
        <Row className="g-2 mb-4">
          {Array.from({ length: MAX_TEAM_SIZE }).map((_, idx) => {
            const heroId = team[idx];
            if (heroId) {
              const info = getHeroInfo(heroId);
              return (
                <Col key={idx} xs={12} sm={6} md={2} className="flex-grow-1">
                  <div className={`${styles.teamSlotCard} ${styles.teamSlotFilled}`}>
                    <div className="d-flex justify-content-between align-items-center w-100 mb-1">
                      <Badge bg="warning" text="dark" style={{ fontSize: "0.65rem" }}>
                        席位 {idx + 1}
                      </Badge>
                      <button
                        type="button"
                        className="btn-close btn-close-white"
                        style={{ fontSize: "0.55rem" }}
                        onClick={() => handleRemoveHero(idx)}
                        title="移出隊伍"
                      />
                    </div>
                    <div className="fw-bold text-light mb-1">{info.name}</div>
                    <div className="text-warning small mb-1">Lv.{info.level}</div>
                    <Badge bg="secondary" className="mb-2" style={{ fontSize: "0.65rem" }}>
                      Cost {info.cost}
                    </Badge>
                    <div className="d-flex gap-1">
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        style={{ padding: "1px 6px", fontSize: "0.7rem" }}
                        disabled={idx === 0}
                        onClick={() => handleMove(idx, -1)}
                      >
                        ‹
                      </Button>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        style={{ padding: "1px 6px", fontSize: "0.7rem" }}
                        disabled={idx === team.length - 1}
                        onClick={() => handleMove(idx, 1)}
                      >
                        ›
                      </Button>
                    </div>
                  </div>
                </Col>
              );
            }
            return (
              <Col key={idx} xs={12} sm={6} md={2} className="flex-grow-1">
                <div className={styles.teamSlotCard}>
                  <div className="text-secondary small">席位 {idx + 1}</div>
                  <div className="text-muted small mt-2">+ 空位待定</div>
                </div>
              </Col>
            );
          })}
        </Row>

        {/* 麾下名將庫篩選 */}
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h6 className="text-light fw-bold mb-0">📜 麾下備選名將錄 (點擊加入隊伍)</h6>
          <div className="btn-group btn-group-sm">
            {[
              { id: "all", label: "全部" },
              { id: "cavalry", label: "騎兵" },
              { id: "infantry", label: "步兵" },
              { id: "archer", label: "弓兵" },
              { id: "mage", label: "法師" },
            ].map((tab) => (
              <Button
                key={tab.id}
                variant={selectedJob === tab.id ? "warning" : "outline-secondary"}
                size="sm"
                onClick={() => setSelectedJob(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 武將卡清單 */}
        <Row className="g-2" style={{ maxHeight: 220, overflowY: "auto" }}>
          {filteredHeroes.map((hero) => {
            const inTeam = team.includes(hero.hero_id);
            const info = getHeroInfo(hero.hero_id);
            return (
              <Col key={hero.hero_id} xs={6} md={4} lg={3}>
                <div
                  className={`${styles.heroRosterCard} ${inTeam ? styles.heroRosterInTeam : ""}`}
                  onClick={() => (!inTeam ? handleAddHero(hero.hero_id) : undefined)}
                  style={{ opacity: inTeam ? 0.7 : 1 }}
                >
                  <div className="d-flex justify-content-between align-items-start mb-1">
                    <strong className="text-light small">{info.name}</strong>
                    <Badge bg={inTeam ? "success" : "secondary"} style={{ fontSize: "0.6rem" }}>
                      {inTeam ? "已出征" : `Cost ${info.cost}`}
                    </Badge>
                  </div>
                  <div className="d-flex justify-content-between text-secondary small" style={{ fontSize: "0.7rem" }}>
                    <span>Lv.{info.level}</span>
                    <span>ATK {info.atk}</span>
                  </div>
                </div>
              </Col>
            );
          })}
        </Row>
      </Modal.Body>

      <Modal.Footer className={styles.modalFooter}>
        <Button variant="outline-secondary" onClick={onClose}>
          取消
        </Button>
        <Button
          variant="warning"
          onClick={handleSave}
          disabled={team.length === 0 || isOverCost}
          className="fw-bold px-4"
        >
          確認並儲存陣容
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
