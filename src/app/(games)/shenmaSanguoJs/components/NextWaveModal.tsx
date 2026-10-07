"use client";

import React from "react";
import { Modal, Button, Table, Badge } from "react-bootstrap";
import { WaveConfigData } from "../engine/WaveManager";
import { BUILTIN_ENEMIES_CONFIG } from "../engine/builtinData";
import styles from "../styles/shenmaSanguoJs.module.css";

interface NextWaveModalProps {
  show: boolean;
  waveIndex: number;
  totalWaves: number;
  waves: WaveConfigData[];
  onClose: () => void;
}

export const NextWaveModal: React.FC<NextWaveModalProps> = ({
  show,
  waveIndex,
  totalWaves,
  waves,
  onClose,
}) => {
  if (!show) return null;

  // 下一波序號 (若當前為 waveIndex，則預覽 waveIndex + 1，或當前波若為0則預覽第1波)
  const targetWaveNum = Math.max(1, Math.min(totalWaves, waveIndex <= 0 ? 1 : waveIndex + 1));
  const waveData = waves.find((w) => w.wave === targetWaveNum) ?? waves[targetWaveNum - 1];

  const getEnemyInfo = (enemyId: string) => {
    const norm = enemyId.replace(/^enemy_/, "");
    const cfg = BUILTIN_ENEMIES_CONFIG.find(
      (e) => e.enemy_id.replace(/^enemy_/, "") === norm
    );
    return {
      name: cfg?.name || norm,
      hp: cfg?.hp || 100,
      spd: cfg?.speed || 80,
      gold: 10,
      isFlying: cfg?.movement_type === "flying",
    };
  };

  return (
    <Modal show={show} onHide={onClose} centered contentClassName={styles.darkModalContent}>
      <Modal.Header closeButton closeVariant="white" style={{ background: "#111827", color: "#fff", borderBottom: "1px solid rgba(245, 158, 11, 0.3)" }}>
        <Modal.Title style={{ fontSize: "1rem", fontWeight: 700, color: "#f59e0b" }}>
          ⏳ 下一波軍情情報 (第 {targetWaveNum} / {totalWaves} 波)
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ background: "#0f172a", color: "#e2e8f0" }}>
        {waveData && waveData.enemies.length > 0 ? (
          <div>
            <p className="small text-muted mb-2">
              以下為下一波進犯之敵軍陣容與情資：
            </p>
            <Table responsive bordered hover variant="dark" size="sm" className="mb-0">
              <thead>
                <tr className="text-muted small">
                  <th>敵軍兵種</th>
                  <th>數量</th>
                  <th>生命</th>
                  <th>移速</th>
                  <th>特性</th>
                </tr>
              </thead>
              <tbody>
                {waveData.enemies.map((g, idx) => {
                  const info = getEnemyInfo(g.enemy_id);
                  return (
                    <tr key={idx} className="align-middle">
                      <td className="fw-bold text-light">
                        {info.name}
                      </td>
                      <td className="text-warning fw-bold">
                        x{g.count}
                      </td>
                      <td className="small">
                        {info.hp}
                      </td>
                      <td className="small">
                        {info.spd}
                      </td>
                      <td>
                        {info.isFlying ? (
                          <Badge bg="primary">飛行對空</Badge>
                        ) : (
                          <Badge bg="secondary">地面部隊</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        ) : (
          <p className="text-center text-muted my-3">
            目前無敵軍情資或所有波次已迎戰完畢。
          </p>
        )}
      </Modal.Body>
      <Modal.Footer style={{ background: "#1a1f36", borderTop: "1px solid rgba(255,255,255,0.15)" }}>
        <Button variant="outline-warning" size="sm" onClick={onClose}>
          確認知悉
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
