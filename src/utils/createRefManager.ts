import { useRef } from "react";

export function createRefManager<T extends HTMLElement>() {
  const refs = useRef<(T | null)[]>([]);

  return {
    refs: refs.current,
    get: (index: number) => refs.current[index],
    set: (index: number, el: T | null) => {
      refs.current[index] = el;
    },
    insert: (index: number) => {
      refs.current.splice(index, 0, null);
    },
    remove: (index: number) => {
      refs.current.filter((ref, idx) => idx !== index);
    },
    reset: (count: number) => {
      refs.current = Array(count).fill(null);
    },
  };
}
