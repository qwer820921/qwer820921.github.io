import { useRef } from "react";

/**
 * 建立一組可控的 Ref 管理工具，用於追蹤與操作不固定數量的 DOM 元素（如 canvas、input）
 *
 * 適用於「可新增 / 刪除 / 動態排序 / 拖曳調整」的場景
 *
 * @template T - 要管理的 DOM 元素類型，例如 HTMLCanvasElement
 */
export function createRefManager<T extends HTMLElement>() {
  const refs = useRef<(T | null)[]>([]);

  return {
    /**
     * 目前所有 Ref 的陣列參考
     */
    refs: refs.current,

    /**
     * 取得指定 index 的 Ref 元素
     * @param index 要取得的位置
     * @returns DOM 元素或 null
     */
    get: (index: number): T | null => refs.current[index] ?? null,

    /**
     * 設定指定 index 的 DOM 元素 Ref
     * @param index 要設定的位置
     * @param el DOM 元素或 null
     */
    set: (index: number, el: T | null): void => {
      refs.current[index] = el;
    },

    /**
     * 在指定位置插入一個空 Ref（新增元素時使用）
     * @param index 插入的位置
     */
    insert: (index: number): void => {
      refs.current.splice(index, 0, null);
    },

    /**
     * 移除指定位置的 Ref（刪除元素時使用）
     * @param index 要移除的位置
     */
    remove: (index: number): void => {
      refs.current.splice(index, 1);
    },

    /**
     * 依指定數量重設整個 Ref 陣列（全部填 null）
     * @param count 新長度
     */
    reset: (count: number): void => {
      refs.current = Array(count).fill(null);
    },

    /**
     * 移動一個 Ref 的位置（用於拖曳排序）
     * @param fromIndex 原本位置
     * @param toIndex 移動到的新位置
     */
    move: (fromIndex: number, toIndex: number): void => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= refs.current.length ||
        toIndex >= refs.current.length
      )
        return;

      const [movedItem] = refs.current.splice(fromIndex, 1);
      refs.current.splice(toIndex, 0, movedItem);
    },
  };
}
