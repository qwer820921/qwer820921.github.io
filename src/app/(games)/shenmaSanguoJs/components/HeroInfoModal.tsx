"use client";

import React from "react";
import { Modal, Button, Row, Col, Badge, ProgressBar } from "react-bootstrap";
import { HeroEntity } from "../engine/entities/HeroEntity";
import styles from "../styles/shenmaSanguoJs.module.css";

interface HeroInfoModalProps {
  show: boolean;
  hero: HeroEntity | null;
  onClose: () => void;
}

export const HeroInfoModal: React.FC<HeroInfoModalProps> = ({
  show,
  hero,
  onClose,
}) => {
  if (!hero) return null;

  const hpPercent = Math.max(0, Math.min(100, (hero.currentHp / hero.maxHp) * 100));
  const baseId = hero.heroId.replace(/^hero_/, "");
  const heroImg = `/images/shenmaSanguo/units/hero_${baseId}.webp`;

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton className={styles.modalHeader}>
        <Modal.Title className="text-light fw-bold">
          ⚔️ 駐守名將資訊 ({hero.gridCell.col}, {hero.gridCell.row})
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className={styles.modalBody}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div className="d-flex align-items-center gap-3">
            <img
              src={heroImg}
              alt={hero.heroName}
              style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 6 }}
            />
            <div>
              <h4 className="text-danger fw-bold mb-1">{hero.heroName}</h4>
              <Badge bg="primary" className="me-2">{hero.job.toUpperCase()}</Badge>
              {hero.isOnRoad && <Badge bg="success">道路肉盾駐守中</Badge>}
            </div>
          </div>
          <Badge bg="danger" className="fs-6 px-3 py-2">
            Lv. {hero.heroLevel}
          </Badge>
        </div>

        {/* 英雄當前生命值 */}
        <div className="mb-3">
          <div className="d-flex justify-content-between text-light small mb-1">
            <span>生命值狀態</span>
            <span>{Math.round(hero.currentHp)} / {Math.round(hero.maxHp)}</span>
          </div>
          <ProgressBar
            now={hpPercent}
            variant={hpPercent > 50 ? "success" : hpPercent > 25 ? "warning" : "danger"}
            className={styles.hpProgressBar}
          />
        </div>

        {/* 屬性卡片 */}
        <div className={styles.statsCard}>
          <Row className="g-2 text-center">
            <Col xs={4}>
              <div className="text-secondary small">攻擊力</div>
              <div className="fw-bold text-light fs-5">{Math.round(hero.atk)}</div>
            </Col>
            <Col xs={4}>
              <div className="text-secondary small">護甲防禦</div>
              <div className="fw-bold text-light fs-5">{Math.round(hero.defStat)}</div>
            </Col>
            <Col xs={4}>
              <div className="text-secondary small">攻擊週期</div>
              <div className="fw-bold text-light fs-5">{hero.attackSpeed}s</div>
            </Col>
          </Row>
        </div>

        {/* 固有特技技能說明 */}
        <div className="mt-3 p-3 rounded bg-dark border border-secondary">
          <div className="text-warning fw-bold mb-1">🌟 專屬武將戰技</div>
          <div className="text-light small">
            {baseId === "ma_chao" && "【西涼鐵騎】初次交戰發動首擊衝鋒，造成 2.5x 致命傷害！"}
            {baseId === "zhao_yun" && "【一身是膽】擁有 25% 機率閃避攻擊，並以 100% 力量致命反擊！"}
            {baseId === "guan_yu" && "【義薄雲天】釋放青龍偃月光環，周遭敵軍移動速度降低 40%！"}
            {baseId === "zhang_fei" && "【萬夫莫敵】咆哮長坂坡，周圍所有友軍攻擊速度提升 30%！"}
            {baseId === "zhou_yu" && "【赤壁烈焰】每次普攻擊中皆點燃敵軍，造成 4 秒持續灼燒！"}
            {baseId === "huang_zhong" && "【神弓破軍】攻擊範圍大幅擴大，且有 20% 機率雙箭齊發！"}
            {baseId === "liu_bei" && "【仁德昭烈】大德仁心，提升周圍所有友方武將 35% 防禦力！"}
            {baseId === "wei_yan" && "【狂骨飲血】每次命中敵軍將 25% 傷害化作自身生命回復！"}
            {baseId === "cao_cao" && "【亂世霸業】奸雄威壓四方，周圍敵軍攻擊力降低 25%！"}
            {baseId === "xia_hou_dun" && "【剛烈不屈】拔矢啖睛，生命值越低所受傷害越少 (最高 50%)！"}
            {baseId === "liao_hua" && "【百戰先鋒】意志堅定，即使瀕臨死線依然能屹立不倒！"}
            {baseId === "yan_liang" && "【勇冠三軍】狂暴攻擊有 20% 機率直接將敵人擊暈 1 秒！"}
            {baseId === "sun_shang_xiang" && "【弓腰飛箭】身法敏捷，35% 機率發動連續雙重齊射！"}
          </div>
        </div>
      </Modal.Body>

      <Modal.Footer className={styles.modalFooter}>
        <Button variant="outline-secondary" size="sm" onClick={onClose}>
          確認
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
