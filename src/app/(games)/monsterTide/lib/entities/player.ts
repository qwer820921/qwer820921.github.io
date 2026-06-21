import type { Player } from "../../types";
import { CANVAS_WIDTH, PLAYER_FIXED_Y } from "../constants";

export function createPlayer(permanentDmgBonus = 0): Player {
  return {
    x: CANVAS_WIDTH / 2,
    y: PLAYER_FIXED_Y,
    width: 32,
    height: 48,
    baseSpeed: 200,
    weapons: [{ type: "basic_shot", level: 1, attackTimer: 0 }],
    passiveStack: {
      damageMultiplier: 1.0 + permanentDmgBonus,
      attackSpeedMultiplier: 1.0,
      moveSpeedMultiplier: 1.0,
      baseHpBonus: 0,
      rangeMultiplier: 1.0,
    },
  };
}
