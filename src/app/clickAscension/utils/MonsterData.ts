export enum MonsterRarity {
  COMMON = "COMMON",
  RARE = "RARE",
  BOSS = "BOSS",
}

export interface MonsterTemplate {
  name: string;
  emoji: string;
  rarity: MonsterRarity;
  // Multipliers relative to standard stage scaling
  hpMultiplier: number;
  goldMultiplier: number;
  xpMultiplier: number;
  dropDiamonds?: number; // Fixed amount or max random amount
}

// --- 1. Common Monsters (By Stage Range) ---
export const COMMON_MONSTERS: Record<string, MonsterTemplate[]> = {
  STAGE_1_20: [
    {
      name: "史萊姆",
      emoji: "👾",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1,
      goldMultiplier: 1,
      xpMultiplier: 1,
    },
    {
      name: "小蘑菇",
      emoji: "🍄",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 0.9,
      goldMultiplier: 0.9,
      xpMultiplier: 0.9,
    },
    {
      name: "野狼",
      emoji: "🐺",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.1,
      goldMultiplier: 1.1,
      xpMultiplier: 1.1,
    },
    {
      name: "野豬",
      emoji: "🐗",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.2,
      goldMultiplier: 1.1,
      xpMultiplier: 1.1,
    },
    {
      name: "青蛇",
      emoji: "🐍",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 0.8,
      goldMultiplier: 1,
      xpMultiplier: 1.2,
    },
  ],
  STAGE_21_40: [
    {
      name: "大蝙蝠",
      emoji: "🦇",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 0.9,
      goldMultiplier: 1.2,
      xpMultiplier: 1.1,
    },
    {
      name: "毒蜘蛛",
      emoji: "🕷️",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1,
      goldMultiplier: 1.1,
      xpMultiplier: 1.1,
    },
    {
      name: "骷髏兵",
      emoji: "💀",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.2,
      goldMultiplier: 1.1,
      xpMultiplier: 1.1,
    },
    {
      name: "蠍子",
      emoji: "🦂",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.3,
      goldMultiplier: 1.3,
      xpMultiplier: 1.2,
    },
    {
      name: "巨鼠",
      emoji: "🐀",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.1,
      goldMultiplier: 1,
      xpMultiplier: 1,
    },
  ],
  STAGE_41_60: [
    // Cultivation / Spirit Theme
    {
      name: "靈狐",
      emoji: "🦊",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.2,
      goldMultiplier: 1.5,
      xpMultiplier: 1.5,
    },
    {
      name: "竹妖",
      emoji: "🎋",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.4,
      goldMultiplier: 1.3,
      xpMultiplier: 1.3,
    },
    {
      name: "武道家",
      emoji: "🥋",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.5,
      goldMultiplier: 1.4,
      xpMultiplier: 1.6,
    },
    {
      name: "白虎",
      emoji: "🐯",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.6,
      goldMultiplier: 1.6,
      xpMultiplier: 1.6,
    },
    {
      name: "靈鷹",
      emoji: "🦅",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.1,
      goldMultiplier: 1.4,
      xpMultiplier: 1.4,
    },
  ],
  STAGE_61_80: [
    // Elemental
    {
      name: "火元素",
      emoji: "🔥",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.4,
      goldMultiplier: 1.6,
      xpMultiplier: 1.5,
    },
    {
      name: "冰魔像",
      emoji: "❄️",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.6,
      goldMultiplier: 1.6,
      xpMultiplier: 1.5,
    },
    {
      name: "雷靈",
      emoji: "⚡",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.3,
      goldMultiplier: 1.8,
      xpMultiplier: 1.6,
    },
    {
      name: "風怪",
      emoji: "🌪️",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.3,
      goldMultiplier: 1.5,
      xpMultiplier: 1.5,
    },
    {
      name: "岩石巨人",
      emoji: "🗿",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 2.0,
      goldMultiplier: 1.5,
      xpMultiplier: 1.2,
    },
  ],
  STAGE_81_PLUS: [
    // Demon / Hell
    {
      name: "惡鬼",
      emoji: "👹",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.8,
      goldMultiplier: 2,
      xpMultiplier: 2,
    },
    {
      name: "幽靈",
      emoji: "👻",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.5,
      goldMultiplier: 1.8,
      xpMultiplier: 1.8,
    },
    {
      name: "吸血鬼",
      emoji: "🧛",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 1.7,
      goldMultiplier: 2.2,
      xpMultiplier: 2,
    },
    {
      name: "殭屍",
      emoji: "🧟",
      rarity: MonsterRarity.COMMON,
      hpMultiplier: 2.2,
      goldMultiplier: 1.6,
      xpMultiplier: 1.8,
    },
  ],
};

// --- 2. Rare Monsters (Global) ---
export const RARE_MONSTERS: MonsterTemplate[] = [
  {
    name: "黃金史萊姆",
    emoji: "💰",
    rarity: MonsterRarity.RARE,
    hpMultiplier: 0.5,
    goldMultiplier: 5,
    xpMultiplier: 1,
  },
  {
    name: "金屬史萊姆",
    emoji: "🤖",
    rarity: MonsterRarity.RARE,
    hpMultiplier: 5,
    goldMultiplier: 1,
    xpMultiplier: 5,
  },
  {
    name: "寶箱怪",
    emoji: "📦",
    rarity: MonsterRarity.RARE,
    hpMultiplier: 2,
    goldMultiplier: 2,
    xpMultiplier: 1,
    dropDiamonds: 2, // 1-2 diamonds ideally
  },
  {
    name: "幸運草精",
    emoji: "🍀",
    rarity: MonsterRarity.RARE,
    hpMultiplier: 0.1,
    goldMultiplier: 1,
    xpMultiplier: 1, // Special handling for Click Points in logic maybe? Or just keep it standard for now.
  },
];

// --- 3. Boss Monsters ---
export const BOSS_MONSTERS: MonsterTemplate[] = [
  {
    name: "金剛",
    emoji: "🦍",
    rarity: MonsterRarity.BOSS,
    hpMultiplier: 5,
    goldMultiplier: 10,
    xpMultiplier: 10,
  },
  {
    name: "巨鱷",
    emoji: "🐊",
    rarity: MonsterRarity.BOSS,
    hpMultiplier: 5,
    goldMultiplier: 10,
    xpMultiplier: 10,
  },
  {
    name: "霸王龍",
    emoji: "🦖",
    rarity: MonsterRarity.BOSS,
    hpMultiplier: 6,
    goldMultiplier: 12,
    xpMultiplier: 12,
  },
];

export const MEGA_BOSS_MONSTERS: MonsterTemplate[] = [
  {
    name: "魔龍",
    emoji: "🐲",
    rarity: MonsterRarity.BOSS,
    hpMultiplier: 15,
    goldMultiplier: 20,
    xpMultiplier: 20,
    dropDiamonds: 5,
  },
  {
    name: "赤鬼王",
    emoji: "👺",
    rarity: MonsterRarity.BOSS,
    hpMultiplier: 12,
    goldMultiplier: 18,
    xpMultiplier: 18,
    dropDiamonds: 3,
  },
  {
    name: "克拉肯",
    emoji: "🦑",
    rarity: MonsterRarity.BOSS,
    hpMultiplier: 14,
    goldMultiplier: 19,
    xpMultiplier: 19,
    dropDiamonds: 4,
  },
  {
    name: "撒旦",
    emoji: "👿",
    rarity: MonsterRarity.BOSS,
    hpMultiplier: 16,
    goldMultiplier: 25,
    xpMultiplier: 25,
    dropDiamonds: 6,
  },
];

// --- Helper Functions ---

export function getRandomMonster(
  stageLevel: number,
  isBoss: boolean
): MonsterTemplate {
  // 1. Boss Logic
  if (isBoss) {
    // Mega Boss every 10 levels
    if (stageLevel % 10 === 0) {
      return MEGA_BOSS_MONSTERS[
        Math.floor(Math.random() * MEGA_BOSS_MONSTERS.length)
      ];
    }
    // Mini Boss every 5 levels (that isn't a 10)
    return BOSS_MONSTERS[Math.floor(Math.random() * BOSS_MONSTERS.length)];
  }

  // 2. Rare Monster Chance (e.g. 10% total)
  const roll = Math.random();
  if (roll < 0.11) {
    // 11% chance for any special
    if (roll < 0.05) return RARE_MONSTERS[0]; // 5% - Gold Slime
    if (roll < 0.08) return RARE_MONSTERS[1]; // 3% - Metal Slime (5-8)
    if (roll < 0.1) return RARE_MONSTERS[2]; // 2% - Mimic (8-10)
    return RARE_MONSTERS[3]; // 1% - Clover (10-11)
  }

  // 3. Common Monster by Stage
  let pool = COMMON_MONSTERS["STAGE_1_20"];
  if (stageLevel > 80) pool = COMMON_MONSTERS["STAGE_81_PLUS"];
  else if (stageLevel > 60) pool = COMMON_MONSTERS["STAGE_61_80"];
  else if (stageLevel > 40) pool = COMMON_MONSTERS["STAGE_41_60"];
  else if (stageLevel > 20) pool = COMMON_MONSTERS["STAGE_21_40"];

  return pool[Math.floor(Math.random() * pool.length)];
}
