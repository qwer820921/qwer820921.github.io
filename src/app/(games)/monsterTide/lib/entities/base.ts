import type { Base } from "../../types";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "../constants";

const BASE_WIDTH = 80;
const BASE_HEIGHT = 20;
const BASE_MAX_HP = 100;

export function createBase(permanentHpBonus = 0): Base {
  const maxHp = BASE_MAX_HP + permanentHpBonus;
  return {
    x: (CANVAS_WIDTH - BASE_WIDTH) / 2,
    y: CANVAS_HEIGHT - BASE_HEIGHT,
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    maxHp,
    currentHp: maxHp,
  };
}
