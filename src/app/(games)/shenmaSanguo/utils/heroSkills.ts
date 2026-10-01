import { HeroSkillPayload } from "../types";

/**
 * 武將技能（馬超「衝鋒」、趙雲「閃避」、黃忠「百步穿楊」、周瑜「火攻」、關羽「減速光環」、劉備「防禦光環」、張飛「暈眩」、魏延「吸血」、曹操「指揮」、夏侯惇「反擊」）
 * 這裡是技能規則的唯一來源：武將列表／詳情的說明，與隨出征資料送進 Godot 的參數都由這裡產生。
 * 技能是戰場效果：不寫進玩家存檔，也不需要後端（GAS）支援。
 * 每種技能只帶自己的參數；Godot 不認得的技能 id 一律當作普通攻擊。
 * 正式設定表 heroes_config 的 passive 欄是給人看的自由文字，程式不解析它；技能綁定哪位武將、數值與觸發規則都定義在這裡
 */
export type HeroSkill =
  | {
      /** 首擊加倍（馬超「衝鋒」）：每場戰鬥首次有效普通攻擊的傷害加倍 */
      id: "first_strike";
      name: string;
      /** 每場戰鬥首次有效普通攻擊的傷害倍率 */
      firstAttackMultiplier: number;
    }
  | {
      /** 百步穿楊：戰場上的有效射程加長 */
      id: "long_range";
      name: string;
      /** 有效射程倍率：（基礎射程＋（等級−1）×射程成長）× 倍率 */
      rangeMultiplier: number;
    }
  | {
      /** 火攻：每次有效普通攻擊命中後，對該敵人附加灼燒 */
      id: "burn";
      name: string;
      /** 每跳傷害＝命中當下的攻擊力 × burnRatio */
      burnRatio: number;
      /** 每次命中後的跳數（再次命中時剩餘跳數刷新成這個值） */
      burnTicks: number;
      /** 每跳間隔（秒，遊戲時間） */
      burnIntervalSec: number;
    }
  | {
      /**
       * 減速光環：戰鬥中，以武將為中心、目前有效射程內（含邊界）的所有地面敵人移動速度降低。
       * 不需要普通攻擊的目標，也不改變普通攻擊；飛行與免疫減速的敵人不受影響；和其他減速取最強的一個
       */
      id: "slow_aura";
      name: string;
      /** 範圍內敵人的移動速度倍率（0.9＝移速降低 10%，不是降到 10%） */
      speedMultiplier: number;
    }
  | {
      /** 閃避：每次受到敵人的直接攻擊時各自判定，閃避時這一擊不扣血 */
      id: "dodge";
      name: string;
      /** 每次受到直接攻擊時閃避的機率（0～1） */
      dodgeChance: number;
    }
  | {
      /**
       * 防禦光環：戰鬥中，以武將為中心、目前有效射程內（含邊界）的其他友軍武將防禦力提升。
       * 不含自己、防禦塔與城池；不需要普通攻擊的目標；和其他防禦光環取最強的一個，不疊加
       */
      id: "def_aura";
      name: string;
      /** 範圍內其他友軍武將的防禦倍率（1.2＝提升 20%，乘在該武將目前等級的防禦上；受傷照原本的防禦公式計算） */
      defenseMultiplier: number;
    }
  | {
      /**
       * 暈眩：每次普通攻擊命中、而且目標被打後還活著時，目標暈眩一段時間（遊戲時間）：不能移動、不能攻擊阻路的武將，照常受傷。
       * 再次命中時剩餘時間取較長的（刷新、不累加）；不是減速，免疫減速的敵人也會暈眩
       */
      id: "stun";
      name: string;
      /** 每次命中的暈眩時間（秒，遊戲時間） */
      stunSec: number;
    }
  | {
      /**
       * 吸血：每次普通攻擊命中後，恢復這一擊實際扣掉敵人的生命 × lifestealRatio（不含超過敵人剩餘生命的部分，打倒敵人的那一擊也算）。
       * 不超過最大生命、不復活；只算自己普通攻擊的直接傷害（灼燒、其他武將與防禦塔的傷害不算）；只改戰場上的生命
       */
      id: "lifesteal";
      name: string;
      /** 恢復的比例（0.15＝實際傷害的 15%） */
      lifestealRatio: number;
    }
  | {
      /**
       * 攻速光環：戰鬥中，以武將為中心、目前有效射程內（含邊界）的其他友軍武將攻擊速度提升（每秒攻擊次數 × 倍率，攻擊間隔 ÷ 倍率）。
       * 不含自己、防禦塔與城池；不需要普通攻擊的目標；和其他攻速光環取最強的一個，不相乘、不疊加；
       * 加成只用在之後新開始的攻擊冷卻，正在倒數的冷卻不重設
       */
      id: "atk_speed_aura";
      name: string;
      /** 範圍內其他友軍武將每秒攻擊次數的倍率（1.15＝攻速提升 15%，攻擊間隔變成原本的 1 ÷ 1.15） */
      attackSpeedMultiplier: number;
    }
  | {
      /**
       * 反擊：受到敵人的直接攻擊、實際扣血後自己仍然活著時，對這次攻擊自己的敵人造成這一擊實際扣血 × counterRatio 的傷害。
       * 實扣是防禦公式之後的數字（不是敵人的攻擊力 × 比例），也不替自己減傷；閃避、打倒自己的那一擊、沒有攻擊者的扣血不反彈；只在戰場
       */
      id: "counter";
      name: string;
      /** 反彈的比例（0.2＝這一擊實際扣掉自己生命的 20%） */
      counterRatio: number;
    };

const HERO_SKILLS: Record<string, HeroSkill> = {
  // 正式設定表的被動描述「衝鋒：首擊傷害翻倍」；每場一次、沒有目標不用掉等規則沿用首擊加倍的機制
  ma_chao: { id: "first_strike", name: "衝鋒", firstAttackMultiplier: 2 },
  // 正式設定表的被動描述「閃避率提升15%」：武將原本沒有閃避，所以閃避率就是 15%
  zhao_yun: { id: "dodge", name: "閃避", dodgeChance: 0.15 },
  // 第一版的設計值（Round 14 選定），尚未做過平衡；傷害與攻速不變、不加連射
  huang_zhong: { id: "long_range", name: "百步穿楊", rangeMultiplier: 1.5 },
  // 第一版的設計值（Round 15 選定），尚未做過平衡：每跳 20%、3 跳、間隔 1 秒；不疊層、不傳染
  zhou_yu: {
    id: "burn",
    name: "火攻",
    burnRatio: 0.2,
    burnTicks: 3,
    burnIntervalSec: 1,
  },
  // 正式設定表的被動描述「周圍敵人減速10%」：移速 × 0.9。設定表沒有寫的部分是遊戲的補充規則：
  // 「周圍」是目前有效射程（含邊界）、只影響地面敵人（步兵不能對空）、免疫減速的不受影響、和其他減速取最強不疊加
  guan_yu: { id: "slow_aura", name: "減速光環", speedMultiplier: 0.9 },
  // 正式設定表的被動描述「光環：提升友軍防禦」沒有寫數值與範圍。第一版的設計值，尚未做過平衡：防禦 × 1.2、
  // 範圍是目前有效射程（含邊界）、只影響其他友軍武將（不含自己、防禦塔與城池）、多個防禦光環取最強不疊加、只在戰鬥中
  liu_bei: { id: "def_aura", name: "防禦光環", defenseMultiplier: 1.2 },
  // 正式設定表的被動描述「攻擊使敵人暈眩」沒有寫時間與疊加方式。第一版的設計值，尚未做過平衡：每次普通攻擊命中、目標還活著時暈眩 0.5 秒；
  // 暈眩中不能移動也不能攻擊、照常受傷；再次命中取較長的剩餘時間（不累加）；不是減速（免疫減速的敵人也會暈眩）；只在戰鬥中
  zhang_fei: { id: "stun", name: "暈眩", stunSec: 0.5 },
  // 正式設定表的被動描述「吸血：恢復生命」沒有寫比例與觸發方式。第一版的設計值，尚未做過平衡：每次普通攻擊命中後恢復這一擊實際扣掉敵人生命的 15%
  // （不含溢出的傷害，打倒敵人的那一擊也算）；不超過最大生命、不復活；只算自己普通攻擊的直接傷害；只在戰鬥中、不改最大生命與存檔
  wei_yan: { id: "lifesteal", name: "吸血", lifestealRatio: 0.15 },
  // 正式設定表的被動描述「指揮：提升友軍攻速」沒有寫數值與範圍。第一版的設計值，尚未做過平衡：每秒攻擊次數 × 1.15
  // （攻擊間隔 ÷ 1.15，不是減少 15%）、範圍是目前有效射程（含邊界）、只影響其他友軍武將（不含自己、防禦塔與城池）、
  // 多個攻速光環取最強不疊加、只在戰鬥中；加成只用在之後新開始的攻擊冷卻，不改攻擊力、射程與存檔
  cao_cao: { id: "atk_speed_aura", name: "指揮", attackSpeedMultiplier: 1.15 },
  // 正式設定表的被動描述「反擊：受傷時反彈傷害」沒有寫比例與觸發細節。第一版的設計值，尚未做過平衡：受到敵人的直接攻擊、
  // 實際扣血後自己仍然活著時，反彈這一擊實際扣掉自己生命的 20% 給攻擊自己的敵人（打倒自己的那一擊、閃避、沒有攻擊者的扣血不反彈）；
  // 反彈不再引發其他技能、不會來回反彈；只在戰鬥中、不改屬性與存檔
  xia_hou_dun: { id: "counter", name: "反擊", counterRatio: 0.2 },
};

export const heroSkillOf = (heroId: string): HeroSkill | null =>
  HERO_SKILLS[heroId] ?? null;

// 顯示用：最多三位小數（例如 Lv2 的 7.545 格）
const round3 = (n: number) => Number(n.toFixed(3));

/** 戰場上的有效射程（格）：rawRange 是屬性表的射程（基礎射程＋（等級−1）×射程成長） */
export function effectiveRange(
  skill: HeroSkill | null,
  rawRange: number
): number {
  return skill?.id === "long_range"
    ? round3(rawRange * skill.rangeMultiplier)
    : round3(rawRange);
}

/** 火攻每跳的傷害：攻擊力 × 比例（沒有火攻時是 0） */
export function burnTickDamage(skill: HeroSkill | null, atk: number): number {
  return skill?.id === "burn" ? round3(atk * skill.burnRatio) : 0;
}

/** 減速光環讓移動速度降低的百分比（0.9 → 10；沒有減速光環時是 0） */
export function slowAuraPercent(skill: HeroSkill | null): number {
  return skill?.id === "slow_aura"
    ? round3((1 - skill.speedMultiplier) * 100)
    : 0;
}

/** 防禦光環讓防禦提升的百分比（1.2 → 20；沒有防禦光環時是 0） */
export function defAuraPercent(skill: HeroSkill | null): number {
  return skill?.id === "def_aura"
    ? round3((skill.defenseMultiplier - 1) * 100)
    : 0;
}

/** 吸血恢復的百分比（0.15 → 15；沒有吸血時是 0） */
export function lifestealPercent(skill: HeroSkill | null): number {
  return skill?.id === "lifesteal" ? round3(skill.lifestealRatio * 100) : 0;
}

/** 攻速光環讓攻擊速度（每秒攻擊次數）提升的百分比（1.15 → 15；沒有攻速光環時是 0） */
export function atkSpeedAuraPercent(skill: HeroSkill | null): number {
  return skill?.id === "atk_speed_aura"
    ? round3((skill.attackSpeedMultiplier - 1) * 100)
    : 0;
}

/** 反擊反彈的百分比（0.2 → 20；沒有反擊時是 0） */
export function counterPercent(skill: HeroSkill | null): number {
  return skill?.id === "counter" ? round3(skill.counterRatio * 100) : 0;
}

/**
 * 攻速光環加成後的攻擊間隔（秒）：攻擊間隔 ÷ 倍率（和 Godot 相同）。
 * 是除以倍率、不是減少同樣的百分比：1.15 倍時 1 秒變成約 0.8696 秒，不是 0.85 秒
 */
export function boostedAttackInterval(
  intervalSec: number,
  attackSpeedMultiplier: number
): number {
  return intervalSec / attackSpeedMultiplier;
}

/**
 * 受到攻擊時實際扣的血（和 Godot 的防禦公式相同）：攻擊力 × 100 ÷（防禦 ＋ 100）。
 * 防禦光環乘在防禦上（防禦不是正數時不乘），不是直接少扣一定比例的傷害
 */
export function damageAfterDefense(atk: number, def: number): number {
  return (atk * 100) / (def + 100);
}

/**
 * 技能的完整規則（顯示在武將詳情）
 * - rawRange：這位武將目前等級屬性表上的射程；有提供時，射程技能會寫出戰場上的實際射程，減速光環、防禦光環與攻速光環會寫出目前的範圍半徑
 * - atk：這位武將目前的攻擊力；有提供時，火攻會寫出每次灼燒的傷害
 */
export function describeHeroSkill(
  skill: HeroSkill,
  rawRange?: number,
  atk?: number
): string {
  if (skill.id === "long_range") {
    const m = skill.rangeMultiplier;
    const current =
      rawRange === undefined
        ? ""
        : `目前等級：射程 ${round3(rawRange)} 格，戰場上是 ${effectiveRange(skill, rawRange)} 格。`;
    return (
      `戰場上的有效射程是屬性射程的 ${m} 倍，等級提升的射程成長也一起乘上 ${m} 倍；普通攻擊的傷害與攻擊間隔不變。` +
      current +
      "只在戰場生效，存檔與屬性表的「範圍」仍是原本的數值；在戰場選取武將時，射程圈顯示的是實際射程。" +
      "移動位置、調整隊伍或重新放置都不會重複加成。"
    );
  }
  if (skill.id === "slow_aura") {
    const pct = slowAuraPercent(skill);
    const current =
      rawRange === undefined
        ? ""
        : `目前等級的範圍半徑是 ${effectiveRange(skill, rawRange)} 格。`;
    return (
      `戰鬥中，以這位武將為中心、目前射程內（含邊界）的所有地面敵人移動速度降低 ${pct}%（變成原本的 ${round3(skill.speedMultiplier * 100)}%）。` +
      current +
      "範圍跟著射程：升級射程變長時範圍一起變大。不需要普通攻擊的目標，也不改變普通攻擊的傷害與攻擊間隔。" +
      "飛行敵人與免疫減速的敵人不受影響（普通攻擊照常打得到地面上免疫減速的敵人）。" +
      "敵人離開範圍，或武將移位、被移除、陣亡時減速就解除；和其他減速（武將在道路上的阻擋、步兵塔、另一個減速光環）同時作用時取最強的一個，不會疊加，文士塔的減速另外計算。" +
      "戰鬥中武將周圍會顯示淺藍色的範圍圈，被減速的敵人有淺藍色的虛線外圈。只在戰場生效，不影響存檔。"
    );
  }
  if (skill.id === "def_aura") {
    const pct = defAuraPercent(skill);
    const m = skill.defenseMultiplier;
    const current =
      rawRange === undefined
        ? ""
        : `目前等級的範圍半徑是 ${effectiveRange(skill, rawRange)} 格。`;
    const plain = round3(damageAfterDefense(100, 100));
    const boosted = Number(damageAfterDefense(100, 100 * m).toFixed(1));
    return (
      `戰鬥中，以這位武將為中心、目前射程內（含邊界）的其他友軍武將防禦力提升 ${pct}%（乘在該武將目前等級的防禦上，變成 ${m} 倍）。` +
      current +
      "不含自己，防禦塔與城池不受影響；友軍的職業不限，也不需要普通攻擊的目標。範圍跟著射程：升級射程變長時範圍一起變大。" +
      `受到攻擊時照原本的防禦公式、用提升後的防禦計算，不是直接少扣 ${pct}% 的傷害（例如防禦 100 的友軍被攻擊力 100 的敵人打一下，從扣 ${plain} 變成扣約 ${boosted}）；趙雲的閃避照常先判定。` +
      "同時在幾個防禦光環範圍內時取最強的一個，不會疊加。友軍離開範圍，或這位武將移位、被移除、陣亡、戰鬥結束時加成就解除。" +
      "戰鬥中武將周圍會顯示淺綠色的範圍圈，受到加成的友軍有淺綠色的外框；在戰場上選取友軍時會分開列出原本的防禦與加成後的防禦。" +
      "只在戰場生效：存檔與屬性表的防禦不會提高。"
    );
  }
  if (skill.id === "stun") {
    const sec = skill.stunSec;
    return (
      `每次普通攻擊命中、而且敵人被打後還活著時，這個敵人暈眩 ${sec} 秒（遊戲時間）：暈眩中停止移動，也不能攻擊擋住它的武將，但照常受到傷害、可以被打倒。` +
      `再次命中時剩餘時間刷新成 ${sec} 秒，不會累加；已經有更長的暈眩時不會縮短。普通攻擊的傷害與攻擊間隔不變，沒有機率、不波及其他敵人；打倒敵人的那一擊與灼燒都不會引發暈眩。` +
      "暈眩不是減速：免疫減速的敵人也會暈眩；暈眩期間減速與灼燒照常計時，結束後恢復當時的移動速度，敵人的攻擊冷卻照常倒數但不會累積，恢復後最多先打一下。" +
      "這位武將移位、被移除或陣亡時，已經造成的暈眩照樣持續到時間結束；暈眩不會讓武將打得到原本打不到的敵人（步兵打不到飛行敵人）。" +
      "暈眩中的敵人頭上有轉動的黃色星星。只在戰場生效，不影響存檔。"
    );
  }
  if (skill.id === "lifesteal") {
    const pct = lifestealPercent(skill);
    const full = round3(100 * skill.lifestealRatio);
    const kill = round3(30 * skill.lifestealRatio);
    return (
      `每次普通攻擊命中敵人後，這位武將恢復這一擊實際造成傷害的 ${pct}% 生命（例如打掉 100 恢復 ${full}）。` +
      `只算實際扣掉的生命：打倒敵人的那一擊也會恢復，但超過敵人剩餘生命的部分不算（敵人只剩 30 時恢復 ${kill}，不是 ${full}）。` +
      "恢復後不會超過最大生命，滿血時不恢復；已經陣亡的武將不會因此復活。" +
      "只算這位武將自己普通攻擊的直接傷害：沒有命中（沒有目標、職業打不到飛行敵人）就不恢復，灼燒、其他武將與防禦塔造成的傷害也不算；" +
      "普通攻擊的傷害、攻擊間隔與射程不變，也沒有另外計時的回血。" +
      "恢復時武將上方出現綠色的「+恢復量」；戰場上的單位面板顯示的是選取當時的生命，重新點選武將可以看到恢復後的生命。" +
      "只在戰場生效：恢復的是這場戰鬥中的生命，最大生命與屬性不變，不影響存檔。"
    );
  }
  if (skill.id === "atk_speed_aura") {
    const pct = atkSpeedAuraPercent(skill);
    const m = skill.attackSpeedMultiplier;
    const current =
      rawRange === undefined
        ? ""
        : `目前等級的範圍半徑是 ${effectiveRange(skill, rawRange)} 格。`;
    const oneSec = boostedAttackInterval(1, m).toFixed(2);
    return (
      `戰鬥中，以這位武將為中心、目前射程內（含邊界）的其他友軍武將攻擊速度提升 ${pct}%：每秒攻擊次數變成 ${m} 倍，攻擊間隔變成原本的 1 ÷ ${m}（例如 1 秒變成約 ${oneSec} 秒，不是直接少 ${pct}%）。` +
      current +
      "不含自己，防禦塔與城池不受影響；友軍的職業不限，也不需要普通攻擊的目標。範圍跟著射程：升級射程變長時範圍一起變大。友軍的攻擊力與射程不變。" +
      "加成只用在之後開始的攻擊冷卻：進入範圍時正在倒數的冷卻照原本的時間打完，不會立刻補打；離開範圍，或這位武將移位、被移除、陣亡、戰鬥結束時加成解除，正在倒數的冷卻同樣照原本的時間。" +
      "同時在幾個攻速光環範圍內時取最強的一個，不會疊加。" +
      "戰鬥中武將周圍會顯示淡紫色的範圍圈，受到加成的友軍有淡紫色的外框；在戰場上選取友軍時會分開列出原本與加成後的攻擊間隔（選取當時的數值）。" +
      "只在戰場生效：存檔與屬性表的攻擊間隔不會改變。"
    );
  }
  if (skill.id === "counter") {
    const pct = counterPercent(skill);
    const r = skill.counterRatio;
    const plain = round3(damageAfterDefense(100, 100));
    const aura = damageAfterDefense(100, 120);
    return (
      `受到敵人的直接攻擊（目前是被武將擋在路上的敵人）、實際扣血後自己仍然活著時，對這次攻擊自己的敵人造成這一擊實際扣血 ${pct}% 的傷害。` +
      `以防禦計算後實際扣掉的生命為準，不是敵人攻擊力的 ${pct}%：例如防禦 100 的武將被攻擊力 100 的敵人打一下扣 ${plain}、反彈 ${round3(plain * r)}；` +
      `在劉備的防禦光環裡（防禦 120）扣約 ${aura.toFixed(2)}、反彈約 ${(aura * r).toFixed(2)}。反彈不會替自己減少傷害。` +
      "閃避（沒有扣血）、打倒自己的那一擊、沒有攻擊者的扣血都不反彈；只反彈給這次攻擊自己、仍然活著的敵人，不會波及其他敵人。" +
      "反彈可以打倒攻擊者（擊殺與金幣照常只算一次），免疫減速的敵人照樣會受到反彈；反彈不會再引發吸血、暈眩、灼燒等其他技能，也不會來回反彈。" +
      "反彈的傷害數字是洋紅色。普通攻擊的傷害、攻擊間隔與射程不變；戰場上的單位面板顯示的是選取當時的生命，重新點選武將可以看到最新的生命。" +
      "只在戰場生效，不影響存檔。"
    );
  }
  if (skill.id === "dodge") {
    const pct = round3(skill.dodgeChance * 100);
    return (
      `敵人攻擊這位武將時（目前是被武將擋在路上的敵人），每一擊有 ${pct}% 的機率閃避：這一擊不扣血，武將上方出現藍白色的「MISS」；沒有閃避時照原本的防禦計算扣血。` +
      "每一擊各自判定，沒有冷卻、不會疊加；閃避不會讓敵人馬上再打一次，敵人的攻擊間隔照常。" +
      "升級、移動位置、換波次都維持同樣的機率。只在戰場生效，不影響存檔。"
    );
  }
  if (skill.id === "burn") {
    const sec = skill.burnIntervalSec;
    const n = skill.burnTicks;
    const pct = round3(skill.burnRatio * 100);
    const current =
      atk === undefined
        ? ""
        : `目前攻擊力 ${round3(atk)}：每次灼燒 ${burnTickDamage(skill, atk)}。`;
    return (
      `每次普通攻擊命中後，敵人開始灼燒：每 ${sec} 秒受到一次傷害，共 ${n} 次，每次是命中當下攻擊力的 ${pct}%（第一次在命中 ${sec} 秒後），普通攻擊的傷害不變。` +
      current +
      `同一個敵人只有一份灼燒：再次命中時剩餘次數回到 ${n} 次、傷害換成這次命中的攻擊力，不會疊加，下一次灼燒的時間也不會重新計算。` +
      "敵人離開射程或武將被移除後仍會燒完；敵人被打倒或抵達基地就停止，灼燒不會再引發火攻。" +
      "灼燒中的敵人有橘色外圈，灼燒的傷害數字是橘色。只在戰場生效，不影響存檔。"
    );
  }
  return (
    `每場戰鬥中，第一次命中敵人的普通攻擊造成 ${skill.firstAttackMultiplier} 倍傷害（武將上方會出現金色的「x${skill.firstAttackMultiplier}!」），之後恢復普通攻擊。` +
    "沒有目標時不會用掉；同一場戰鬥裡換波次、移動位置、調整隊伍或移除後重新放置都不會再觸發，" +
    "切換關卡或重新開始才會重置。"
  );
}

/** 隨出征資料送進 Godot 的技能參數（team_list[].skill）；沒有技能的武將不帶這個欄位 */
export function heroSkillPayload(heroId: string): { skill?: HeroSkillPayload } {
  const skill = heroSkillOf(heroId);
  if (!skill) return {};
  if (skill.id === "long_range") {
    return { skill: { id: skill.id, range_multiplier: skill.rangeMultiplier } };
  }
  if (skill.id === "burn") {
    return {
      skill: {
        id: skill.id,
        burn_ratio: skill.burnRatio,
        burn_ticks: skill.burnTicks,
        burn_interval: skill.burnIntervalSec,
      },
    };
  }
  if (skill.id === "slow_aura") {
    return { skill: { id: skill.id, slow_mult: skill.speedMultiplier } };
  }
  if (skill.id === "dodge") {
    return { skill: { id: skill.id, dodge_chance: skill.dodgeChance } };
  }
  if (skill.id === "def_aura") {
    return { skill: { id: skill.id, def_mult: skill.defenseMultiplier } };
  }
  if (skill.id === "stun") {
    return { skill: { id: skill.id, stun_sec: skill.stunSec } };
  }
  if (skill.id === "lifesteal") {
    return {
      skill: { id: skill.id, lifesteal_ratio: skill.lifestealRatio },
    };
  }
  if (skill.id === "atk_speed_aura") {
    return {
      skill: { id: skill.id, atk_speed_mult: skill.attackSpeedMultiplier },
    };
  }
  if (skill.id === "counter") {
    return { skill: { id: skill.id, counter_ratio: skill.counterRatio } };
  }
  return {
    skill: {
      id: skill.id,
      first_attack_multiplier: skill.firstAttackMultiplier,
    },
  };
}
