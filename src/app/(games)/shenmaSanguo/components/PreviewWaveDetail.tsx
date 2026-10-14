"use client";

import { Row, Col } from "react-bootstrap";
import { PreviewGroup, PreviewWave } from "../utils/stagePreview";
import { blockerAtkText } from "../utils/enemyCombat";
import { WaveRouteView } from "../utils/stageComposition";
import {
  groupRhythmText,
  intervalSettingText,
  waveRhythm,
  waveRhythmText,
} from "../utils/spawnRhythm";
import styles from "../styles/shenmaSanguo.module.css";

/**
 * 一波敵軍的明細（規則見 utils/stagePreview）：關卡的敵軍預覽與戰場內的「下一波」共用。
 * showGround：地面組也標出「地面」（「下一波」用；關卡預覽只標飛行）
 * showRhythm：另列設定出兵節奏（關卡的敵軍預覽用；戰場內的「下一波」不顯示）
 * route：依路線查看（關卡的敵軍預覽選了一條路線時；utils/stageComposition 的 waveRouteView）：只列這條路線的組（原本的組序），
 *   寫明這條路線已確認的隻數與組數和整波的摘要；其他路線的資料問題另列「全波資料提醒」；缺波、拒絕、重複、空白列與出兵節奏仍是整波。
 *   沒有傳時（戰場內的「下一波」、選全部路線）和原本完全相同
 * 對武將攻擊力與免疫減速照遊戲的判讀（utils/enemyCombat）：攻擊力是被武將擋住時打武將的數值，不是對城池的傷害
 */

/** 波次的摘要：沒有資料、遊戲會拒絕、數量無法確定，或確定的隻數 */
export function previewWaveStatus(w: PreviewWave): string {
  if (w.missing) return "沒有資料";
  if (w.rejected) return "遊戲會拒絕這一波";
  if (w.total === null) return "數量無法確定";
  return `${w.total} 隻`;
}

export function PreviewWaveBody({
  wave: w,
  showGround = false,
  showRhythm = false,
  route = null,
}: {
  wave: PreviewWave;
  showGround?: boolean;
  showRhythm?: boolean;
  route?: WaveRouteView | null;
}) {
  const groups = route ? route.groups : w.groups;
  return (
    <div className={styles.previewWaveBody}>
      {w.missing && (
        <div className={styles.previewNote}>
          關卡資料沒有第 {w.wave} 波：遊戲打到這一波會拒絕開始。
        </div>
      )}
      {!w.missing && w.rejected && (
        <div className={styles.previewNote}>
          這一波沒有可以出兵的敵人組：遊戲會拒絕開始這一波。
        </div>
      )}
      {route && <WaveRouteSummary wave={w} view={route} />}
      {groups.map((g) => (
        <PreviewGroupRow key={g.index} group={g} showGround={showGround} />
      ))}
      {route && route.otherProblems.length > 0 && (
        <div
          className={styles.previewRouteOther}
          data-testid="preview-wave-other-problems"
        >
          <div className={styles.previewRhythmTitle}>
            全波資料提醒（其他路線）
          </div>
          {route.otherProblems.map((g) => (
            <PreviewGroupRow key={g.index} group={g} showGround={showGround} />
          ))}
        </div>
      )}
      {w.blankRows > 0 && (
        <div className={styles.previewHint}>
          另有 {w.blankRows} 列空白資料（遊戲略過，不是敵人）。
        </div>
      )}
      {w.duplicates > 0 && (
        <div className={styles.previewNote}>
          第 {w.wave} 波另有 {w.duplicates} 筆重複的資料，遊戲只使用第一筆。
        </div>
      )}
      {showRhythm && <WaveRhythmBlock wave={w} whole={route !== null} />}
    </div>
  );
}

/**
 * 依路線查看時這一波的摘要：這條路線已確認的隻數與組數（只算確定會出兵的組，不把數量無法確定或略過的組當成 0），
 * 和整波的摘要；這條路線沒有已確認的組時照實寫，不代表這一波沒有敵軍
 */
function WaveRouteSummary({
  wave: w,
  view: v,
}: {
  wave: PreviewWave;
  view: WaveRouteView;
}) {
  return (
    <div
      className={styles.previewHint}
      data-testid="preview-wave-route"
      data-route={v.pathId}
      data-confirmed={v.confirmed}
      data-confirmed-groups={v.confirmedGroups}
    >
      路線 {v.pathId}：
      {v.confirmedGroups > 0
        ? `本路線已確認 ${v.confirmed} 隻／${v.confirmedGroups} 組`
        : "本路線沒有已確認出兵組"}
      {v.undetermined > 0 &&
        `，另有 ${v.undetermined} 組無法確定能不能出兵或數量`}
      （第 {w.wave} 波全波：{previewWaveStatus(w)}）。
      {v.otherHidden > 0 &&
        `其他路線另有 ${v.otherHidden} 組沒有列出（在「敵軍組成」或「路線預覽」選全部路線查看）。`}
    </div>
  );
}

/**
 * 設定出兵節奏（遊戲時間預估，規則見 utils/spawnRhythm）：每一組一行（不展開成每一隻敵人），
 * 寫出數量、路線、間隔與最後一隻的名義出兵時間；整波取各組最晚的一組（同時開始，不相加）。
 * 只有能確定時才寫整波時間，有依處理幀出兵或無法估算的組時寫明只是已知範圍。
 * whole：逐波內容只列一條路線時，節奏仍用整波所有的組計算，標題寫明是全波
 */
function WaveRhythmBlock({
  wave,
  whole,
}: {
  wave: PreviewWave;
  whole: boolean;
}) {
  const r = waveRhythm(wave);
  return (
    <div
      className={styles.previewRhythm}
      data-testid="preview-rhythm"
      data-status={r.status}
      data-last-sec={r.lastSec === null ? "" : String(r.lastSec)}
      data-scope={whole ? "wave" : undefined}
    >
      <div className={styles.previewRhythmTitle}>
        {whole
          ? "設定出兵節奏（全波：所有路線的組；遊戲時間預估）"
          : "設定出兵節奏（遊戲時間預估）"}
      </div>
      <div data-testid="preview-rhythm-summary">{waveRhythmText(r)}</div>
      {r.groups.length > 0 && (
        <ul className={styles.previewRhythmList}>
          {r.groups.map((g) => (
            <li
              key={g.index}
              data-testid="preview-rhythm-group"
              data-kind={g.kind}
              data-last-sec={g.lastSec === null ? "" : String(g.lastSec)}
            >
              第 {g.index} 組 {g.name ?? `未知敵人（${g.enemyId}）`}｜路線{" "}
              {g.path}：{groupRhythmText(g)}
            </li>
          ))}
        </ul>
      )}
      {r.skipped > 0 && (
        <div className={styles.previewStats}>
          另有 {r.skipped} 組遊戲會略過、不出兵（不列入節奏）。
        </div>
      )}
      <div className={styles.previewHint}>
        依關卡設定估算：同一波各組在波次開始時同時出第一隻，同一組兩隻之間等間隔。這是遊戲時間（手動暫停時停住、倍速時加快），實際出兵對齊遊戲的處理幀，可能略晚；不是清波、敵人抵達終點或戰鬥結束的時間，也不代表勝負。
      </div>
    </div>
  );
}

function PreviewGroupRow({
  group: g,
  showGround,
}: {
  group: PreviewGroup;
  showGround: boolean;
}) {
  const countText =
    g.outcome === "spawn"
      ? `×${g.count}`
      : g.outcome === "skip"
        ? "不會出兵"
        : "數量無法確定";
  return (
    <div
      className={styles.previewGroup}
      data-testid="preview-group"
      data-movement={g.movement?.value ?? ""}
      data-outcome={g.outcome}
      data-flight-problem={g.flightProblem ?? ""}
      data-ground-problem={g.groundProblem ?? ""}
      data-atk={g.blockerAtk ? g.blockerAtk.value : ""}
      data-atk-fallback={g.blockerAtk ? String(g.blockerAtk.fallback) : ""}
      data-immune-slow={String(g.immuneSlow)}
    >
      <Row className="g-1 align-items-center">
        <Col xs={12} sm={7} className={styles.previewGroupMain}>
          <span className={styles.previewGroupIndex}>第 {g.index} 組</span>{" "}
          <strong>{g.name ?? `未知敵人（${g.enemyId}）`}</strong> {countText}
          {g.movement?.value === "flying" && (
            <>
              {" "}
              <span
                className={styles.previewFlying}
                data-testid="preview-flying"
              >
                ✈ 飛行
              </span>
            </>
          )}
          {showGround && g.movement?.value === "ground" && (
            <>
              {" "}
              <span
                className={styles.previewGround}
                data-testid="preview-ground"
              >
                地面
              </span>
            </>
          )}
          {showGround && !g.movement && (
            <>
              {" "}
              <span className={styles.previewGround}>移動方式不明</span>
            </>
          )}
          {g.immuneSlow && (
            <>
              {" "}
              <span
                className={styles.previewImmune}
                data-testid="preview-immune-slow"
                title="武將的阻擋減速、步兵塔與文士塔的減速都對它無效；仍會被武將擋住"
              >
                免疫減速
              </span>
            </>
          )}
        </Col>
        <Col xs={12} sm={5} className="text-sm-end">
          路線 {g.path}
        </Col>
        <Col xs={12} className={styles.previewStats}>
          血量 {g.hp ?? "未提供"}｜移動速度 {g.speed ?? "未提供"}｜
          {intervalSettingText(g)}
        </Col>
        {g.blockerAtk && (
          <Col
            xs={12}
            className={styles.previewStats}
            data-testid="preview-atk"
          >
            {blockerAtkText(g.blockerAtk)}
          </Col>
        )}
        {g.immuneSlow && (
          <Col
            xs={12}
            className={styles.previewStats}
            data-testid="preview-immune-text"
          >
            免疫減速：武將的阻擋減速、步兵塔與文士塔的減速都對它無效（仍會被武將擋住）
          </Col>
        )}
        {g.unusedTrait && (
          <Col
            xs={12}
            className={styles.previewHint}
            data-testid="preview-trait-unused"
          >
            特性「{g.unusedTrait}」：遊戲目前沒有使用
          </Col>
        )}
        {g.notes.map((n) => (
          <Col xs={12} key={n} className={styles.previewNote}>
            {n}
          </Col>
        ))}
      </Row>
    </div>
  );
}
