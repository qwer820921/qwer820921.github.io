"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Col, Row } from "react-bootstrap";
import { ExclamationTriangleFill } from "react-bootstrap-icons";
import {
  ConflictChoice,
  ConflictExpectation,
  usePlayerStore,
} from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import { PlayerState, SessionPlayerState } from "../../types";
import { describePlayerError } from "../../utils/playerErrors";
import SaveCompareTable from "../SaveCompareTable";
import {
  buildExport,
  compareSaves,
  CompareRow,
  downloadJson,
  NameLookup,
  stageLabel,
} from "../../utils/saveConflict";
import styles from "../../styles/shenmaSanguo.module.css";

interface Props {
  onClose: () => void;
}

/** 處理衝突時的原因代碼：和切換存檔共用的代碼，在這裡改成處理衝突的說法 */
function conflictErrorText(code: string): string {
  switch (code) {
    case "BATTLE_IN_PROGRESS":
      return "戰鬥進行中或結算還沒完成：請先結算或離開戰鬥，再處理存檔衝突。";
    case "UPGRADE_PENDING":
      return "武將升級的結果還在確認中：請先用畫面下方的「重新確認」處理升級，再處理存檔衝突。";
    case "WRITE_IN_PROGRESS":
      return "還有存檔正在寫入，請稍候再試。";
    default:
      return describePlayerError(code);
  }
}

/** 確認步驟：顯示的內容與確認時帶給 store 的狀態都是按下按鈕當下的快照 */
interface ConfirmStep {
  choice: ConflictChoice;
  expect: ConflictExpectation;
  rows: CompareRow[];
  cloudRev: number;
}

export function useSaveNames(): NameLookup {
  const heroes = useStaticConfigStore((s) => s.config?.heroesConfig);
  const maps = useStaticConfigStore((s) => s.config?.maps);
  return useMemo(
    () => ({
      hero: (id: string) => heroes?.find((h) => h.hero_id === id)?.name ?? id,
      stage: (id: string) => {
        const name = maps?.find((m) => m.map_id === id)?.name;
        return name ? `${stageLabel(id)}（${name}）` : stageLabel(id);
      },
    }),
    [heroes, maps]
  );
}

const toData = (p: SessionPlayerState): PlayerState => {
  const d = { ...p } as Partial<SessionPlayerState>;
  delete d.key;
  delete d.syncStatus;
  delete d.rev;
  delete d.syncedRev;
  delete d.serverRev;
  delete d.pendingUpgrade;
  delete d.pendingSettles;
  delete d.migrationHold;
  return d as PlayerState;
};

/**
 * 存檔衝突的比較與選擇（玩家開啟）：並列這個分頁（尚未保存）與雲端的資料，標出不同的項目；
 * 選擇後先顯示具體影響，再確認一次才執行。確認時帶著畫面上的衝突 id 與本機版本，
 * 期間任何一邊有變化都不執行，改成刷新比較請玩家重新確認。不顯示存檔金鑰
 */
export default function SaveConflictModal({ onClose }: Props) {
  const conflict = usePlayerStore((s) => s.saveConflict);
  const player = usePlayerStore((s) => s.player);
  const resolving = usePlayerStore((s) => s.resolvingConflict);
  const resolve = usePlayerStore((s) => s.resolveSaveConflict);
  const blockReason = usePlayerStore((s) => s.conflictBlockReason);
  const names = useSaveNames();
  const [showSame, setShowSame] = useState(false);
  const [showHeroes, setShowHeroes] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmStep | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const local = useMemo(() => (player ? toData(player) : null), [player]);
  const compared = useMemo(
    () =>
      local && conflict ? compareSaves(local, conflict.server, names) : null,
    [local, conflict, names]
  );
  if (!conflict || !player || !local || !compared) return null;

  const blocked = blockReason();
  const diffRows = [
    ...compared.summary.filter((r) => r.differs && r.id !== "heroes"),
    ...compared.heroes.filter((r) => r.differs),
  ];

  const exportBoth = () =>
    downloadJson(
      "shenma-save-conflict",
      buildExport({
        reason: "conflict",
        local,
        localBaseRev: player.serverRev ?? null,
        cloud: conflict.server,
        cloudRev: conflict.serverRev,
      })
    );

  const choose = (choice: ConflictChoice) => {
    setMessage(null);
    setConfirm({
      choice,
      expect: { conflictId: conflict.id, localRev: player.rev ?? 0 },
      rows: diffRows,
      cloudRev: conflict.serverRev,
    });
  };

  const run = async (step: ConfirmStep) => {
    setMessage(null);
    const r = await resolve(step.choice, step.expect);
    if (r.ok) {
      onClose();
      return;
    }
    setConfirm(null);
    setMessage(
      r.error === "CONFLICT_CHANGED"
        ? "雲端或這個分頁的資料在確認期間又有變化，比較內容已經更新，請重新確認。沒有任何資料被改變。"
        : `沒有完成，資料都沒有改變：${conflictErrorText(r.error)}（代碼：${r.error}）`
    );
  };

  const cloudCorrupt = conflict.server === null;

  return (
    <div
      className={`${styles.modalBackdrop} ${styles.conflictBackdrop}`}
      data-testid="save-conflict-modal"
    >
      <div className={`${styles.modalPanel} ${styles.conflictPanel}`}>
        <div className={styles.modalHeader}>
          <ExclamationTriangleFill className={styles.conflictIcon} />
          <span className={styles.modalTitle}>比較雲端與這個分頁的存檔</span>
          <button
            className={styles.modalClose}
            onClick={onClose}
            aria-label="關閉"
            disabled={resolving}
          >
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.conflictIntro}>
            {conflict.reason === "base_unknown"
              ? "這個分頁不確定自己的資料根據雲端哪一個版本（例如網站更新前留下的修改），伺服器要求確認之後才能保存。"
              : "雲端存檔在其他分頁或裝置更新過。"}
            這個分頁有<strong>尚未保存</strong>
            的修改，為了不互相覆蓋，已暫停自動保存。關閉這個視窗不會改變任何資料。
          </p>
          {message && (
            <Alert
              variant="warning"
              className="py-2 small"
              data-testid="save-conflict-message"
            >
              {message}
            </Alert>
          )}
          {blocked && (
            <Alert
              variant="secondary"
              className="py-2 small"
              data-testid="save-conflict-blocked"
            >
              目前還不能選擇：{conflictErrorText(blocked)}
            </Alert>
          )}

          {!confirm && (
            <>
              <SaveCompareTable
                summary={compared.summary}
                heroes={compared.heroes}
                localLabel="這個分頁（尚未保存）"
                cloudLabel={`雲端（版本 ${conflict.serverRev}）`}
                showSame={showSame}
                onShowSame={setShowSame}
                showHeroes={showHeroes}
                onShowHeroes={setShowHeroes}
                idPrefix="conflict"
                testIdPrefix="save-conflict"
              />
              {cloudCorrupt && (
                <Alert variant="danger" className="py-2 small">
                  雲端存檔無法讀取（資料損毀），伺服器不接受覆寫，兩個選項都無法使用。請先匯出這個分頁的資料並回報問題。
                </Alert>
              )}
              <Row className="g-2">
                <Col xs={12} sm={6}>
                  <Button
                    variant="outline-primary"
                    className="w-100"
                    disabled={!!blocked || resolving || cloudCorrupt}
                    onClick={() => choose("server")}
                    data-testid="save-conflict-server"
                  >
                    使用雲端版本
                  </Button>
                  <div className={styles.conflictHint}>
                    放棄這個分頁尚未保存的修改
                  </div>
                </Col>
                <Col xs={12} sm={6}>
                  <Button
                    variant="outline-danger"
                    className="w-100"
                    disabled={!!blocked || resolving || cloudCorrupt}
                    onClick={() => choose("local")}
                    data-testid="save-conflict-local"
                  >
                    保留這個分頁的版本
                  </Button>
                  <div className={styles.conflictHint}>
                    覆蓋雲端上其他分頁或裝置的修改
                  </div>
                </Col>
                <Col xs={12}>
                  <Button
                    variant="link"
                    size="sm"
                    className="px-0"
                    onClick={exportBoth}
                    data-testid="save-conflict-export"
                  >
                    匯出兩份資料（JSON，不含存檔金鑰）
                  </Button>
                </Col>
              </Row>
            </>
          )}

          {confirm && (
            <div
              data-testid="save-conflict-confirm"
              data-choice={confirm.choice}
            >
              <p className={styles.conflictConfirmTitle}>
                {confirm.choice === "server"
                  ? "確定使用雲端版本？這個分頁尚未保存的修改會被放棄："
                  : `確定保留這個分頁的版本？雲端（版本 ${confirm.cloudRev}）上其他分頁或裝置的修改會被覆蓋：`}
              </p>
              <ul
                className={styles.conflictImpact}
                data-testid="save-conflict-impact"
              >
                {confirm.rows.length === 0 && (
                  <li>顯示的項目都相同（差異在其他欄位，見匯出）</li>
                )}
                {confirm.rows.map((r) => (
                  <li key={r.id}>
                    {r.label}：
                    {confirm.choice === "server"
                      ? `${r.local} → ${r.cloud}`
                      : `${r.cloud} → ${r.local}`}
                  </li>
                ))}
              </ul>
              <p className={styles.conflictHint}>
                {confirm.choice === "server"
                  ? "放棄前會先備份這個分頁的資料，之後可以在畫面下方匯出或放回。"
                  : "覆蓋前會先備份雲端的資料，之後可以在畫面下方匯出或放回。雲端在確認期間又更新時不會覆蓋，會請你重新比較。"}
              </p>
              <Row className="g-2">
                <Col xs={12} sm={6}>
                  <Button
                    variant={confirm.choice === "server" ? "primary" : "danger"}
                    className="w-100"
                    disabled={resolving}
                    onClick={() => run(confirm)}
                    data-testid="save-conflict-confirm-yes"
                  >
                    {resolving
                      ? "處理中..."
                      : confirm.choice === "server"
                        ? "確定使用雲端版本"
                        : "確定覆蓋雲端"}
                  </Button>
                </Col>
                <Col xs={12} sm={6}>
                  <Button
                    variant="secondary"
                    className="w-100"
                    disabled={resolving}
                    onClick={() => setConfirm(null)}
                    data-testid="save-conflict-confirm-no"
                  >
                    返回比較
                  </Button>
                </Col>
              </Row>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
