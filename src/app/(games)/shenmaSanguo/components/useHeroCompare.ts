"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HeroConfig } from "../types";
import { COMPARE_MAX, pruneCompare, toggleCompare } from "../utils/heroCompare";

/**
 * 兩位武將比較的畫面狀態（主頁武將視窗、獨立武將頁共用）：比較模式、已選的 hero_id、選滿時的說明、比較視窗是否開著。
 * 只記 hero_id，數值每次由目前的存檔與設定計算（utils/heroCompare）；切換存檔時全部清掉。
 * - 已載入的有效設定清單（含空清單）沒有某位已選的武將：把他永久移出選取，之後設定再有他也不會自動回來
 * - 設定載入中或讀取失敗（configs＝null）：不顯示任何選取、不拿舊資料比較，但也不把選取當成失效
 * - 比較視窗只在選滿兩位時顯示；少於兩位（或設定還沒好）就關閉，之後選取或設定恢復也不自動重開，要再按「比較這兩位」
 */
export function useHeroCompare(
  playerKey: string | null,
  configs: readonly HeroConfig[] | null
) {
  const [active, setActive] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [refused, setRefused] = useState(false);
  const [open, setOpen] = useState(false);

  const keyRef = useRef(playerKey);
  useEffect(() => {
    if (keyRef.current === playerKey) return;
    keyRef.current = playerKey;
    setActive(false);
    setIds([]);
    setRefused(false);
    setOpen(false);
  }, [playerKey]);

  const selected = useMemo(
    () => (configs ? pruneCompare(ids, configs) : []),
    [ids, configs]
  );
  const complete = selected.length === COMPARE_MAX;
  // 失效的選取只在有效清單時才寫回（選取是 ids 依序過濾的結果，長度相同就是沒有變化，不會再觸發更新）
  useEffect(() => {
    if (configs && selected.length !== ids.length) setIds(selected);
  }, [configs, ids, selected]);
  useEffect(() => {
    if (open && !complete) setOpen(false);
  }, [open, complete]);

  return {
    active,
    selected,
    refused,
    open: open && complete,
    toggleMode: () => {
      setActive((a) => !a);
      setIds([]);
      setRefused(false);
      setOpen(false);
    },
    pick: (heroId: string) => {
      const r = toggleCompare(selected, heroId);
      setIds(r.selected);
      setRefused(r.refused);
    },
    clear: () => {
      setIds([]);
      setRefused(false);
    },
    start: () => {
      if (complete) setOpen(true);
    },
    close: () => setOpen(false),
  };
}
