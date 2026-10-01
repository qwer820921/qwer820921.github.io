"use client";

import { useRef } from "react";
import { Col, Row } from "react-bootstrap";
import { formatSec } from "../../utils/heroStats";
import { towerAirAbility } from "../../utils/antiAir";
import { useStageAnchor } from "../../utils/stageAnchor";
import {
  isSameTower,
  sellReasonText,
  TowerSellState,
} from "../../utils/towerSell";
import { TowerTargetMode, towerTargetOptions } from "../../utils/towerTarget";
import styles from "../../styles/shenmaSanguo.module.css";

interface UpgradePanelProps {
  data: {
    unit_type: "hero" | "tower";
    hero_id?: string;
    tower_type?: string;
    name: string;
    level: number;
    atk: number;
    atk_spd: number;
    /** 武將：選取當下的有效每秒攻擊次數（含攻速光環的戰場加成；Godot 計算，舊版遊戲沒有送） */
    atk_spd_effective?: number;
    range: number;
    hp?: number;
    /** 武將：隊伍資料的防禦（存檔的數值）與受傷時用的有效防禦（含防禦光環的戰場加成；Godot 在選取當下計算） */
    def?: number;
    def_effective?: number;
    upgrade_cost?: number;
    max_level?: boolean;
    can_afford?: boolean;
    /** 防禦塔：Godot 目前的實際目標優先、這座塔的識別碼與這一場的 battle_id（Round 17） */
    target_mode?: TowerTargetMode;
    /** 防禦塔：這座塔可以選的目標優先（能對空的塔多了 air_first）；沒有時只顯示原本三種 */
    target_modes?: TowerTargetMode[];
    tower_uid?: string;
    battle_id?: string;
    /** 防禦塔：已實際支付的戰鬥金幣與拆除時的返還金額（Round 18，由 Godot 計算） */
    invested_gold?: number;
    sell_refund?: number;
    /** 能不能攻擊（文士塔是減速）飛行敵人：Godot 依職業／塔的種類判斷後送來 */
    anti_air?: boolean;
    /** 武將的堅韌（廖化）：選取當下是不是生效與 Godot 實際讀到的門檻、倍率；沒有這個技能（或舊版遊戲）時沒有 */
    tenacity?: {
      active: boolean;
      low_hp_ratio: number;
      damage_mult: number;
      max_hp?: number;
    };
    screen_pos: { x: number; y: number };
  };
  onUpgrade: () => void;
  onClose: () => void;
  /** 選擇目標優先：送出命令，畫面等 Godot 回傳實際模式後才更新 */
  onSetTargetMode?: (mode: TowerTargetMode) => void;
  /** 備戰拆除（Round 18）：現在是不是備戰中（依 Godot 的 update_stats；Godot 收到命令時仍會再檢查） */
  canSell?: boolean;
  /** 拆除的狀態（確認中、送出中、不成功的原因）；只套用在同一場、同一座塔 */
  sell?: TowerSellState | null;
  onSellStart?: () => void;
  onSellCancel?: () => void;
  /** 確認拆除：帶回確認時看到的返還金額（Godot 比對不同就不拆） */
  onSellConfirm?: (expectedRefund: number) => void;
  /** 手動暫停中：只能查看，升級、改目標、拆除都停用（Godot 也會拒絕） */
  locked?: boolean;
}

export default function UpgradePanel({
  data,
  onUpgrade,
  onClose,
  onSetTargetMode,
  canSell = false,
  sell,
  onSellStart,
  onSellCancel,
  onSellConfirm,
  locked = false,
}: UpgradePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // 定位和部署選單共用（utils/stageAnchor）：Godot 座標乘上縮放比例、限制在看得到的範圍、尺寸或方向改變時重算
  useStageAnchor(panelRef, data.screen_pos);

  const targetOptions = towerTargetOptions(data.tower_type, data.target_modes);
  const showTarget =
    data.unit_type === "tower" &&
    !!data.tower_uid &&
    !!data.target_mode &&
    targetOptions.length > 0 &&
    !!onSetTargetMode;
  const active = targetOptions.find((o) => o.mode === data.target_mode);

  const showSell =
    data.unit_type === "tower" &&
    !!data.tower_uid &&
    typeof data.sell_refund === "number" &&
    !!onSellConfirm;
  const refund = data.sell_refund ?? 0;

  // 武將的防禦：有防禦光環的戰場加成時分開列出原本與加成後的數值（加成不寫回存檔）
  const def = data.unit_type === "hero" ? data.def : undefined;
  const defEffective =
    typeof data.def_effective === "number" ? data.def_effective : def;
  const defBoosted =
    typeof def === "number" &&
    typeof defEffective === "number" &&
    defEffective > def + 1e-6;
  // 武將的攻擊間隔：有攻速光環的戰場加成時分開列出原本與加成後的間隔（加成不寫回存檔）
  const spdEffective =
    data.unit_type === "hero" &&
    typeof data.atk_spd_effective === "number" &&
    Number.isFinite(data.atk_spd_effective)
      ? data.atk_spd_effective
      : data.atk_spd;
  const spdBoosted =
    data.atk_spd > 0 && spdEffective > data.atk_spd * (1 + 1e-6);
  // 武將的堅韌：選取當下是不是生效（生命不高於門檻）；數值是 Godot 實際讀到的門檻與倍率
  const ten = data.unit_type === "hero" ? data.tenacity : undefined;
  const tenOk =
    !!ten &&
    typeof ten.active === "boolean" &&
    Number.isFinite(ten.low_hp_ratio) &&
    Number.isFinite(ten.damage_mult);
  const tenThreshold = tenOk ? Number((ten.low_hp_ratio * 100).toFixed(1)) : 0;
  const tenReduction = tenOk
    ? Number(((1 - ten.damage_mult) * 100).toFixed(1))
    : 0;
  const s = sell && isSameTower(data, sell) ? sell : null;
  const confirming = s?.phase === "confirm" || s?.phase === "pending";
  const pending = s?.phase === "pending";

  return (
    <div
      ref={panelRef}
      className={styles.upgradePanel}
      data-testid="unit-panel"
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.upgradeHeader}>
        <span className={styles.unitName}>
          {data.name} <small>Lv.{data.level}</small>
        </span>
        <button className={styles.closeBtn} onClick={onClose}>
          ×
        </button>
      </div>

      {/* 可用高度不夠時（例如橫向的手機）只有這一段捲動，標題列與關閉鈕一直看得到 */}
      <div className={styles.upgradeBody}>
        <div className={styles.statsGrid}>
          <div className={styles.upgStatItem}>
            <span className={styles.upgStatLabel}>攻擊力</span>
            <span className={styles.upgStatValue}>{data.atk.toFixed(0)}</span>
          </div>
          <div className={styles.upgStatItem}>
            {/* Godot 送來的是每秒攻擊次數（1 ÷ 攻擊間隔）；顯示成攻擊間隔，和武將列表、升級預覽一致 */}
            <span className={styles.upgStatLabel}>攻擊間隔</span>
            <span
              className={styles.upgStatValue}
              data-testid="upgrade-panel-interval"
              data-atk-spd={data.atk_spd}
              data-atk-spd-effective={spdEffective}
            >
              {data.atk_spd <= 0
                ? "—"
                : spdBoosted
                  ? `${formatSec(1 / data.atk_spd)} → ${formatSec(1 / spdEffective)}秒`
                  : `${formatSec(1 / data.atk_spd)}秒`}
            </span>
          </div>
          <div className={styles.upgStatItem}>
            <span className={styles.upgStatLabel}>射程</span>
            <span className={styles.upgStatValue}>
              {data.range.toFixed(1)}格
            </span>
          </div>
          {data.unit_type === "hero" && (
            <div className={styles.upgStatItem}>
              <span className={styles.upgStatLabel}>生命值</span>
              <span
                className={styles.upgStatValue}
                data-testid="unit-panel-hp"
                data-hp={data.hp}
              >
                {data.hp?.toFixed(0)}
              </span>
            </div>
          )}
          {typeof def === "number" && (
            <div className={styles.upgStatItem}>
              <span className={styles.upgStatLabel}>防禦</span>
              <span
                className={styles.upgStatValue}
                data-testid="unit-panel-def"
                data-def={def}
                data-def-effective={defEffective}
              >
                {defBoosted
                  ? `${def.toFixed(0)} → ${defEffective?.toFixed(0)}`
                  : def.toFixed(0)}
              </span>
            </div>
          )}
          {typeof data.anti_air === "boolean" && (
            <div className={styles.upgStatItem}>
              <span className={styles.upgStatLabel}>對空</span>
              <span
                className={`${styles.upgStatValue} ${data.anti_air ? styles.cardAirYes : ""}`}
                data-testid="unit-panel-air"
                data-anti-air={data.anti_air ? "true" : "false"}
              >
                {/* 以 Godot 送來的判斷為準；文士塔的對空是減速 */}
                {!data.anti_air
                  ? "只打地面"
                  : data.unit_type === "tower" &&
                      towerAirAbility(data.tower_type) === "slow"
                    ? "可減速飛行"
                    : "可對空"}
              </span>
            </div>
          )}
        </div>

        {/* 生命值與防禦是 Godot 在選取當下送來的快照：面板開著時不會跟著戰況更新（舊版遊戲沒有送防禦時不顯示） */}
        {typeof def === "number" && (
          <div
            className={styles.snapshotNote}
            data-testid="unit-panel-snapshot-note"
          >
            生命值與防禦是選取時的數值，重新點選武將可更新
          </div>
        )}

        {defBoosted && (
          <div className={styles.defAuraNote} data-testid="unit-panel-def-note">
            防禦光環：戰場上的防禦是 {defEffective?.toFixed(0)}
            （原本 {def?.toFixed(0)}），只在範圍內生效，不改存檔
          </div>
        )}

        {spdBoosted && (
          <div
            className={styles.atkSpeedAuraNote}
            data-testid="unit-panel-atk-speed-note"
          >
            指揮：選取時的攻擊間隔是 {formatSec(1 / spdEffective)}秒（原本{" "}
            {formatSec(1 / data.atk_spd)}
            秒），之後開始的攻擊才套用，只在範圍內生效，不改存檔
          </div>
        )}

        {tenOk && (
          <div
            className={`${styles.tenacityNote} ${ten.active ? styles.tenacityNoteOn : ""}`}
            data-testid="unit-panel-tenacity"
            data-active={ten.active ? "true" : "false"}
          >
            {ten.active
              ? `堅韌生效中：選取時生命不高於 ${tenThreshold}%，受到的傷害（防禦計算後）降低 ${tenReduction}%`
              : `堅韌：生命不高於 ${tenThreshold}% 時受到的傷害（防禦計算後）降低 ${tenReduction}%；選取時未生效`}
          </div>
        )}

        {locked && (
          <div className={styles.lockNotice} data-testid="unit-panel-locked">
            已暫停：繼續後才能升級、拆除或改目標
          </div>
        )}

        {showTarget && (
          <div className={styles.targetModeBox} data-testid="tower-target">
            <div className={styles.upgStatLabel}>攻擊目標</div>
            <Row
              className={`g-1 ${styles.targetModeRow}`}
              role="group"
              aria-label="攻擊目標"
            >
              {targetOptions.map((o) => (
                <Col xs={targetOptions.length > 3 ? 6 : 4} key={o.mode}>
                  <button
                    className={`${styles.targetModeBtn} ${
                      o.mode === data.target_mode
                        ? styles.targetModeBtnActive
                        : ""
                    }`}
                    aria-pressed={o.mode === data.target_mode}
                    disabled={locked}
                    data-testid={`tower-target-${o.mode}`}
                    onClick={() => {
                      if (o.mode !== data.target_mode)
                        onSetTargetMode?.(o.mode);
                    }}
                  >
                    {o.label}
                  </button>
                </Col>
              ))}
            </Row>
            {active && (
              <div
                className={styles.targetModeHint}
                data-testid="tower-target-hint"
              >
                {active.hint}
              </div>
            )}
          </div>
        )}

        <div className={styles.upgradeActions}>
          {data.unit_type === "tower" && !data.max_level && (
            <button
              className={`${styles.actionBtn} ${styles.upgradeBtn} ${!data.can_afford || locked ? styles.btnDisabled : ""}`}
              disabled={!data.can_afford || confirming || locked}
              onClick={onUpgrade}
            >
              升級 (💰{data.upgrade_cost})
            </button>
          )}
          {data.max_level && (
            <div className={styles.maxLevelTag}>已達最高等級</div>
          )}
        </div>

        {/* 備戰拆除（Round 18）：先確認、顯示實際返還金額；戰鬥中不能拆 */}
        {showSell && (
          <div className={styles.sellBox} data-testid="tower-sell-box">
            {!confirming ? (
              <button
                className={`${styles.actionBtn} ${styles.sellBtn}`}
                data-testid="tower-sell"
                disabled={!canSell || locked}
                onClick={onSellStart}
              >
                {!canSell
                  ? "備戰時可拆除"
                  : locked
                    ? "暫停中不能拆除"
                    : `拆除（返還 💰${refund}）`}
              </button>
            ) : (
              <div
                className={styles.sellConfirm}
                data-testid="tower-sell-confirm"
                role="group"
                aria-label="確認拆除"
              >
                <div className={styles.sellConfirmText}>
                  {canSell
                    ? `拆除這座${data.name}？返還 💰${refund}（已投入 💰${data.invested_gold ?? 0}），拆除後這一格可以重新建造。`
                    : "戰鬥已開始，備戰時才能拆除。"}
                </div>
                <Row className="g-1">
                  <Col xs={6}>
                    <button
                      className={`${styles.actionBtn} ${styles.sellOkBtn}`}
                      data-testid="tower-sell-ok"
                      disabled={!canSell || pending || locked}
                      onClick={() => onSellConfirm?.(refund)}
                    >
                      {pending ? "拆除中…" : "確認拆除"}
                    </button>
                  </Col>
                  <Col xs={6}>
                    <button
                      className={`${styles.actionBtn} ${styles.sellCancelBtn}`}
                      data-testid="tower-sell-cancel"
                      disabled={pending}
                      onClick={onSellCancel}
                    >
                      取消
                    </button>
                  </Col>
                </Row>
              </div>
            )}
            {s?.phase === "rejected" && (
              <div
                className={styles.sellMessage}
                data-testid="tower-sell-message"
                role="status"
              >
                {sellReasonText(s.reason)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
