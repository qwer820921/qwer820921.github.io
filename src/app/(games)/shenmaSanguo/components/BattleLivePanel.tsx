"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import { Col, Row } from "react-bootstrap";
import { ListUl } from "react-bootstrap-icons";
import { EnemyConfig, HeroConfig } from "../types";
import {
  EMPTY_ENEMY_QUERY,
  EMPTY_HERO_QUERY,
  ENEMY_PAGE_SIZE,
  ENEMY_SORTS,
  ENEMY_STATUS_FILTERS,
  EnemyQuery,
  EnemySort,
  EnemyStatus,
  HERO_HEALTH_FILTERS,
  HERO_SKILL_FILTERS,
  HERO_SORTS,
  HeroQuery,
  ObsEnemy,
  configArmor,
  enemyName,
  enemyPage,
  filterEnemies,
  filterHeroes,
  heroNameOf,
  hpRatio,
  isEnemyQueryActive,
  isHeroQueryActive,
  pct,
  secText,
  skillName,
  skillStateText,
  sortEnemies,
  spawnProgressText,
} from "../utils/battleObservation";
import { useBattleObservationStore } from "../store/battleObservationStore";
import styles from "../styles/shenmaSanguo.module.css";

/** 戰況區塊的 id（一頁只有一個戰場）：開關按鈕用 aria-controls 指向它 */
export const BATTLE_LIVE_ID = "shenma-battle-live";

/** 遊戲畫面右邊到視窗右緣至少有這麼寬（面板寬 300＋兩側留白）時，面板固定在視窗右側；否則接在戰場下方（不疊在遊戲畫面上） */
const SIDE_MIN_PX = 324;
/** 接在戰場下方時，面板上下的外距（和 CSS 的 battleLiveBelow 相同） */
const BELOW_MARGIN_PX = 12;

/**
 * 戰況的開關（兩個戰鬥入口頂部的圖示按鈕，名稱「戰況」）：只切換顯示，不移動焦點、不暫停戰鬥。
 * 只有遊戲宣告了戰況觀測（新版遊戲）時才出現
 */
export function BattleLiveToggle({
  open,
  onToggle,
  buttonRef,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  className: string;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={className}
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={BATTLE_LIVE_ID}
      aria-label="戰況：武將技能與敵軍"
      title={open ? "收起戰況" : "戰況：武將技能與敵軍（只是查看）"}
      data-testid="battle-live-toggle"
    >
      <ListUl size={14} aria-hidden="true" />
    </button>
  );
}

type Tab = "heroes" | "enemies";

const STATE_TEXT: Record<number, string> = {
  0: "等待關卡",
  1: "備戰中",
  2: "戰鬥中",
  3: "已結算",
};

/**
 * 戰況（兩個戰鬥入口共用）：「武將技能」列出已部署武將目前的生命與技能狀態，「敵軍」列出場上活著的敵人（含受控的）與選中那一隻的詳情。
 * 資料是遊戲最新送來的一份（utils/battleObservation）：不用牆鐘倒數，數字照遊戲的戰鬥時間；換一場時清空，收到新的一份才顯示。
 * 只是查看：不送任何命令給遊戲（不改目標、不暫停）、不發 API、不寫存檔。不疊在遊戲畫面上：右側空間夠寬時固定在視窗右側，
 * 否則接在戰場下方。內容每 0.25 秒更新，所以不使用會朗讀整份清單的即時區域；Esc 或「收起」關閉並把焦點還給開關
 */
export function BattleLivePanel({
  open,
  onClose,
  stageRef,
  toggleRef,
  battleId,
  enemiesConfig,
  heroesConfig,
}: {
  open: boolean;
  onClose: () => void;
  stageRef: RefObject<HTMLElement | null>;
  toggleRef?: RefObject<HTMLButtonElement | null>;
  /** 目前這一場的 battle_id：觀測不是這一場的就當作還沒收到 */
  battleId: string | null;
  /** 這一場送進遊戲的敵人設定（中文名稱、設定的護甲） */
  enemiesConfig: EnemyConfig[] | null | undefined;
  heroesConfig: HeroConfig[] | null | undefined;
}) {
  // 已採用的最新一份觀測（還沒收到時是 null）：只有這個面板訂閱，戰鬥入口不跟著重繪
  const obs = useBattleObservationStore((s) => s.observation);
  const panelRef = useRef<HTMLElement>(null);
  const [side, setSide] = useState(false);
  const sideRef = useRef(false);
  const [tab, setTab] = useState<Tab>("heroes");
  const [page, setPage] = useState(0);
  // 選中的敵人：屬於哪一場、哪一隻（換一場時自然失效，不會指到新一場的敵人）
  const [picked, setPicked] = useState<{ battle: string; uid: string } | null>(
    null
  );
  // 敵軍的搜尋、狀態篩選與排序（只篩選、排列畫面上的清單）
  const [query, setQuery] = useState<EnemyQuery>(EMPTY_ENEMY_QUERY);
  const [enemySort, setEnemySort] = useState<EnemySort>("spawn");
  // 已部署武將的搜尋、生命狀態篩選與排序
  const [heroQuery, setHeroQuery] = useState<HeroQuery>(EMPTY_HERO_QUERY);
  const searchRef = useRef<HTMLInputElement>(null);
  const heroSearchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // 換一場：清掉搜尋、篩選、排序、頁數與選中的敵人。焦點原本在敵人清單或換頁鈕（之後會消失）時交給搜尋框，
  // 其他情況不移動焦點
  const [shownBattle, setShownBattle] = useState(battleId);
  if (battleId !== shownBattle) {
    setShownBattle(battleId);
    setQuery(EMPTY_ENEMY_QUERY);
    setEnemySort("spawn");
    setHeroQuery(EMPTY_HERO_QUERY);
    setPage(0);
    setPicked(null);
  }
  useEffect(() => {
    if (listRef.current?.contains(document.activeElement))
      searchRef.current?.focus();
  }, [shownBattle]);
  const changeQuery = (q: EnemyQuery) => {
    setQuery(q);
    setPage(0);
  };
  const toggleStatus = (id: EnemyStatus) =>
    changeQuery({
      ...query,
      statuses: query.statuses.includes(id)
        ? query.statuses.filter((s) => s !== id)
        : [...query.statuses, id],
    });
  const clearQuery = () => {
    changeQuery(EMPTY_ENEMY_QUERY);
    searchRef.current?.focus();
  };
  const changeSort = (s: EnemySort) => {
    setEnemySort(s);
    setPage(0);
  };
  const clearHeroQuery = () => {
    setHeroQuery({ ...EMPTY_HERO_QUERY, sort: heroQuery.sort });
    heroSearchRef.current?.focus();
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const r = stage.getBoundingClientRect();
      const panel = panelRef.current;
      // 接在下方時把面板的高度加回來（遊戲畫面會因為面板變小、右側變寬；不加回會在右側與下方之間來回切換）
      const below = !!panel && !panel.hidden && !sideRef.current;
      const fullH =
        r.height +
        (below ? panel.getBoundingClientRect().height + BELOW_MARGIN_PX : 0);
      // 遊戲畫面固定 3:4、在戰場區域置中：算出它的右緣到視窗右緣的距離
      const frameW = Math.min(r.width, fullH * 0.75);
      const right = r.left + (r.width + frameW) / 2;
      const next = window.innerWidth - right >= SIDE_MIN_PX;
      if (next !== sideRef.current) {
        sideRef.current = next;
        setSide(next);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(stage);
    if (panelRef.current) ro.observe(panelRef.current);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [stageRef]);

  const current = obs && battleId && obs.battle_id === battleId ? obs : null;
  const collapse = () => {
    onClose();
    toggleRef?.current?.focus();
  };

  const charmedCount = current
    ? current.enemies.filter((e) => e.charmed).length
    : 0;
  const pickedUid =
    picked && current && picked.battle === current.battle_id
      ? picked.uid
      : null;
  const pickedEnemy = pickedUid
    ? (current?.enemies.find((e) => e.uid === pickedUid) ?? null)
    : null;
  const filtering = isEnemyQueryActive(query);
  // 過濾之後排序、再分頁（同數值依出場順序，選中的敵人照 uid 保留）
  const matched = current
    ? sortEnemies(
        filterEnemies(current.enemies, query, enemiesConfig),
        enemySort
      )
    : [];
  const pg = enemyPage(matched, page);
  const pickedHidden =
    !!pickedEnemy && filtering && !matched.some((e) => e.uid === pickedUid);
  const progress = current ? spawnProgressText(current) : null;
  const sortNote =
    ENEMY_SORTS.find((s) => s.id === enemySort)?.note ?? "依出場順序排列";
  const heroFiltering = isHeroQueryActive(heroQuery);
  const heroRows = current
    ? filterHeroes(current.heroes, heroQuery, heroesConfig)
    : [];

  return (
    <section
      ref={panelRef}
      id={BATTLE_LIVE_ID}
      className={`${styles.battleLive} ${side ? styles.battleLiveSide : styles.battleLiveBelow}`}
      aria-label="戰況"
      hidden={!open}
      data-testid="battle-live"
      data-placement={side ? "side" : "below"}
      data-seq={current?.seq ?? ""}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          collapse();
        }
      }}
    >
      <Row className="g-1 align-items-center">
        <Col xs="auto">
          <button
            type="button"
            className={`${styles.battleLiveTab} ${tab === "heroes" ? styles.battleLiveTabOn : ""}`}
            aria-pressed={tab === "heroes"}
            onClick={() => setTab("heroes")}
            data-testid="battle-live-tab-heroes"
          >
            武將技能
          </button>
        </Col>
        <Col xs="auto">
          <button
            type="button"
            className={`${styles.battleLiveTab} ${tab === "enemies" ? styles.battleLiveTabOn : ""}`}
            aria-pressed={tab === "enemies"}
            onClick={() => setTab("enemies")}
            data-testid="battle-live-tab-enemies"
          >
            敵軍{current ? `（${current.enemy_total}）` : ""}
          </button>
        </Col>
        <Col className="text-end">
          <button
            type="button"
            className={styles.battleLiveTab}
            onClick={collapse}
            aria-controls={BATTLE_LIVE_ID}
            aria-expanded={open}
            data-testid="battle-live-collapse"
          >
            收起
          </button>
        </Col>
      </Row>

      <div className={styles.battleLiveStatus} data-testid="battle-live-status">
        {current
          ? `目前戰況：第 ${current.wave} 波・${STATE_TEXT[current.state] ?? ""}${current.paused ? "・已暫停（時間不走）" : ""}`
          : "等待遊戲送來這一場的戰況…"}
      </div>
      {progress && (
        <div
          className={styles.battleLiveStatus}
          data-testid="battle-live-spawn"
          data-wave={current?.spawn?.wave}
          data-planned={current?.spawn?.planned}
          data-spawned={current?.spawn?.spawned}
          data-pending={current?.spawn?.pending}
          data-alive={current?.spawn?.alive}
        >
          {progress}
        </div>
      )}

      {tab === "heroes" && (
        <div className={styles.battleLiveBody} data-testid="battle-live-heroes">
          {current && current.heroes.length === 0 && (
            <div className={styles.battleLiveEmpty}>還沒有部署武將。</div>
          )}
          {current && current.heroes.length > 0 && (
            <div data-testid="battle-live-hero-filters">
              <Row className="g-1 align-items-center">
                <Col xs={12}>
                  <input
                    ref={heroSearchRef}
                    type="search"
                    className={styles.battleLiveSearch}
                    value={heroQuery.text}
                    onChange={(e) =>
                      setHeroQuery({ ...heroQuery, text: e.target.value })
                    }
                    placeholder="搜尋武將名稱或 ID"
                    aria-label="搜尋已部署的武將（中文名稱或 ID）"
                    data-testid="battle-live-hero-search"
                  />
                </Col>
                <Col xs={12}>
                  <div
                    role="group"
                    aria-label="生命狀態"
                    className="d-flex flex-wrap gap-1"
                  >
                    {HERO_HEALTH_FILTERS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`${styles.battleLiveTab} ${heroQuery.health === f.id ? styles.battleLiveTabOn : ""}`}
                        aria-pressed={heroQuery.health === f.id}
                        onClick={() =>
                          setHeroQuery({ ...heroQuery, health: f.id })
                        }
                        data-testid={`battle-live-hero-health-${f.id}`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </Col>
                <Col xs={12}>
                  <div
                    role="group"
                    aria-label="技能狀態"
                    className="d-flex flex-wrap gap-1"
                  >
                    {HERO_SKILL_FILTERS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`${styles.battleLiveTab} ${heroQuery.skill === f.id ? styles.battleLiveTabOn : ""}`}
                        aria-pressed={heroQuery.skill === f.id}
                        onClick={() =>
                          setHeroQuery({ ...heroQuery, skill: f.id })
                        }
                        data-testid={`battle-live-hero-skill-${f.id}`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </Col>
                <Col xs={12}>
                  <div
                    role="group"
                    aria-label="武將排序"
                    className="d-flex flex-wrap gap-1 align-items-center"
                  >
                    <span className={styles.battleLiveMuted}>排序</span>
                    {HERO_SORTS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`${styles.battleLiveTab} ${heroQuery.sort === s.id ? styles.battleLiveTabOn : ""}`}
                        aria-pressed={heroQuery.sort === s.id}
                        onClick={() =>
                          setHeroQuery({ ...heroQuery, sort: s.id })
                        }
                        data-testid={`battle-live-hero-sort-${s.id}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </Col>
              </Row>
              <div
                className={styles.battleLiveMuted}
                data-testid="battle-live-hero-note"
              >
                {heroQuery.sort === "hp"
                  ? "依生命比例由低到高（同比例依部署順序）；生命即時更新，順序可能跟著改變"
                  : "依部署順序"}
              </div>
              {heroQuery.skill !== "all" && (
                <div
                  className={styles.battleLiveMuted}
                  data-testid="battle-live-hero-skill-note"
                >
                  冷卻中只算有冷卻的技能（怪力、魅惑），本場已用過只算每場一次的技能（衝鋒、奇襲），無特殊技能是沒有啟用技能的武將；常駐與命中時觸發的技能不列入。狀態照遊戲送來的最新戰況
                </div>
              )}
              {heroFiltering && (
                <div
                  className={styles.battleLiveSummary}
                  data-testid="battle-live-hero-matched"
                  data-matched={heroRows.length}
                  data-total={current.heroes.length}
                >
                  符合 {heroRows.length}／在場 {current.heroes.length} 位
                </div>
              )}
              {heroFiltering && heroRows.length === 0 && (
                <div
                  className={styles.battleLiveEmpty}
                  data-testid="battle-live-hero-no-match"
                >
                  沒有符合的武將。{" "}
                  <button
                    type="button"
                    className={styles.battleLiveTab}
                    onClick={clearHeroQuery}
                    data-testid="battle-live-hero-clear"
                  >
                    清除搜尋與篩選
                  </button>
                </div>
              )}
            </div>
          )}
          {current && heroRows.length > 0 && (
            <ul className={styles.battleLiveList}>
              {heroRows.map((h) => (
                <li
                  key={h.uid}
                  className={styles.battleLiveItem}
                  data-testid="live-hero"
                  data-uid={h.uid}
                  data-hero-id={h.hero_id}
                  data-hp={h.hp}
                  data-hp-ratio={hpRatio(h)}
                  data-skill={h.skill?.id ?? ""}
                  data-remaining={h.skill?.remaining ?? ""}
                  data-used={
                    typeof h.skill?.used === "boolean"
                      ? h.skill.used
                        ? "1"
                        : "0"
                      : ""
                  }
                  data-stacks={h.skill?.stacks ?? ""}
                >
                  <div className={styles.battleLiveName}>
                    {heroNameOf(h.hero_id, heroesConfig)}
                    <span className={styles.battleLiveHp}>
                      生命 {Math.ceil(h.hp)}／{Math.round(h.max_hp)}（
                      {pct(hpRatio(h))}%）
                    </span>
                  </div>
                  <div className={styles.battleLiveSkill}>
                    {h.skill
                      ? `${skillName(h.hero_id, h.skill)}：${skillStateText(h.skill)}`
                      : "沒有技能"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "enemies" && (
        <div
          className={styles.battleLiveBody}
          data-testid="battle-live-enemies"
        >
          {current && (
            <div
              className={styles.battleLiveSummary}
              data-testid="battle-live-enemy-total"
              data-total={current.enemy_total}
              data-charmed={charmedCount}
            >
              場上 {current.enemy_total} 隻
              {charmedCount > 0 ? `（其中 ${charmedCount} 隻受控）` : ""}；
              {sortNote}
              {enemySort !== "spawn"
                ? "；即時更新，順序可能跟著戰況改變（選中的敵人照樣是同一隻）"
                : ""}
              ；只是查看，選取不會改變武將或防禦塔的目標
            </div>
          )}
          {current && current.enemy_total === 0 && (
            <div className={styles.battleLiveEmpty}>目前場上沒有敵人。</div>
          )}
          {current && current.enemy_total > 0 && (
            <div data-testid="battle-live-filters">
              <Row className="g-1 align-items-center">
                <Col xs={12}>
                  <input
                    ref={searchRef}
                    type="search"
                    className={styles.battleLiveSearch}
                    value={query.text}
                    onChange={(e) =>
                      changeQuery({ ...query, text: e.target.value })
                    }
                    placeholder="搜尋敵軍名稱或 ID"
                    aria-label="搜尋敵軍（中文名稱或 ID）"
                    data-testid="battle-live-search"
                  />
                </Col>
                <Col xs={12}>
                  <div
                    role="group"
                    aria-label="狀態篩選（同時選多個時要全部符合）"
                    className="d-flex flex-wrap gap-1"
                  >
                    <button
                      type="button"
                      className={`${styles.battleLiveTab} ${query.statuses.length === 0 ? styles.battleLiveTabOn : ""}`}
                      aria-pressed={query.statuses.length === 0}
                      onClick={() => changeQuery({ ...query, statuses: [] })}
                      data-testid="battle-live-filter-all"
                    >
                      全部
                    </button>
                    {ENEMY_STATUS_FILTERS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`${styles.battleLiveTab} ${query.statuses.includes(f.id) ? styles.battleLiveTabOn : ""}`}
                        aria-pressed={query.statuses.includes(f.id)}
                        onClick={() => toggleStatus(f.id)}
                        data-testid={`battle-live-filter-${f.id}`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </Col>
              </Row>
              <div className={styles.battleLiveMuted}>
                狀態可以多選，同時選多個時要全部符合
              </div>
              <div
                role="group"
                aria-label="敵軍排序"
                className="d-flex flex-wrap gap-1 align-items-center mt-1"
              >
                <span className={styles.battleLiveMuted}>排序</span>
                {ENEMY_SORTS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`${styles.battleLiveTab} ${enemySort === s.id ? styles.battleLiveTabOn : ""}`}
                    aria-pressed={enemySort === s.id}
                    onClick={() => changeSort(s.id)}
                    data-testid={`battle-live-sort-${s.id}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {filtering && (
                <div
                  className={styles.battleLiveSummary}
                  data-testid="battle-live-matched"
                  data-matched={matched.length}
                  data-total={current.enemy_total}
                >
                  符合 {matched.length}／{current.enemy_total} 隻
                </div>
              )}
              {filtering && matched.length === 0 && (
                <div
                  className={styles.battleLiveEmpty}
                  data-testid="battle-live-no-match"
                >
                  沒有符合的敵軍。{" "}
                  <button
                    type="button"
                    className={styles.battleLiveTab}
                    onClick={clearQuery}
                    data-testid="battle-live-clear"
                  >
                    清除搜尋與篩選
                  </button>
                </div>
              )}
            </div>
          )}
          {current && pg.rows.length > 0 && (
            <div ref={listRef}>
              <ul
                className={styles.battleLiveList}
                data-testid="battle-live-enemy-list"
              >
                {pg.rows.map((e) => (
                  <li key={e.uid}>
                    <button
                      type="button"
                      className={`${styles.battleLiveRow} ${e.uid === pickedUid ? styles.battleLiveRowOn : ""}`}
                      aria-pressed={e.uid === pickedUid}
                      onClick={() =>
                        setPicked({ battle: current.battle_id, uid: e.uid })
                      }
                      data-testid="live-enemy"
                      data-uid={e.uid}
                      data-enemy-id={e.enemy_id}
                      data-hp={e.hp}
                      data-charmed={e.charmed ? "1" : "0"}
                      data-flying={e.flying ? "1" : "0"}
                      data-seq={e.seq}
                      data-hp-ratio={hpRatio(e)}
                      data-atk-eff={e.atk_eff}
                    >
                      <Row className="g-1">
                        <Col xs={5} className={styles.battleLiveCell}>
                          {enemyName(e.enemy_id, enemiesConfig)}
                        </Col>
                        <Col xs={4} className={styles.battleLiveCell}>
                          {Math.ceil(e.hp)}／{Math.round(e.max_hp)}
                          {enemySort === "hp" ? `（${pct(hpRatio(e))}%）` : ""}
                        </Col>
                        <Col xs={3} className={styles.battleLiveCell}>
                          {enemySort === "atk"
                            ? `攻 ${String(Number(e.atk_eff.toFixed(1)))}${e.charmed ? "・受控" : ""}`
                            : `${e.flying ? "飛行" : "地面"}${e.charmed ? "・受控" : ""}`}
                        </Col>
                      </Row>
                    </button>
                  </li>
                ))}
              </ul>
              {pg.pages > 1 && (
                <Row
                  className="g-1 align-items-center mt-1"
                  data-testid="battle-live-pager"
                  data-page={pg.page + 1}
                  data-pages={pg.pages}
                >
                  <Col xs="auto">
                    <button
                      type="button"
                      className={styles.battleLiveTab}
                      disabled={pg.page === 0}
                      onClick={() => setPage(pg.page - 1)}
                      data-testid="battle-live-prev"
                    >
                      上一頁
                    </button>
                  </Col>
                  <Col className="text-center">
                    第 {pg.page + 1}／{pg.pages} 頁（第 {pg.from}～{pg.to}{" "}
                    隻，共{" "}
                    {filtering
                      ? `${matched.length} 隻符合`
                      : `${current.enemy_total} 隻`}
                    ，每頁 {ENEMY_PAGE_SIZE} 隻）
                  </Col>
                  <Col xs="auto">
                    <button
                      type="button"
                      className={styles.battleLiveTab}
                      disabled={pg.page >= pg.pages - 1}
                      onClick={() => setPage(pg.page + 1)}
                      data-testid="battle-live-next"
                    >
                      下一頁
                    </button>
                  </Col>
                </Row>
              )}
            </div>
          )}
          {pickedUid && pickedHidden && (
            <div
              className={styles.battleLiveMuted}
              data-testid="live-enemy-filtered-out"
            >
              選中的敵軍目前不在搜尋與篩選的結果裡（仍在場上）。
            </div>
          )}
          {pickedUid && (
            <EnemyDetail
              enemy={pickedEnemy}
              enemiesConfig={enemiesConfig}
              heroesConfig={heroesConfig}
            />
          )}
        </div>
      )}
    </section>
  );
}

/** 選中那一隻敵人的詳情：已經不在場上（倒下或抵達城池）時說明已離場，不改指到別的敵人 */
function EnemyDetail({
  enemy: e,
  enemiesConfig,
  heroesConfig,
}: {
  enemy: ObsEnemy | null;
  enemiesConfig: EnemyConfig[] | null | undefined;
  heroesConfig: HeroConfig[] | null | undefined;
}) {
  if (!e) {
    return (
      <div
        className={styles.battleLiveDetail}
        data-testid="live-enemy-detail"
        data-gone="1"
      >
        這個敵人已離場（倒下或抵達城池），請從清單選擇其他敵人。
      </div>
    );
  }
  const armor = configArmor(e.enemy_id, enemiesConfig);
  const slowed = e.speed_eff < e.speed - 1e-6;
  return (
    <div
      className={styles.battleLiveDetail}
      data-testid="live-enemy-detail"
      data-uid={e.uid}
      data-gone="0"
    >
      <div className={styles.battleLiveName}>
        {enemyName(e.enemy_id, enemiesConfig)}（第 {e.seq + 1} 隻出場）
      </div>
      <div data-testid="live-enemy-hp">
        生命：{Math.ceil(e.hp)}／{Math.round(e.max_hp)}・
        {e.flying ? "飛行" : "地面"}
      </div>
      <div
        data-testid="live-enemy-atk"
        data-atk={e.atk}
        data-atk-eff={e.atk_eff}
      >
        對阻路武將攻擊力：{String(Number(e.atk_eff.toFixed(2)))}
        {e.atk_eff < e.atk - 1e-6
          ? `（設定 ${String(Number(e.atk.toFixed(2)))}，威壓中，還剩 ${secText(e.atk_down_left)} 秒）`
          : ""}
        ；這是被武將擋住時攻擊那位武將的數值，不是漏到城池的傷害
      </div>
      <div
        data-testid="live-enemy-speed"
        data-speed={e.speed}
        data-speed-eff={e.speed_eff}
      >
        移速：
        {slowed
          ? `目前 ${String(Number(e.speed_eff.toFixed(1)))}（設定 ${String(Number(e.speed.toFixed(1)))}，減速 ${pct(1 - e.speed_eff / e.speed)}%，還剩 ${secText(e.slow_left)} 秒）`
          : `${String(Number(e.speed.toFixed(1)))}（沒有減速）`}
        {e.immune_slow ? "；免疫減速" : ""}
      </div>
      {e.burn_left > 0 && (
        <div data-testid="live-enemy-burn">
          灼燒：還剩 {secText(e.burn_left)} 秒
        </div>
      )}
      {e.stun_left > 0 && (
        <div data-testid="live-enemy-stun">
          暈眩：還剩 {secText(e.stun_left)} 秒
        </div>
      )}
      {e.charmed && (
        <div data-testid="live-enemy-charm" data-left={e.charm_left}>
          受控（魅惑）：還剩 {secText(e.charm_left)} 秒，來源：
          {heroNameOf(e.charm_source, heroesConfig)}
          ；受控時不攻擊武將、不被當成目標，仍計入這一波
        </div>
      )}
      {armor !== null && (
        <div className={styles.battleLiveMuted} data-testid="live-enemy-armor">
          設定護甲 {armor}：目前版本沒有使用，不會減少受到的傷害
        </div>
      )}
    </div>
  );
}
