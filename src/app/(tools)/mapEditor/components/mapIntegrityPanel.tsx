// 地圖編輯器的「地圖資料檢查」面板（只由 mapTab 匯入，跟著它在瀏覽器執行）
import { useMemo, useState } from "react";
import styles from "../styles/mapEditor.module.css";
import type { EnemyConfig, MapConfig } from "@/app/(games)/shenmaSanguo/types";
import { buildStagePreview } from "@/app/(games)/shenmaSanguo/utils/stagePreview";
import { stageDataProblemText } from "@/app/(games)/shenmaSanguo/utils/stagePlayability";
import {
  INTEGRITY_LABEL,
  IntegrityFilter,
  MapIntegrityKind,
  filterByIntegrity,
  integritySummary,
  integritySummaryText,
  mapIntegrity,
} from "../utils/mapIntegrity";

/** 讀取狀態：還沒讀、讀取中、失敗、成功（失敗與還沒讀都不能顯示成 0 張） */
export type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "loaded"; data: T };

const KIND_CLASS: Record<MapIntegrityKind, string> = {
  complete: styles.integrityChipOk,
  waves: styles.integrityChipWarn,
  route: styles.integrityChipWarn,
  both: styles.integrityChipBad,
};

function Chip({ kind }: { kind: MapIntegrityKind }) {
  return (
    <span className={`${styles.integrityChip} ${KIND_CLASS[kind]}`}>
      {INTEGRITY_LABEL[kind]}
    </span>
  );
}

/** 每一波的判讀（敵軍預覽的規則；需要敵人設定） */
function WaveList({
  map,
  enemies,
}: {
  map: MapConfig;
  enemies: LoadState<EnemyConfig[]>;
}) {
  const preview = useMemo(
    () =>
      enemies.status === "loaded" ? buildStagePreview(map, enemies.data) : null,
    [map, enemies]
  );
  const raw = Array.isArray(map.waves) ? map.waves : [];
  if (raw.length === 0) return null;
  if (!preview) {
    return (
      <div className={styles.integrityNote} data-testid="integrity-waves-raw">
        共 {raw.length} 筆波次。
        {enemies.status === "error"
          ? `敵人設定讀取失敗（${enemies.error}），`
          : "敵人設定還沒讀取，"}
        無法判讀每一組能不能出兵。
      </div>
    );
  }
  return (
    <ol className={styles.integrityWaves} data-testid="integrity-waves">
      {preview.waves.map((w) => (
        <li key={w.wave} data-rejected={w.rejected ? "1" : "0"}>
          <span className={styles.integrityWaveTitle}>第 {w.wave} 波</span>
          {w.missing
            ? "：關卡資料沒有這一波，遊戲打到這一波時會拒絕"
            : w.rejected
              ? "：沒有可以出兵的組，遊戲打到這一波時會拒絕"
              : w.total !== null
                ? `：${w.groups.length} 組，共 ${w.total} 隻`
                : `：${w.groups.length} 組，隻數無法確定`}
          {w.groups.length > 0 && (
            <ul className={styles.integrityGroups}>
              {w.groups.map((g) => (
                <li key={g.index}>
                  {g.name ?? g.enemyId}
                  {g.count !== null ? ` × ${g.count}` : ""}（{g.path}）
                  {g.outcome !== "spawn" && g.notes.length > 0 && (
                    <span className={styles.integrityGroupNote}>
                      ：{g.notes.join("；")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

function Detail({
  map,
  enemies,
  testId,
}: {
  map: MapConfig;
  enemies: LoadState<EnemyConfig[]>;
  testId: string;
}) {
  const { kind, problem } = mapIntegrity(map);
  return (
    <div className={styles.integrityDetail} data-testid={testId}>
      <div className={styles.integrityDetailHead}>
        <strong>{map.map_id}</strong> {map.name} <Chip kind={kind} />
      </div>
      {problem && (
        <div className={styles.integrityProblem}>
          {stageDataProblemText(problem)}
        </div>
      )}
      <WaveList map={map} enemies={enemies} />
    </div>
  );
}

export default function MapIntegrityPanel({
  list,
  enemies,
  selectedId,
  onSelect,
  onReloadList,
  onReloadEnemies,
  draft,
  draftLoaded,
  draftMapDirty,
  draftWavesDirty,
}: {
  list: LoadState<MapConfig[]>;
  enemies: LoadState<EnemyConfig[]>;
  selectedId: string;
  onSelect: (mapId: string) => void;
  onReloadList: () => void;
  onReloadEnemies: () => void;
  /** 編輯器目前畫面的內容（地圖與波次，尚未保存的修改也在內） */
  draft: MapConfig;
  /** 目前畫面是從設定載入（或保存後讀回）的地圖；新地圖、匯入的 JSON 不是 */
  draftLoaded: boolean;
  draftMapDirty: boolean;
  draftWavesDirty: boolean;
}) {
  const [filter, setFilter] = useState<IntegrityFilter>("all");
  const maps = useMemo(
    () => (list.status === "loaded" ? list.data : []),
    [list]
  );
  const summary = useMemo(() => integritySummary(maps), [maps]);
  const shown = useMemo(() => filterByIntegrity(maps, filter), [maps, filter]);
  const selected = maps.find((m) => m.map_id === selectedId) ?? null;

  const FILTERS: { id: IntegrityFilter; label: string; count: number }[] = [
    { id: "all", label: "全部", count: summary.total },
    { id: "complete", label: "資料完整", count: summary.complete },
    { id: "incomplete", label: "待補資料", count: summary.incomplete },
  ];

  return (
    <div className={styles.panelCard} data-testid="map-integrity">
      <div className={styles.panelTitle}>地圖資料檢查</div>

      {list.status === "idle" && (
        <div className={styles.integrityNote} data-testid="integrity-state">
          還沒讀取地圖清單：按「載入清單」讀取設定後才能檢查。
        </div>
      )}
      {list.status === "loading" && (
        <div
          className={styles.integrityNote}
          data-testid="integrity-state"
          role="status"
        >
          正在讀取地圖清單…
        </div>
      )}
      {list.status === "error" && (
        <div
          className={styles.integrityError}
          data-testid="integrity-state"
          role="alert"
        >
          地圖清單讀取失敗（{list.error}），不知道設定裡有哪些地圖，不是 0 張。
          <button
            type="button"
            className={styles.toolBtn}
            onClick={onReloadList}
          >
            重新讀取清單
          </button>
        </div>
      )}
      {list.status === "loaded" && (
        <>
          <div className={styles.integrityNote} data-testid="integrity-summary">
            {integritySummaryText(summary)}
          </div>
          {summary.total > 0 && (
            <>
              <div
                className={styles.integrityFilters}
                role="group"
                aria-label="依資料狀態篩選地圖"
              >
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`${styles.toolBtn} ${filter === f.id ? styles.toolBtnActive : ""}`}
                    aria-pressed={filter === f.id}
                    onClick={() => setFilter(f.id)}
                  >
                    {f.label} {f.count}
                  </button>
                ))}
              </div>
              <ul
                className={styles.integrityList}
                aria-label="地圖清單"
                data-testid="integrity-list"
              >
                {shown.map((m) => {
                  const kind = mapIntegrity(m).kind;
                  return (
                    <li key={m.map_id}>
                      <button
                        type="button"
                        className={`${styles.integrityItem} ${m.map_id === selectedId ? styles.integrityItemActive : ""}`}
                        aria-pressed={m.map_id === selectedId}
                        data-kind={kind}
                        onClick={() => onSelect(m.map_id)}
                      >
                        <span className={styles.integrityItemName}>
                          {m.map_id} {m.name}
                        </span>
                        <Chip kind={kind} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {selected && (
                <Detail
                  map={selected}
                  enemies={enemies}
                  testId="integrity-selected"
                />
              )}
            </>
          )}
        </>
      )}

      {enemies.status === "error" && (
        <div className={styles.integrityError}>
          敵人設定讀取失敗，無法判讀每一組能不能出兵。
          <button
            type="button"
            className={styles.toolBtn}
            onClick={onReloadEnemies}
          >
            重新讀取敵人設定
          </button>
        </div>
      )}

      <div className={styles.integrityDraft} data-testid="integrity-draft">
        <div className={styles.integrityDetailHead}>目前畫面（草稿）</div>
        {!draftLoaded && (
          <div className={styles.integrityNote}>
            目前畫面不是從設定載入的地圖（預設畫面、新地圖或匯入的
            JSON），設定裡還沒有這些內容。
          </div>
        )}
        {(draftMapDirty || draftWavesDirty) && (
          <div className={styles.integrityWarn} data-testid="integrity-dirty">
            {[
              draftMapDirty ? "地圖有尚未保存的修改" : "",
              draftWavesDirty ? "波次有尚未保存的修改" : "",
            ]
              .filter(Boolean)
              .join("、")}
            。地圖用「更新至 Sheet」、波次用「儲存波次至
            Sheet」分別保存；檢查草稿不代表已經保存或上線。
          </div>
        )}
        <Detail map={draft} enemies={enemies} testId="integrity-draft-detail" />
      </div>

      <div className={styles.integrityNote}>
        「資料完整」只代表路線與波次都有資料，和玩家是否已解鎖無關；也不保證每一波都能出兵或過關，實際出兵以遊戲的判斷為準。
      </div>
    </div>
  );
}
