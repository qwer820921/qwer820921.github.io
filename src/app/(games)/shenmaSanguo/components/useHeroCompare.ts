"use client";

import { useEffect, useRef, useState } from "react";
import { HeroConfig } from "../types";
import { COMPARE_MAX, pruneCompare, toggleCompare } from "../utils/heroCompare";

/**
 * 兩位武將比較的畫面狀態（主頁武將視窗、獨立武將頁共用）：比較模式、已選的 hero_id、選滿時的說明、比較視窗是否開著。
 * 只記 hero_id，數值每次由目前的存檔與設定計算（utils/heroCompare）；切換存檔時全部清掉，
 * 設定重新載入後不在設定裡的武將自動拿掉（比較視窗少於兩位時不顯示）
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

  const selected = configs ? pruneCompare(ids, configs) : [];
  return {
    active,
    selected,
    refused,
    open: open && selected.length === COMPARE_MAX,
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
      if (selected.length === COMPARE_MAX) setOpen(true);
    },
    close: () => setOpen(false),
  };
}
