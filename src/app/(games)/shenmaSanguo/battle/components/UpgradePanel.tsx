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
import { liveHeroFor, ObsHeroSkill } from "../../utils/battleObservation";
import { useBattleObservationStore } from "../../store/battleObservationStore";
import styles from "../../styles/shenmaSanguo.module.css";

interface UpgradePanelProps {
  data: {
    unit_type: "hero" | "tower";
    hero_id?: string;
    /** 武將：這位已部署武將的識別碼（新版遊戲才有；戰況觀測用它對應同一位武將） */
    hero_uid?: string;
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
    /** 武將的連環計（龐統）：Godot 實際讀到的每跳範圍（格）、傳遞比例與最多次數；沒有這個技能（或舊版遊戲）時沒有 */
    chain?: {
      radius: number;
      ratio: number;
      max_jumps: number;
    };
    /** 武將的呼風喚雨（諸葛亮）：Godot 實際讀到的範圍半徑（格）、傷害比例與最多人數；沒有這個技能（或舊版遊戲）時沒有 */
    storm?: {
      radius: number;
      ratio: number;
      max_targets: number;
    };
    /**
     * 武將的戰神（呂布）：Godot 實際讀到的每層比例與上限、選取當下這一場的層數、基礎攻擊力與目前的有效攻擊力；
     * 沒有這個技能（或舊版遊戲）時沒有
     */
    berserk?: {
      ratio: number;
      max_stacks: number;
      stacks: number;
      base_atk: number;
      effective_atk: number;
    };
    /**
     * 武將的補給（魯肅）：Godot 實際讀到的倍率、選取當下這位武將能不能提供（在場上、還活著）、基礎與這位武將提供時每次擊殺的金幣、
     * 這一場此刻每次擊殺的金幣與最強的來源（全場取最高的倍率）；沒有這個技能（或舊版遊戲）時沒有
     */
    supply?: {
      multiplier: number;
      active: boolean;
      base_gold: number;
      hero_kill_gold: number;
      kill_gold: number;
      source: string;
    };
    /**
     * 武將的怪力（許褚）：Godot 實際讀到的距離（格）與冷卻（秒）、選取當下剩下的冷卻（秒，戰鬥中的遊戲時間）；
     * 沒有這個技能（或舊版遊戲）時沒有
     */
    knockback?: {
      distance: number;
      cooldown: number;
      remaining: number;
    };
    /**
     * 武將的護衛（典韋）：Godot 實際讀到的承擔比例與範圍（格）、選取當下能不能提供（在場上、還活著）、
     * 選取當下範圍內其他友軍武將的 hero_id；沒有這個技能（或舊版遊戲）時沒有
     */
    guard_share?: {
      ratio: number;
      radius: number;
      active: boolean;
      allies: string[];
    };
    /**
     * 武將的守護（孫權）：Godot 實際讀到的漏城傷害倍率、選取當下這位武將能不能提供（在場上、還活著）、
     * 選取當下這一場生效的倍率（全場取最強；沒有生效的守護時是 1）；沒有這個技能（或舊版遊戲）時沒有
     */
    base_guard?: {
      mult: number;
      active: boolean;
      effective_mult: number;
    };
    /**
     * 武將的奇襲（甘寧）：選取當下這一場用過了沒有、剩下的次數（0 或 1）；沒有這個技能（或舊版遊戲）時沒有
     */
    assassinate?: {
      used: boolean;
      remaining: number;
    };
    /**
     * 武將的魅惑（貂蟬）：Godot 實際讀到的受控時間（秒）、冷卻（秒）、攻擊範圍（格）與選取當下剩下的冷卻（秒，戰鬥中的遊戲時間）；
     * 沒有這個技能（或舊版遊戲）時沒有
     */
    charm?: {
      duration: number;
      cooldown: number;
      radius: number;
      remaining: number;
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
  // 戰況觀測（新版遊戲）：同一場、同一位武將的最新一份（只有這個面板訂閱，戰鬥入口不跟著重繪）。
  // 有的時候生命值與技能狀態用它（標明「目前」、即時更新），防禦與攻擊間隔仍是選取時的數值；
  // 沒有時（舊版遊戲、還沒收到、防禦塔）照選取時的快照顯示。技能 id 和這裡顯示的相同才用它的狀態
  const live = useBattleObservationStore((s) =>
    liveHeroFor(data, s.observation)
  );
  const lv = data.unit_type === "hero" && live ? live : null;
  const liveSkill = (id: string): ObsHeroSkill | null =>
    lv?.skill && lv.skill.id === id ? lv.skill : null;
  const when = (id: string) => (liveSkill(id) ? "目前" : "選取時");
  const refresh = (id: string) =>
    liveSkill(id) ? "（即時更新）" : "（重新點選可以更新）";
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
  const tenLive = liveSkill("tenacity");
  const tenActive =
    typeof tenLive?.active === "boolean" ? tenLive.active : !!ten?.active;
  // 武將的連環計：Godot 實際讀到的範圍、比例與次數（第 k 次是普通攻擊傷害 × 比例的 k 次方）
  const chain = data.unit_type === "hero" ? data.chain : undefined;
  const chainOk =
    !!chain &&
    Number.isFinite(chain.radius) &&
    chain.radius > 0 &&
    Number.isFinite(chain.ratio) &&
    chain.ratio > 0 &&
    chain.ratio < 1 &&
    Number.isInteger(chain.max_jumps) &&
    chain.max_jumps >= 1;
  const chainSteps = chainOk
    ? Array.from({ length: chain.max_jumps }, (_, i) =>
        Number((chain.ratio ** (i + 1) * 100).toFixed(1))
      )
    : [];
  // 武將的呼風喚雨：Godot 實際讀到的範圍、比例與人數（以被打中的敵人為中心，主要目標除外）
  const storm = data.unit_type === "hero" ? data.storm : undefined;
  const stormOk =
    !!storm &&
    Number.isFinite(storm.radius) &&
    storm.radius > 0 &&
    Number.isFinite(storm.ratio) &&
    storm.ratio > 0 &&
    storm.ratio < 1 &&
    Number.isInteger(storm.max_targets) &&
    storm.max_targets >= 1;
  // 武將的戰神：選取當下這一場的層數與有效攻擊力（Godot 計算；基礎攻擊力是目前等級的屬性，不含戰場加成）
  const bsk = data.unit_type === "hero" ? data.berserk : undefined;
  const bskOk =
    !!bsk &&
    Number.isFinite(bsk.ratio) &&
    bsk.ratio > 0 &&
    bsk.ratio < 1 &&
    Number.isInteger(bsk.max_stacks) &&
    bsk.max_stacks >= 1 &&
    Number.isInteger(bsk.stacks) &&
    bsk.stacks >= 0 &&
    Number.isFinite(bsk.base_atk) &&
    Number.isFinite(bsk.effective_atk);
  const atkNum = (n: number) => String(Number(n.toFixed(2)));
  const lbsk = liveSkill("berserk");
  const bskStacks =
    typeof lbsk?.stacks === "number" ? lbsk.stacks : (bsk?.stacks ?? 0);
  const bskAtk =
    typeof lbsk?.atk === "number" ? lbsk.atk : (bsk?.effective_atk ?? 0);
  const bskPct = bskOk ? Number((bsk.ratio * bskStacks * 100).toFixed(1)) : 0;
  // 武將的補給：選取當下是否生效與這一場每次擊殺的金幣（Godot 在選取時計算，不是固定的說明）
  const sup = data.unit_type === "hero" ? data.supply : undefined;
  const supOk =
    !!sup &&
    Number.isFinite(sup.multiplier) &&
    sup.multiplier > 1 &&
    sup.multiplier <= 2 &&
    typeof sup.active === "boolean" &&
    Number.isInteger(sup.base_gold) &&
    Number.isInteger(sup.hero_kill_gold) &&
    Number.isInteger(sup.kill_gold);
  const supPct = supOk ? Number(((sup.multiplier - 1) * 100).toFixed(1)) : 0;
  const lsup = liveSkill("supply");
  const supActive =
    typeof lsup?.active === "boolean" ? lsup.active : !!sup?.active;
  const supKillGold =
    typeof lsup?.kill_gold === "number"
      ? lsup.kill_gold
      : (sup?.kill_gold ?? 0);
  // 武將的怪力：選取當下剩下的冷卻（Godot 計算的快照，不是倒數計時）
  const kb = data.unit_type === "hero" ? data.knockback : undefined;
  const kbOk =
    !!kb &&
    Number.isFinite(kb.distance) &&
    kb.distance > 0 &&
    kb.distance <= 1 &&
    Number.isFinite(kb.cooldown) &&
    kb.cooldown > 0 &&
    kb.cooldown <= 10 &&
    Number.isFinite(kb.remaining) &&
    kb.remaining >= 0;
  const lkb = liveSkill("knockback");
  const kbRemaining =
    typeof lkb?.remaining === "number" ? lkb.remaining : (kb?.remaining ?? 0);
  // 武將的護衛：選取當下能不能提供與範圍內的友軍（Godot 計算的快照）
  const gs = data.unit_type === "hero" ? data.guard_share : undefined;
  const gsOk =
    !!gs &&
    Number.isFinite(gs.ratio) &&
    gs.ratio > 0 &&
    gs.ratio <= 0.5 &&
    Number.isFinite(gs.radius) &&
    gs.radius > 0 &&
    gs.radius <= 5 &&
    typeof gs.active === "boolean" &&
    Array.isArray(gs.allies);
  const lgs = liveSkill("guard_share");
  const gsActive = typeof lgs?.active === "boolean" ? lgs.active : !!gs?.active;
  const gsAllies =
    typeof lgs?.allies === "number" ? lgs.allies : (gs?.allies.length ?? 0);
  // 武將的守護：選取當下是否生效與這一場生效的漏城傷害倍率（Godot 計算的快照；即時的數值在戰場上方的城防旁）
  const bg = data.unit_type === "hero" ? data.base_guard : undefined;
  const bgOk =
    !!bg &&
    Number.isFinite(bg.mult) &&
    bg.mult >= 0.5 &&
    bg.mult < 1 &&
    typeof bg.active === "boolean" &&
    Number.isFinite(bg.effective_mult) &&
    bg.effective_mult > 0 &&
    bg.effective_mult <= 1;
  const lbg = liveSkill("base_guard");
  const bgActive = typeof lbg?.active === "boolean" ? lbg.active : !!bg?.active;
  const bgMult =
    typeof lbg?.effective_mult === "number" &&
    lbg.effective_mult > 0 &&
    lbg.effective_mult <= 1
      ? lbg.effective_mult
      : (bg?.effective_mult ?? 1);
  // 武將的奇襲：選取當下這一場用過了沒有（Godot 的快照；剩下的次數只會是 0 或 1，和用過與否一致）
  const asn = data.unit_type === "hero" ? data.assassinate : undefined;
  const asOk =
    !!asn &&
    typeof asn.used === "boolean" &&
    (asn.remaining === 0 || asn.remaining === 1) &&
    asn.used === (asn.remaining === 0);
  const las = liveSkill("assassinate");
  const asUsed = typeof las?.used === "boolean" ? las.used : !!asn?.used;
  // 武將的魅惑：選取當下剩下的冷卻（Godot 計算的快照，不是倒數計時）
  const cm = data.unit_type === "hero" ? data.charm : undefined;
  const cmOk =
    !!cm &&
    Number.isFinite(cm.duration) &&
    cm.duration > 0 &&
    cm.duration <= 5 &&
    Number.isFinite(cm.cooldown) &&
    cm.cooldown > 0 &&
    cm.cooldown <= 10 &&
    Number.isFinite(cm.radius) &&
    cm.radius > 0 &&
    cm.radius <= 2 &&
    Number.isFinite(cm.remaining) &&
    cm.remaining >= 0;
  const lcm = liveSkill("charm");
  const cmRemaining =
    typeof lcm?.remaining === "number" ? lcm.remaining : (cm?.remaining ?? 0);
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
            <span
              className={styles.upgStatValue}
              data-testid="unit-panel-atk"
              data-atk={data.atk}
            >
              {bskOk && bskStacks > 0
                ? `${atkNum(bsk.base_atk)} → ${atkNum(bskAtk)}`
                : bskOk
                  ? atkNum(bsk.base_atk)
                  : data.atk.toFixed(0)}
            </span>
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
                data-hp={lv ? lv.hp : data.hp}
                data-live={lv ? "1" : "0"}
              >
                {(lv ? lv.hp : data.hp)?.toFixed(0)}
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
            {lv
              ? "生命值與技能狀態是目前的戰況（遊戲每 0.25 秒更新）；防禦與攻擊間隔是選取時的數值，重新點選武將可更新"
              : "生命值與防禦是選取時的數值，重新點選武將可更新"}
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
            className={`${styles.tenacityNote} ${tenActive ? styles.tenacityNoteOn : ""}`}
            data-testid="unit-panel-tenacity"
            data-active={tenActive ? "true" : "false"}
          >
            {tenActive
              ? `堅韌生效中：${when("tenacity")}生命不高於 ${tenThreshold}%，受到的傷害（防禦計算後）降低 ${tenReduction}%`
              : `堅韌：生命不高於 ${tenThreshold}% 時受到的傷害（防禦計算後）降低 ${tenReduction}%；${when("tenacity")}未生效`}
          </div>
        )}

        {chainOk && (
          <div className={styles.chainNote} data-testid="unit-panel-chain">
            連環計：普通攻擊打到敵人後最多傳遞 {chain.max_jumps} 次（
            {chainSteps.map((p) => `${p}%`).join("、再 ")}
            ），每次從前一個被打中的敵人找 {Number(
              chain.radius.toFixed(3)
            )}{" "}
            格內最近的下一個敵人
          </div>
        )}

        {stormOk && (
          <div className={styles.stormNote} data-testid="unit-panel-storm">
            呼風喚雨：普通攻擊打到敵人後，以它為中心{" "}
            {Number(storm.radius.toFixed(3))} 格內最多 {storm.max_targets}{" "}
            名其他敵人各受 {Number((storm.ratio * 100).toFixed(1))}
            %（主要目標除外，不遞減）
          </div>
        )}

        {bskOk && (
          <div
            className={styles.berserkNote}
            data-testid="unit-panel-berserk"
            data-stacks={bskStacks}
            data-base-atk={bsk.base_atk}
            data-effective-atk={bskAtk}
          >
            戰神：{when("berserk")}本場 {bskStacks} 層（+{bskPct}%），基礎攻擊力{" "}
            {atkNum(bsk.base_atk)}、目前 {atkNum(bskAtk)}
            ；自己打倒敵人後下一擊起每層 +{Number((bsk.ratio * 100).toFixed(1))}
            %，最多 {bsk.max_stacks} 層，新的一場從 0 層開始
          </div>
        )}

        {supOk && (
          <div
            className={styles.supplyNote}
            data-testid="unit-panel-supply"
            data-active={supActive ? "1" : "0"}
            data-kill-gold={supKillGold}
          >
            補給：{when("supply")}
            {supActive
              ? `生效中，這一場每次擊殺戰鬥金幣 ${supKillGold}（基礎 ${sup.base_gold}）`
              : `沒有生效（不在場上或已陣亡），這一場每次擊殺戰鬥金幣 ${supKillGold}`}
            ；在場上、還活著時全隊擊殺 +{supPct}%（{sup.base_gold} →{" "}
            {sup.hero_kill_gold}），不影響玩家的獎勵
          </div>
        )}

        {kbOk && (
          <div
            className={styles.knockbackNote}
            data-testid="unit-panel-knockback"
            data-remaining={kbRemaining}
            data-live={lkb ? "1" : "0"}
          >
            怪力：{when("knockback")}
            {kbRemaining > 0
              ? `冷卻中，還剩 ${Number(kbRemaining.toFixed(1))} 秒`
              : "可以推動"}
            ；打中仍活著的地面目標時沿原路往回推{" "}
            {Number(kb.distance.toFixed(2))} 格，成功後冷卻{" "}
            {Number(kb.cooldown.toFixed(1))} 秒{refresh("knockback")}
          </div>
        )}

        {gsOk && (
          <div
            className={styles.guardNote}
            data-testid="unit-panel-guard"
            data-active={gsActive ? "1" : "0"}
            data-allies={gsAllies}
          >
            護衛：{when("guard_share")}
            {gsActive
              ? `可以提供，${Number(gs.radius.toFixed(2))} 格內有 ${gsAllies} 名友軍`
              : "沒有提供（不在場上或已陣亡）"}
            ；戰鬥中範圍內其他友軍受到敵人直接攻擊時，防禦與堅韌算完後承擔{" "}
            {Number((gs.ratio * 100).toFixed(1))}
            %（直接扣自己的生命、不超過剩下的生命）{refresh("guard_share")}
          </div>
        )}

        {bgOk && (
          <div
            className={styles.baseGuardNote}
            data-testid="unit-panel-base-guard"
            data-active={bgActive ? "1" : "0"}
            data-effective-mult={bgMult}
          >
            守護：{when("base_guard")}
            {bgActive ? "生效中" : "沒有生效（不在場上或已陣亡）"}
            ，這一場漏城傷害每隻 ×{Number(bgMult.toFixed(2))}
            ；在場上、還活著時漏城傷害減少{" "}
            {Number(((1 - bg.mult) * 100).toFixed(1))}
            %，累計後無條件進位才扣城防，不回復城防{refresh("base_guard")}
          </div>
        )}

        {asOk && (
          <div
            className={styles.assassinateNote}
            data-testid="unit-panel-assassinate"
            data-used={asUsed ? "1" : "0"}
            data-remaining={asUsed ? 0 : 1}
            data-live={las ? "1" : "0"}
          >
            奇襲：{when("assassinate")}
            {asUsed
              ? "這一場已經用過，切換關卡或重新開始才恢復"
              : "這一場還沒用過，下一次有效的普通攻擊必殺主要目標"}
            ；每場一次，換波次、移位、升級、重新部署都不恢復
            {refresh("assassinate")}
          </div>
        )}

        {cmOk && (
          <div
            className={styles.charmNote}
            data-testid="unit-panel-charm"
            data-remaining={cmRemaining}
            data-live={lcm ? "1" : "0"}
          >
            魅惑：{when("charm")}
            {cmRemaining > 0
              ? `冷卻中，還剩 ${Number(cmRemaining.toFixed(1))} 秒`
              : "可以控制"}
            ；打中仍活著的地面目標時讓它受控 {Number(cm.duration.toFixed(1))}{" "}
            秒（停下來改打 {Number(cm.radius.toFixed(2))}{" "}
            格內的其他敵人），成功後冷卻 {Number(cm.cooldown.toFixed(1))} 秒
            {refresh("charm")}
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
