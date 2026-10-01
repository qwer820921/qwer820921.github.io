"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import { QuestionCircle } from "react-bootstrap-icons";
import { selectTipsOpen, useBattleTipsStore } from "../store/battleTipsStore";
import styles from "../styles/shenmaSanguo.module.css";

/** 提示區塊的 id（一頁只有一個戰場）：開關按鈕用 aria-controls 指向它 */
export const BATTLE_TIPS_ID = "shenma-battle-tips";

/** 遊戲畫面左邊到視窗左緣至少有這麼寬（提示寬 260＋兩側留白）時，提示放在視窗左下角；否則接在戰場下方（不疊在遊戲畫面上） */
const SIDE_MIN_PX = 284;
/** 接在戰場下方時，提示上下的外距（和 CSS 的 battleTipsBelow 相同） */
const BELOW_MARGIN_PX = 14;
/** 還沒量到提示的高度時，估計接在下方要讓出的高度（窄螢幕上展開時的實際高度約 190～210） */
const BELOW_ESTIMATE_PX = 220;

/**
 * 玩法提示的開關（主頁 HUD 與獨立戰鬥頁頂部的圖示按鈕，名稱「玩法提示」）：只切換顯示，不移動焦點、不暫停戰鬥
 */
export function BattleTipsToggle({
  buttonRef,
  className,
}: {
  buttonRef?: RefObject<HTMLButtonElement | null>;
  className: string;
}) {
  const open = useBattleTipsStore(selectTipsOpen);
  const setOpen = useBattleTipsStore((s) => s.setOpen);
  return (
    <button
      ref={buttonRef}
      type="button"
      className={className}
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls={BATTLE_TIPS_ID}
      aria-label="玩法提示"
      title={open ? "收起玩法提示" : "玩法提示"}
      data-testid="battle-tips-toggle"
    >
      <QuestionCircle size={14} aria-hidden="true" />
    </button>
  );
}

/**
 * 戰場的玩法提示（主頁與獨立戰鬥頁共用同一份文字）：部署武將、用戰場金幣建造與升級防禦塔、迎戰與城防。
 * 戰場金幣是這一場的資源，和存檔裡升級武將用的戰場點數分開說明。
 * 放在戰場區域旁邊：遊戲畫面左邊的空間夠寬時固定在視窗左下角，否則接在戰場下方（遊戲畫面依剩下的空間縮放），不疊在遊戲畫面上。
 * 玩家還沒選過展開或收起時，只有展開也不會縮小遊戲畫面（左下角的空間夠、或下方有足夠的留白）才預設展開；
 * 矮的畫面預設收起，部署選單與單位面板才有完整的戰場空間。收起後由開關再打開；收起的按鈕消失時焦點交給開關。出現時不搶焦點
 */
export function BattleTipsPanel({
  stageRef,
  toggleRef,
  hudReserve = 0,
}: {
  /** 戰場區域（data-game-stage）：用它的大小判斷兩側與下方的空間 */
  stageRef: RefObject<HTMLElement | null>;
  toggleRef?: RefObject<HTMLButtonElement | null>;
  /** 接在下方時戰場區域上方另外讓出的高度（主頁的 HUD 疊在戰場上，和 CSS 的 padding-top 相同） */
  hudReserve?: number;
}) {
  const open = useBattleTipsStore(selectTipsOpen);
  const setOpen = useBattleTipsStore((s) => s.setOpen);
  const panelRef = useRef<HTMLElement>(null);
  const [side, setSide] = useState(false);
  const sideRef = useRef(false);
  // 接在下方時量到的提示高度（收起後仍用它估計，避免預設展開與收起來回切換）
  const measuredRef = useRef(0);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const r = stage.getBoundingClientRect();
      const panel = panelRef.current;
      const shownBelow = !!panel && !panel.hidden && !sideRef.current;
      const panelH = shownBelow
        ? panel.getBoundingClientRect().height + BELOW_MARGIN_PX
        : 0;
      if (shownBelow) measuredRef.current = panelH;
      // 沒有提示時戰場區域的高度（接在下方時把提示的高度加回來，切換位置後才不會來回跳動）
      const fullH = r.height + panelH;
      // 遊戲畫面固定 3:4、在戰場區域置中（D22）：算出它的左緣到視窗左緣的距離
      const frameW = Math.min(r.width, fullH * 0.75);
      const nextSide = r.left + (r.width - frameW) / 2 >= SIDE_MIN_PX;
      if (nextSide !== sideRef.current) {
        sideRef.current = nextSide;
        setSide(nextSide);
      }
      // 接在下方時遊戲畫面還能維持原本的寬度：下方有足夠的留白
      const need = shownBelow
        ? panelH
        : Math.max(BELOW_ESTIMATE_PX, measuredRef.current);
      const roomy =
        nextSide || (fullH - need - hudReserve) * 0.75 >= frameW - 0.5;
      if (useBattleTipsStore.getState().roomy !== roomy) {
        useBattleTipsStore.getState().setRoomy(roomy);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(stage);
    if (panelRef.current) ro.observe(panelRef.current);
    // 視窗變寬變窄時，戰場區域的大小可能不變、只有位置改變（例如主頁的置中欄）
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [stageRef, hudReserve]);

  const collapse = () => {
    setOpen(false);
    toggleRef?.current?.focus();
  };

  return (
    <section
      ref={panelRef}
      id={BATTLE_TIPS_ID}
      className={`${styles.battleTips} ${side ? styles.battleTipsSide : styles.battleTipsBelow}`}
      aria-label="玩法提示"
      hidden={!open}
      data-testid="battle-tips"
      data-placement={side ? "side" : "below"}
    >
      <div className={styles.battleTipsHeader}>
        <span className={styles.battleTipsTitle}>玩法提示</span>
        <button
          type="button"
          className={styles.battleTipsClose}
          onClick={collapse}
          aria-controls={BATTLE_TIPS_ID}
          aria-expanded={open}
          data-testid="battle-tips-collapse"
        >
          收起
        </button>
      </div>
      <ol className={styles.battleTipsList}>
        <li>點地圖上的道路或建築位，從選單派出隊伍裡的武將（不花金幣）。</li>
        <li>
          在建築位用這一場的戰場金幣建造防禦塔，點選已建的塔可以升級；擊倒敵人會再得到金幣。
        </li>
        <li>
          準備好後按「迎戰」開始下一波。敵人走到終點會扣城防，城防歸零就落敗。
        </li>
      </ol>
      <p className={styles.battleTipsNote}>
        戰場金幣每一場開始時重新發放、只在戰場內使用；升級武將用的是存檔裡的戰場點數，兩者不同。
      </p>
    </section>
  );
}
