"use client";

import React from "react";
import { Modal, Button, Row, Col, Card, Badge } from "react-bootstrap";
import { PlacementMenuData } from "../types";
import { TOWER_CONFIGS, TowerConfigInfo } from "../engine/entities/TowerEntity";
import { HeroStateData } from "../engine/entities/HeroEntity";
import { BUILTIN_HEROES_CONFIG } from "../engine/builtinData";
import styles from "../styles/shenmaSanguoJs.module.css";

interface PlacementMenuModalProps {
  show: boolean;
  data: PlacementMenuData | null;
  currentGold: number;
  playerHeroes: HeroStateData[];
  onPlaceTower: (col: number, row: number, typeKey: string) => void;
  onPlaceHero: (col: number, row: number, heroState: HeroStateData) => void;
  onClose: () => void;
}

export const PlacementMenuModal: React.FC<PlacementMenuModalProps> = ({
  show,
  data,
  currentGold,
  playerHeroes,
  onPlaceTower,
  onPlaceHero,
  onClose,
}) => {
  if (!data) return null;

  const { col, row, isRoad, isBuild } = data;

  // 取得英雄資訊與技能描述
  const getHeroInfo = (heroId: string) => {
    const norm = heroId.replace(/^hero_/, "");
    const cfg = BUILTIN_HEROES_CONFIG.find((h) => h.hero_id.replace(/^hero_/, "") === norm);
    let skillDesc = "強力作戰技能";
    switch (norm) {
      case "ma_chao":
        skillDesc = "騎兵衝鋒：首擊 2.5x 爆發傷害";
        break;
      case "zhao_yun":
        skillDesc = "槍神：25% 閃避 + 致命反擊";
        break;
      case "guan_yu":
        skillDesc = "青龍偃月：40% 範圍緩速光環";
        break;
      case "zhang_fei":
        skillDesc = "咆哮長坂：周遭友軍攻速 +30% 光環";
        break;
      case "zhou_yu":
        skillDesc = "赤壁烈火：攻擊附加 4 秒持續灼燒";
        break;
      case "huang_zhong":
        skillDesc = "百步穿楊：射程 +30% 且 20% 雙箭齊發";
        break;
      case "liu_bei":
        skillDesc = "仁德昭烈：周遭友軍防禦 +35% 光環";
        break;
      case "wei_yan":
        skillDesc = "狂骨嗜血：攻擊吸血 25% 回復生命";
        break;
      case "cao_cao":
        skillDesc = "奸雄威壓：降低周遭敵人 25% 攻擊力";
        break;
      case "xia_hou_dun":
        skillDesc = "拔矢啖睛：血量越低減傷越高 (最高 50%)";
        break;
      case "liao_hua":
        skillDesc = "先鋒不屈：受到致命傷時死戰不倒";
        break;
      case "yan_liang":
        skillDesc = "勇冠三軍：攻擊 20% 機率擊暈敵軍 1 秒";
        break;
      case "sun_shang_xiang":
        skillDesc = "弓腰姬：35% 機率觸發連續雙重射擊";
        break;
      default:
        break;
    }
    return { name: cfg?.name || norm, job: cfg?.job || "武將", skillDesc, norm };
  };

  return (
    <Modal show={show} onHide={onClose} centered size="lg">
      <Modal.Header closeButton className={styles.modalHeader}>
        <Modal.Title className="text-light fw-bold">
          📍 部署作戰單位 (座標: {col}, {row})
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className={styles.modalBody}>
        {/* 高台建築：防禦塔選單 */}
        {isBuild && (
          <div>
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h5 className="text-warning fw-bold mb-0">🏗️ 高台防禦塔建造</h5>
              <span className="text-light small">
                當前軍資金幣: <strong className="text-warning">{currentGold}</strong>
              </span>
            </div>

            <Row className="g-3">
              {Object.values(TOWER_CONFIGS).map((tower: TowerConfigInfo) => {
                const canAfford = currentGold >= tower.cost;
                const towerImg = `/images/shenmaSanguo/units/${tower.image || `tower_${tower.typeKey}.webp`}`;
                return (
                  <Col xs={12} sm={6} md={4} key={tower.typeKey}>
                    <Card className={`h-100 ${styles.deployCard} ${!canAfford ? styles.cardDisabled : ""}`}>
                      <Card.Body className="d-flex flex-column justify-content-between">
                        <div>
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <div className="d-flex align-items-center gap-2">
                              <img
                                src={towerImg}
                                alt={tower.name}
                                style={{ width: 32, height: 32, objectFit: "contain" }}
                              />
                              <h6 className="fw-bold text-light mb-0">{tower.name}</h6>
                            </div>
                            <Badge bg={canAfford ? "warning" : "secondary"} className="text-dark">
                              💰 {tower.cost}
                            </Badge>
                          </div>
                          <div className="small text-secondary mb-2">
                            <div>攻擊力: <span className="text-light">{tower.atk}</span></div>
                            <div>攻速: <span className="text-light">{tower.atkSpd}s/次</span></div>
                            <div>射程: <span className="text-light">{tower.rangeTiles} 格</span></div>
                          </div>
                          <div className="small text-info">
                            {tower.antiAir && <Badge bg="primary" className="me-1">對空</Badge>}
                            {tower.aoe && <Badge bg="danger" className="me-1">範圍群傷</Badge>}
                            {tower.slowMult && <Badge bg="info" className="me-1">減速光環</Badge>}
                            {tower.stackSlowAmount && <Badge bg="info" className="me-1">疊加冰凍</Badge>}
                          </div>
                        </div>

                        <Button
                          variant={canAfford ? "warning" : "secondary"}
                          size="sm"
                          disabled={!canAfford}
                          className="w-100 mt-3 fw-bold"
                          onClick={() => onPlaceTower(col, row, tower.typeKey)}
                        >
                          {canAfford ? "立即建造" : "金幣不足"}
                        </Button>
                      </Card.Body>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          </div>
        )}

        {/* 道路部署：肉盾阻擋武將選單 */}
        {isRoad && (
          <div>
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h5 className="text-danger fw-bold mb-0">🛡️ 道路肉盾武將召喚 (花費: 100 金幣)</h5>
              <span className="text-light small">
                當前軍資金幣: <strong className="text-warning">{currentGold}</strong>
              </span>
            </div>

            <Row className="g-3">
              {playerHeroes.map((hero) => {
                const info = getHeroInfo(hero.hero_id);
                const canAfford = currentGold >= 100;
                const heroImg = `/images/shenmaSanguo/units/hero_${info.norm}.webp`;
                return (
                  <Col xs={12} sm={6} md={4} key={hero.hero_id}>
                    <Card className={`h-100 ${styles.deployCard} ${!canAfford ? styles.cardDisabled : ""}`}>
                      <Card.Body className="d-flex flex-column justify-content-between">
                        <div>
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <div className="d-flex align-items-center gap-2">
                              <img
                                src={heroImg}
                                alt={info.name}
                                style={{ width: 32, height: 32, objectFit: "contain" }}
                              />
                              <h6 className="fw-bold text-light mb-0">{info.name}</h6>
                            </div>
                            <Badge bg="danger">Lv.{hero.level || 1}</Badge>
                          </div>
                          <div className="small text-secondary mb-2">
                            <div>生命: <span className="text-success">{hero.hp || 1000}</span></div>
                            <div>攻擊: <span className="text-warning">{hero.atk || 100}</span></div>
                            <div>防禦: <span className="text-info">{hero.def || 50}</span></div>
                          </div>
                          <div className="small text-warning fw-semibold">
                            {info.skillDesc}
                          </div>
                        </div>

                        <Button
                          variant={canAfford ? "danger" : "secondary"}
                          size="sm"
                          disabled={!canAfford}
                          className="w-100 mt-3 fw-bold"
                          onClick={() => onPlaceHero(col, row, hero)}
                        >
                          {canAfford ? "派遣出戰" : "金幣不足"}
                        </Button>
                      </Card.Body>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          </div>
        )}
      </Modal.Body>

      <Modal.Footer className={styles.modalFooter}>
        <Button variant="outline-secondary" onClick={onClose}>
          取消
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
