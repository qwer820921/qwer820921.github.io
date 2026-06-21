import type { SaveData, PermanentUpgradeType } from "../../types";

const SAVE_KEY = "monsterTide_save";

const DEFAULT_SAVE: SaveData = {
  totalSouls: 0,
  clearedStages: [],
  permanentUpgrades: { base_atk: 0, base_hp: 0, start_weapon: 0 },
};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      totalSouls: parsed.totalSouls ?? 0,
      clearedStages: parsed.clearedStages ?? [],
      permanentUpgrades: {
        ...DEFAULT_SAVE.permanentUpgrades,
        ...(parsed.permanentUpgrades ?? {}),
      },
    };
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

export function addSouls(amount: number): void {
  if (amount <= 0) return;
  const save = loadSave();
  save.totalSouls += amount;
  writeSave(save);
}

export function markStageCleared(stageId: number): void {
  const save = loadSave();
  if (!save.clearedStages.includes(stageId)) {
    save.clearedStages.push(stageId);
    writeSave(save);
  }
}

export function purchaseUpgrade(
  type: PermanentUpgradeType,
  cost: number,
  maxLevel: number
): boolean {
  const save = loadSave();
  if (save.permanentUpgrades[type] >= maxLevel) return false;
  if (save.totalSouls < cost) return false;
  save.totalSouls -= cost;
  save.permanentUpgrades[type] += 1;
  writeSave(save);
  return true;
}
