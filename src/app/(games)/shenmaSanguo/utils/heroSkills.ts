import { HeroSkillPayload } from "../types";

/**
 * 武將技能（馬超「衝鋒」、趙雲「閃避」、黃忠「百步穿楊」、周瑜「火攻」、關羽「減速光環」、劉備「防禦光環」、張飛「暈眩」、魏延「吸血」、曹操「指揮」、夏侯惇「反擊」、廖化「堅韌」、顏良「威壓」、孫尚香「連射」、龐統「連環計」、諸葛亮「呼風喚雨」、呂布「戰神」、魯肅「補給」、許褚「怪力」、典韋「護衛」、孫權「守護」、甘寧「奇襲」、貂蟬「魅惑」）
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
    }
  | {
      /**
       * 堅韌：每次受傷都用受傷前的生命判斷，生命 ÷ 最大生命不高於 lowHpRatio（含剛好等於）時，防禦計算後的傷害再乘上 damageMultiplier。
       * 不是提高防禦；這一擊讓生命跨過門檻時下一擊才減傷；不保底、不復活；只在戰場
       */
      id: "tenacity";
      name: string;
      /** 生效的生命比例門檻（0.3＝受傷前生命不高於最大生命的 30%） */
      lowHpRatio: number;
      /** 防禦計算後傷害的倍率（0.8＝少扣 20%） */
      damageMultiplier: number;
    }
  | {
      /**
       * 威壓：戰鬥中，以武將為中心、目前有效射程內（含邊界）的所有敵人攻擊武將的直接攻擊力降低（地面、飛行、免疫減速的敵人都算）。
       * 多個威壓取最強的一個，不相乘；被打的武將照常用防禦計算；敵人的移動速度、攻擊間隔與漏到城池扣的城防不變；只在戰場
       */
      id: "atk_down_aura";
      name: string;
      /** 範圍內敵人直接攻擊力的倍率（0.9＝降低 10%，不是降到 10%） */
      attackMultiplier: number;
    }
  | {
      /**
       * 連射：每次普通攻擊實際打到敵人、而且敵人被這一擊打過後還活著時，有機率在同一次攻擊對同一個敵人再打一擊（這次普通攻擊的攻擊力 × 1）。
       * 每次普通攻擊最多追加一擊、追加的一擊不會再連射；不換目標、不波及其他敵人；第一擊就打倒敵人時不連射；攻擊間隔不變；只在戰場
       */
      id: "double_shot";
      name: string;
      /** 每次普通攻擊追加一擊的機率（0.2＝20%；0～1 之間、不含兩端） */
      doubleShotChance: number;
    }
  | {
      /**
       * 連環計：每次普通攻擊實際打到主目標後，從主目標被打中的位置開始，依序傳給「前一個被打中的敵人」附近範圍內最近、這次還沒被打過的敵人。
       * 第 k 次傳遞的傷害是這次普通攻擊的傷害 × chainRatio 的 k 次方；找不到下一個敵人就停止；傳遞不引發其他技能、不算一次攻擊；只在戰場
       */
      id: "chain";
      name: string;
      /** 每一跳找下一個敵人的範圍（格，含邊界），以前一個被打中的敵人為中心 */
      chainRadius: number;
      /** 每跳的傷害比例（0.5＝第一次 50%、第二次 25%；0～1 之間、不含兩端） */
      chainRatio: number;
      /** 最多傳遞幾次（1 或 2） */
      chainMaxJumps: number;
    }
  | {
      /**
       * 呼風喚雨：每次普通攻擊實際打到主目標後，以主目標被打中的位置為中心、stormRadius 格內（含邊界），
       * 最多 stormMaxTargets 名其他敵人各受這次普通攻擊傷害 × stormRatio（由近到遠，距離相同時先出現的優先）。
       * 主目標不會再被範圍打一次；每一名都是同樣的比例（不遞減、不傳遞）；範圍傷害不引發其他技能、不算一次攻擊；只在戰場
       */
      id: "storm";
      name: string;
      /** 範圍半徑（格，含邊界），以主目標被打中的位置為中心（不是武將的位置） */
      stormRadius: number;
      /** 範圍內每一名受到的傷害比例（0.5＝這次普通攻擊傷害的 50%；0～1 之間、不含兩端） */
      stormRatio: number;
      /** 最多幾名其他敵人（1～4） */
      stormMaxTargets: number;
    }
  | {
      /**
       * 戰神：這位武將自己的普通攻擊打倒一名敵人後，從下一擊起攻擊力增加一層（每層＝目前等級攻擊力 × berserkRatio，加法疊加），
       * 最多 berserkMaxStacks 層。只算自己普通攻擊的最後一擊；層數只在這一場保留（跨波、移位、升級、移出再放回都保留），新的一場從 0 開始；只在戰場
       */
      id: "berserk";
      name: string;
      /** 每層的攻擊力加成（0.05＝目前等級攻擊力的 5%；0～1 之間、不含兩端） */
      berserkRatio: number;
      /** 最多幾層（1～10 的整數） */
      berserkMaxStacks: number;
    }
  | {
      /**
       * 補給：這位武將部署在戰場上、還活著時，全隊每次有效擊殺得到的戰鬥金幣乘上 goldMultiplier（向下取整），任何方式打倒的敵人都算。
       * 只在隊伍裡、陣亡、移出隊伍時不生效；多個補給取最高的倍率、不疊加；只增加這一場的戰鬥金幣，花費、返還與玩家的獎勵都不變
       */
      id: "supply";
      name: string;
      /** 每次擊殺戰鬥金幣的倍率（1.2＝增加 20%，5 變成 6；大於 1、不超過 2） */
      goldMultiplier: number;
    }
  | {
      /**
       * 怪力：這位武將自己的普通攻擊打中主目標、實際扣到生命、目標還活著時，把這個地面敵人沿它自己走過的路線往回推 knockbackTiles 格，
       * 成功推動後冷卻 cooldownSec 秒（戰鬥中的遊戲時間）。傷害照普通攻擊，不另外加傷害；冷卻在同一場保留，新的一場重新開始；只在戰場
       */
      id: "knockback";
      name: string;
      /** 往回推的距離（格；大於 0、不超過 1） */
      knockbackTiles: number;
      /** 成功推動後的冷卻（秒；大於 0、不超過 10） */
      cooldownSec: number;
    }
  | {
      /**
       * 護衛：這位武將部署在戰場上、還活著時，radiusTiles 格內（兩人中心的距離、含邊界）其他友軍武將受到敵人的直接攻擊，
       * 照友軍自己的閃避、防禦與堅韌算出要扣的生命後，由這位武將直接承擔其中的 shareRatio（不超過自己剩下的生命）。只在戰場
       */
      id: "guard_share";
      name: string;
      /** 承擔的比例（0.2＝20%；大於 0、不超過 0.5） */
      shareRatio: number;
      /** 保護範圍（格；大於 0、不超過 5） */
      radiusTiles: number;
    }
  | {
      /**
       * 守護：這位武將部署在戰場上、還活著時，敵人漏到城池的傷害乘上 baseDamageMultiplier，和部署的位置無關。
       * 城防仍是整數：這一場累計的漏城傷害無條件進位後才是扣掉的城防（0.8 時漏 5 隻扣 4）。只在戰場
       */
      id: "base_guard";
      name: string;
      /** 漏城傷害的倍率（0.8＝每隻 0.8 點；0.5 以上、小於 1） */
      baseDamageMultiplier: number;
    }
  | {
      /**
       * 奇襲：每場戰鬥這位武將第一次有效的普通攻擊必殺主要目標（先照普通攻擊扣血，沒有打倒時把剩下的生命補扣完），每場只有一次；
       * 不是兩倍傷害。換波次、移位、升級、移出再放回都不恢復，新的一場才恢復；沒有參數；只在戰場
       */
      id: "assassinate";
      name: string;
    }
  | {
      /**
       * 魅惑：這位武將自己的普通攻擊打中仍活著的地面主要目標時，讓它受控 durationSec 秒（戰鬥中的遊戲時間）：停在原地、不前進也不攻擊武將，
       * 改打 attackRadiusTiles 格內最近的其他地面敵人；受控的敵人仍算在這一波裡，但武將與防禦塔不選它。成功後冷卻 cooldownSec 秒；只在戰場
       */
      id: "charm";
      name: string;
      /** 受控的時間（秒，戰鬥中的遊戲時間；大於 0、不超過 5） */
      durationSec: number;
      /** 成功控制後的冷卻（秒，戰鬥中的遊戲時間；大於 0、不超過 10） */
      cooldownSec: number;
      /** 受控的敵人攻擊其他敵人的範圍（格，中心距離、含邊界；大於 0、不超過 2） */
      attackRadiusTiles: number;
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
  // 正式設定表的被動描述「堅韌：低血量減傷」沒有寫門檻與減傷多少。第一版的設計值，尚未做過平衡：受傷前生命不高於最大生命的 30%（含剛好 30%）時，
  // 照原本的防禦公式算出的傷害再乘 0.8（少扣 20%，不是提高防禦、只乘一次）；用受傷前的生命判斷，生命回到超過 30% 時就不減傷；
  // 用當下的最大生命計算（升級後照新的數值）；致死的一擊照常倒下（不保底、不復活）；只在戰鬥中、不改屬性與存檔
  liao_hua: {
    id: "tenacity",
    name: "堅韌",
    lowHpRatio: 0.3,
    damageMultiplier: 0.8,
  },
  // 正式設定表的被動描述「威壓：降低敵軍攻擊」沒有寫比例、範圍與疊加方式。第一版的設計值，尚未做過平衡：範圍是目前有效射程（含邊界），
  // 範圍內所有敵人攻擊武將的直接攻擊力 × 0.9（地面、飛行、免疫減速都算）；多個威壓取最強不相乘；被打的武將照常用防禦、閃避、堅韌、反擊計算；
  // 敵人的移動速度、攻擊間隔與漏到城池扣的城防不變；只在戰鬥中、不改敵人設定與存檔
  yan_liang: { id: "atk_down_aura", name: "威壓", attackMultiplier: 0.9 },
  // 正式設定表的被動描述「連射：有機率二次攻擊」沒有寫機率、倍率與時序。第一版的設計值，尚未做過平衡：每次普通攻擊實際打到敵人、
  // 敵人還活著時有 20% 的機率在同一次攻擊對同一個敵人再打一擊（這次攻擊力的 100%）；第一擊打倒敵人時不連射、不換目標、不再連射、
  // 攻擊間隔不變；追加的一擊不引發其他技能；只在戰鬥中、不改屬性與存檔
  sun_shang_xiang: { id: "double_shot", name: "連射", doubleShotChance: 0.2 },
  // 正式設定表的被動描述「連環計：傳遞傷害」沒有寫範圍、比例與次數。第一版的設計值，尚未做過平衡：普通攻擊實際打到主目標後，
  // 從主目標被打中的位置找 1.5 格內（含邊界）最近、這次還沒被打過的敵人受 50%，再從它的位置找下一個受 25%（最多 2 次，不是以主目標為中心的範圍）；
  // 傳遞不引發其他技能、不算一次攻擊、攻擊間隔不變；只在戰鬥中、不改屬性與存檔
  pang_tong: {
    id: "chain",
    name: "連環計",
    chainRadius: 1.5,
    chainRatio: 0.5,
    chainMaxJumps: 2,
  },
  // 正式設定表的被動描述「呼風喚雨：大範圍傷害」沒有寫範圍、比例、人數與觸發方式。第一版的設計值，尚未做過平衡：普通攻擊實際打到主目標後，
  // 以主目標被打中的位置為中心、2 格內（含邊界）最多 4 名其他敵人各受這次普通攻擊傷害的 50%（由近到遠，主目標不重複；不遞減、不傳遞，不是連環計）；
  // 自動觸發、沒有手動施放與冷卻；範圍傷害不引發其他技能、不算一次攻擊、攻擊間隔不變；只在戰鬥中、不改屬性與存檔
  zhu_ge_liang: {
    id: "storm",
    name: "呼風喚雨",
    stormRadius: 2,
    stormRatio: 0.5,
    stormMaxTargets: 4,
  },
  // 正式設定表的被動描述「戰神：攻擊力隨殺敵增加」沒有寫倍率、上限、擊殺歸屬與保留時間。第一版的設計值，尚未做過平衡：
  // 呂布自己的普通攻擊打倒一名敵人後，下一擊起攻擊力增加目前等級攻擊力的 5%（加法疊加），最多 10 層（+50%）；打倒敵人的那一擊不提前加成；
  // 其他武將、防禦塔、灼燒、反擊、範圍與傳遞造成的擊殺、敵人漏到城池都不算；層數只在這一場保留，新的一場從 0 開始；只在戰鬥中、不改屬性與存檔
  lv_bu: {
    id: "berserk",
    name: "戰神",
    berserkRatio: 0.05,
    berserkMaxStacks: 10,
  },
  // 正式設定表的被動描述「補給：增加資源獲取」沒有寫資源種類、倍率與生效條件。第一版的設計值，尚未做過平衡：
  // 魯肅部署在戰場上、還活著時，全隊每次有效擊殺的戰鬥金幣 × 1.2（5 → 6，向下取整），任何方式打倒的敵人都算、擊殺數只算一次；
  // 多個補給取最高的倍率、不疊加；只增加這一場的戰鬥金幣：建造與升級的花費、拆除的返還、結算的戰場點數與玩家的金幣、經驗、存檔都不變
  lu_su: { id: "supply", name: "補給", goldMultiplier: 1.2 },
  // 正式設定表的被動描述「怪力：擊退效果」沒有寫距離、觸發條件、冷卻與免疫。第一版的設計值，尚未做過平衡：
  // 許褚自己的普通攻擊實際扣到主目標的生命、目標還活著（不是這一擊打倒的）時，把這個地面敵人沿它自己走過的路線往回推 0.5 格，
  // 成功推動後冷卻 3 秒（戰鬥中的遊戲時間）；已在路線起點推不動時不用掉冷卻。傷害、攻擊間隔與選目標不變；免疫減速的敵人照樣被推，
  // 打不到飛行敵人（步兵不能對空）；冷卻在同一場保留（換波次、移位、升級、移出再放回），新的一場重新開始
  xu_chu: {
    id: "knockback",
    name: "怪力",
    knockbackTiles: 0.5,
    cooldownSec: 3,
  },
  // 正式設定表的被動描述「護衛：替隊友分擔傷害」沒有寫比例、範圍、扣血順序與多名護衛的規則。第一版的設計值，尚未做過平衡：
  // 典韋部署在戰場上、還活著時，2 格內（兩人中心的距離、含邊界）其他友軍武將受到敵人的直接攻擊，先照友軍自己的閃避、防禦與堅韌算出要扣的生命，
  // 典韋直接承擔其中的 20%（不再用典韋的防禦減少，也不超過典韋剩下的生命）、友軍扣其餘的部分；不保護自己、防禦塔與城池；
  // 同時有幾名護衛時只由一名承擔（比例高、距離近的優先），不疊加、承擔的部分不再轉給別人；只在戰鬥中、不改屬性與存檔
  dian_wei: {
    id: "guard_share",
    name: "護衛",
    shareRatio: 0.2,
    radiusTiles: 2,
  },
  // 正式設定表的被動描述「守護：提升基地防禦」沒有寫數值；遊戲的城池也沒有防禦屬性（城防 20 點、每隻漏城扣 1）。第一版的設計值，尚未做過平衡：
  // 孫權部署在戰場上、還活著時，敵人漏到城池的傷害 × 0.8（和部署位置無關）；城防仍是整數，這一場累計的漏城傷害無條件進位後才是扣掉的城防
  // （漏 5 隻扣 4、10 隻扣 8），不增加城防上限、不回復；累計在這一場保留，新的一場歸零；多個守護取最強、不疊加；不改結算公式與存檔
  sun_quan: { id: "base_guard", name: "守護", baseDamageMultiplier: 0.8 },
  // 正式設定表的被動描述「奇襲：首擊必殺」沒有寫每場、每波還是每個目標，也沒有寫有沒有免疫。第一版的設計值，尚未做過平衡：
  // 每場戰鬥甘寧第一次有效的普通攻擊（戰鬥中、目標活著、打得到、真的扣到生命）必殺主要目標：先照普通攻擊扣血，沒有打倒時補扣剩下的生命，
  // 不是兩倍傷害；每場只有一次，換波次、移位、升級、移出再放回都不恢復，新的一場才恢復；沒有免疫（設定表沒有首領分類）；只對主要目標，擊殺與金幣只算一次
  gan_ning: { id: "assassinate", name: "奇襲" },
  // 正式設定表的被動描述「魅惑：控制敵人」沒有寫時間、冷卻、範圍與受控後的行為。第一版的設計值，尚未做過平衡：
  // 貂蟬自己的普通攻擊打中仍活著的地面主要目標時，讓它受控 2 秒（戰鬥中的遊戲時間）：停在原地、不前進也不攻擊武將，改用自己的攻擊力打 1 格內最近的其他地面敵人
  // （照它原本 1 秒一次的攻擊間隔）；受控的敵人仍算在這一波裡（不會提早清波），但武將與防禦塔不選它，範圍、傳遞與新的減速也不算它；成功後冷卻 6 秒；
  // 打倒目標、飛行敵人、已經受控的敵人都不控制也不用掉冷卻；貂蟬陣亡、移出隊伍時控制立刻結束；不疊加、不刷新；冷卻在同一場保留，新的一場重新開始
  diao_chan: {
    id: "charm",
    name: "魅惑",
    durationSec: 2,
    cooldownSec: 6,
    attackRadiusTiles: 1,
  },
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

/** 堅韌的生命門檻與減傷的百分比（0.3、0.8 → 30、20；沒有堅韌時都是 0） */
export function tenacityPercents(skill: HeroSkill | null): {
  threshold: number;
  reduction: number;
} {
  return skill?.id === "tenacity"
    ? {
        threshold: round3(skill.lowHpRatio * 100),
        reduction: round3((1 - skill.damageMultiplier) * 100),
      }
    : { threshold: 0, reduction: 0 };
}

/** 威壓讓敵人直接攻擊力降低的百分比（0.9 → 10；沒有威壓時是 0） */
export function atkDownAuraPercent(skill: HeroSkill | null): number {
  return skill?.id === "atk_down_aura"
    ? round3((1 - skill.attackMultiplier) * 100)
    : 0;
}

/** 連射追加一擊的機率（百分比，0.2 → 20；沒有連射時是 0） */
export function doubleShotPercent(skill: HeroSkill | null): number {
  return skill?.id === "double_shot" ? round3(skill.doubleShotChance * 100) : 0;
}

/** 連環計每一次傳遞的傷害百分比（0.5、2 次 → [50, 25]；沒有連環計時是空陣列） */
export function chainPercents(skill: HeroSkill | null): number[] {
  if (skill?.id !== "chain") return [];
  const out: number[] = [];
  for (let k = 1; k <= skill.chainMaxJumps; k++) {
    out.push(round3(skill.chainRatio ** k * 100));
  }
  return out;
}

/** 呼風喚雨範圍內每一名受到的傷害百分比（0.5 → 50；沒有呼風喚雨時是 0） */
export function stormPercent(skill: HeroSkill | null): number {
  return skill?.id === "storm" ? round3(skill.stormRatio * 100) : 0;
}

/** 戰神每層與上限的攻擊力加成百分比（0.05、10 層 → 5、50；沒有戰神時都是 0） */
export function berserkPercents(skill: HeroSkill | null): {
  perStack: number;
  max: number;
} {
  return skill?.id === "berserk"
    ? {
        perStack: round3(skill.berserkRatio * 100),
        max: round3(skill.berserkRatio * skill.berserkMaxStacks * 100),
      }
    : { perStack: 0, max: 0 };
}

/** 每次有效擊殺的戰鬥金幣（和 Godot 的 BattleManager.GOLD_PER_KILL 相同） */
export const BASE_KILL_GOLD = 5;

/**
 * 補給在場時每次擊殺的戰鬥金幣（和 Godot 相同）：基礎 × 倍率，向下取整（加上很小的容許誤差，避免小數乘法差一點點時少算 1）；
 * 沒有補給時是基礎的 5
 */
export function supplyKillGold(skill: HeroSkill | null): number {
  if (skill?.id !== "supply") return BASE_KILL_GOLD;
  return Math.floor(BASE_KILL_GOLD * skill.goldMultiplier + 1e-6);
}

/** 補給讓每次擊殺戰鬥金幣增加的百分比（1.2 → 20；沒有補給時是 0） */
export function supplyPercent(skill: HeroSkill | null): number {
  return skill?.id === "supply" ? round3((skill.goldMultiplier - 1) * 100) : 0;
}

/** 護衛承擔的百分比（0.2 → 20；沒有護衛時是 0） */
export function guardSharePercent(skill: HeroSkill | null): number {
  return skill?.id === "guard_share" ? round3(skill.shareRatio * 100) : 0;
}

/**
 * 護衛的分攤（和 Godot 相同）：damage 是友軍照自己的閃避、防禦與堅韌算完後要扣的生命，guardHp 是護衛剩下的生命。
 * 護衛承擔 min(damage × 比例, 護衛剩下的生命)，友軍扣其餘的部分（用完整的傷害分攤，不先截成友軍剩下的生命）
 */
export function guardShareSplit(
  damage: number,
  ratio: number,
  guardHp: number
): { ally: number; guard: number } {
  const guard = Math.max(0, Math.min(damage * ratio, guardHp));
  return { ally: damage - guard, guard };
}

/** 守護讓漏城傷害減少的百分比（0.8 → 20；沒有守護時是 0） */
export function baseGuardPercent(skill: HeroSkill | null): number {
  return skill?.id === "base_guard"
    ? round3((1 - skill.baseDamageMultiplier) * 100)
    : 0;
}

/**
 * 戰場上方城防旁顯示的守護減傷百分比：Godot update_stats 的 base_guard_mult（這一場此刻生效的漏城傷害倍率）。
 * 不是 0.5 以上、小於 1 的有限數字（沒有生效的守護、舊版遊戲沒有這個欄位）時是 0，不顯示
 */
export function baseGuardHudPercent(mult: unknown): number {
  return typeof mult === "number" &&
    Number.isFinite(mult) &&
    mult >= 0.5 &&
    mult < 1
    ? round3((1 - mult) * 100)
    : 0;
}

/**
 * 連續漏城時每一隻實際扣掉的城防（和 Godot 的 BattleManager 相同）：累計的漏城傷害 T 每隻加上倍率，
 * 目標扣損＝ceil(T − 1e-6)，這一隻扣「目標扣損 − 已經扣掉的」。0.8 時 5 隻是 [1, 1, 1, 1, 0]
 */
export function baseGuardLosses(mult: number, count: number): number[] {
  const out: number[] = [];
  let total = 0;
  let lost = 0;
  for (let i = 0; i < count; i++) {
    total += mult;
    const target = Math.ceil(total - 1e-6);
    out.push(target - lost);
    lost = target;
  }
  return out;
}

/** 戰神的有效攻擊力（和 Godot 相同）：目前等級的攻擊力 ×（1 ＋ 每層比例 × 層數），加法疊加、不是連乘 */
export function berserkAttack(
  atk: number,
  ratio: number,
  stacks: number
): number {
  return atk * (1 + ratio * stacks);
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
 * - rawRange：這位武將目前等級屬性表上的射程；有提供時，射程技能會寫出戰場上的實際射程，減速光環、防禦光環、攻速光環與威壓會寫出目前的範圍半徑
 * - atk：這位武將目前的攻擊力；有提供時，火攻會寫出每次灼燒的傷害，連射會寫出追加一擊的傷害，連環計會寫出每次傳遞的傷害，呼風喚雨會寫出範圍內每一名受到的傷害，
 *   戰神會寫出各層數的攻擊力（例子，不是目前戰場上的層數）
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
  if (skill.id === "tenacity") {
    const { threshold, reduction } = tenacityPercents(skill);
    const m = skill.damageMultiplier;
    const plain = round3(damageAfterDefense(100, 100));
    const low = round3(plain * m);
    const hpAt = round3(1000 * skill.lowHpRatio);
    const aura = damageAfterDefense(100, 120);
    return (
      `受傷前生命不高於最大生命的 ${threshold}%（含剛好 ${threshold}%）時，受到的傷害先照防禦計算，再降低 ${reduction}%（變成 ${round3(m * 100)}%）。` +
      `例如最大生命 1000、防禦 100 的廖化被攻擊力 100 的敵人打一下：生命 ${hpAt + 1} 時扣 ${plain} 變成 ${round3(hpAt + 1 - plain)}（這一擊不減傷），下一擊只扣 ${low}；生命剛好 ${hpAt} 時就只扣 ${low}。` +
      `是防禦計算之後再少扣，不是提高防禦：在劉備的防禦光環裡扣約 ${aura.toFixed(2)} 的一擊變成約 ${(aura * m).toFixed(2)}。` +
      `用受傷前的生命判斷，生命回到超過 ${threshold}% 時就不減傷；升級後照新的最大生命計算。` +
      "閃避的一擊不扣血；減傷後仍然不夠的一擊照常倒下，不會留下 1 點生命，也不會復活。" +
      "生效時武將的血條有古銅色外框與小盾牌；戰場上的單位面板顯示選取當時是否生效，重新點選武將可以更新。" +
      "只在戰場生效：防禦、最大生命與存檔都不變。"
    );
  }
  if (skill.id === "atk_down_aura") {
    const pct = atkDownAuraPercent(skill);
    const m = skill.attackMultiplier;
    const current =
      rawRange === undefined
        ? ""
        : `目前等級的範圍半徑是 ${effectiveRange(skill, rawRange)} 格。`;
    const plain = round3(damageAfterDefense(100, 100));
    const lowered = round3(damageAfterDefense(100 * m, 100));
    return (
      `戰鬥中，以這位武將為中心、目前射程內（含邊界）的所有敵人攻擊武將的直接攻擊力降低 ${pct}%（變成原本的 ${round3(m * 100)}%）。` +
      current +
      "範圍跟著射程：升級射程變長時範圍一起變大；地面、飛行與免疫減速的敵人都算，也不需要普通攻擊的目標。" +
      `被打的武將照常用防禦計算：例如攻擊力 100 的敵人打防禦 100 的武將，從扣 ${plain} 變成扣 ${lowered}。` +
      "同時在幾個威壓範圍內時取最強的一個，不會疊加；敵人離開範圍，或這位武將移位、被移除、陣亡時就恢復。" +
      "只降低直接攻擊：敵人的移動速度與攻擊間隔不變，漏到城池時扣的城防也不會減少。" +
      "戰鬥中武將周圍有暗紅色的範圍圈，受到威壓的敵人血條右上方有暗紅色的向下箭頭（白色描邊）。只在戰場生效，不影響存檔。"
    );
  }
  if (skill.id === "double_shot") {
    const pct = doubleShotPercent(skill);
    const current =
      atk === undefined
        ? ""
        : `目前攻擊力 ${round3(atk)}：連射時同一個敵人在這次攻擊受到 ${round3(atk)} ＋ ${round3(atk)}。`;
    return (
      `每次普通攻擊命中敵人、而且敵人被這一擊打過後還活著時，有 ${pct}% 的機率在同一次攻擊對同一個敵人再打一擊，傷害是這次普通攻擊的攻擊力（100%）；武將上方會出現金色的「+1」。` +
      current +
      "每次普通攻擊各自判定一次、最多追加一擊，追加的一擊不會再連射；不換目標，也不會打到其他敵人。" +
      "第一擊就打倒敵人時不會連射（不會改打旁邊的敵人）；沒有目標、或打不到的敵人（飛行敵人要能對空的職業才打得到）不會判定。" +
      "追加的一擊照常可以打倒敵人，擊殺與金幣只算一次；追加的一擊不會引發其他技能。" +
      "攻擊間隔不變：連射不會讓下一次攻擊提早或延後。只在戰場生效，不影響存檔。"
    );
  }
  if (skill.id === "chain") {
    const pcts = chainPercents(skill);
    const r = skill.chainRadius;
    const steps = pcts.map((p) => `${p}%`).join("、再 ");
    const current =
      atk === undefined
        ? ""
        : `目前攻擊力 ${round3(atk)}：傳遞的傷害依序是 ${pcts.map((p) => round3((atk * p) / 100)).join("、")}。`;
    return (
      `每次普通攻擊實際打到敵人後，傷害會傳遞下去，最多 ${skill.chainMaxJumps} 次（${steps}）：從這個敵人被打中的位置，找 ${r} 格內（含邊界）最近、這次攻擊還沒打過的另一個敵人；` +
      `下一次再從剛被傳到的敵人的位置找 ${r} 格內的下一個，所以第二個被傳到的敵人可以離原本的目標超過 ${r} 格。` +
      `每次的傷害是這次普通攻擊傷害的 ${steps}（不是用前一個敵人實際扣掉的生命再算）；距離相同時先出現的敵人優先。` +
      current +
      "找不到下一個敵人就停止，不會回頭打已經打過的敵人；打不到的敵人不會被傳到（飛行敵人要能對空的職業才打得到）。" +
      "被傳到的敵人照常受傷、可以被打倒（擊殺與金幣只算一次）；目標或被傳到的敵人被打倒時，照樣從它倒下的位置繼續傳。" +
      "普通攻擊沒有打到敵人時不會傳遞；傳遞不算一次攻擊、不會引發其他技能，攻擊間隔不變。傳遞時會出現紫色的連線。只在戰場生效，不影響存檔。"
    );
  }
  if (skill.id === "storm") {
    const pct = stormPercent(skill);
    const r = skill.stormRadius;
    const n = skill.stormMaxTargets;
    const current =
      atk === undefined
        ? ""
        : `目前攻擊力 ${round3(atk)}：主要目標受到 ${round3(atk)}，範圍內其他敵人每一名受到 ${round3((atk * pct) / 100)}。`;
    return (
      `每次普通攻擊實際打到敵人後，以這個敵人被打中的位置為中心，${r} 格內（含邊界）最多 ${n} 名其他敵人各受到這次普通攻擊傷害的 ${pct}%；` +
      `被打中的主要目標照常受到普通攻擊的傷害，不會再被範圍打一次。中心是被打中的敵人，不是諸葛亮自己；離中心近的先算，距離相同時先出現的敵人優先，超過 ${n} 名時較遠的不受影響。` +
      current +
      `範圍內每一名都是同樣的 ${pct}%，不會遞減，也不會從被打中的敵人再往外傳（和龐統的連環計不同）。` +
      "主要目標被這一擊打倒時，照樣以它倒下的位置生效；打不到的敵人不會受到範圍傷害（飛行敵人要能對空的職業才打得到），免疫減速的敵人照樣受傷。" +
      "範圍傷害照常可以打倒敵人，擊殺與金幣只算一次；普通攻擊沒有打到敵人、或範圍內沒有其他敵人時就是一般的攻擊。" +
      "自動觸發，沒有手動施放或冷卻；範圍傷害不算一次攻擊、不會引發其他技能，攻擊間隔與射程不變。" +
      "觸發時以被打中的敵人為中心出現淡藍色的風雨圈，大小就是範圍。只在戰場生效，不影響存檔。"
    );
  }
  if (skill.id === "berserk") {
    const { perStack, max } = berserkPercents(skill);
    const n = skill.berserkMaxStacks;
    const current =
      atk === undefined
        ? ""
        : `以目前攻擊力 ${round3(atk)} 為例：每層 +${round3(atk * skill.berserkRatio)}，1 層 ${round3(berserkAttack(atk, skill.berserkRatio, 1))}、2 層 ${round3(berserkAttack(atk, skill.berserkRatio, 2))}、最多 ${n} 層 ${round3(berserkAttack(atk, skill.berserkRatio, n))}；每場戰鬥都從 0 層（${round3(atk)}）開始。`;
    return (
      `這位武將自己的普通攻擊打倒一名敵人後，從下一擊起攻擊力增加目前等級攻擊力的 ${perStack}%，可以疊加，最多 ${n} 層（+${max}%）；打倒敵人的那一擊照原本的層數計算。` +
      `每層加的都是同樣的 ${perStack}%（加法疊加，不是連乘）。` +
      current +
      "只算自己普通攻擊的最後一擊：其他武將、防禦塔、灼燒、反擊或範圍傷害打倒的敵人、敵人漏到城池都不算；同一個敵人只算一次，沒有打倒敵人的攻擊不加層。" +
      "層數只在這一場戰鬥保留：換波次、移動位置、升級、移出隊伍再放回都保留（升級後照新的攻擊力重新計算，不會重複加成）；切換關卡或重新開始從 0 層開始，不寫進存檔。" +
      "攻擊間隔、射程、防禦與生命不變，擊殺與金幣照常只算一次。" +
      `增加一層時武將上方出現橘紅色的「ATK+目前加成%」（例如「ATK+${perStack}%」），到達上限時是「ATK+${max}% MAX」，之後不再出現；` +
      "在戰場選取這位武將時，單位面板列出基礎與目前的攻擊力、層數與加成（選取當時的數值，重新點選可以更新）。只在戰場生效，不影響存檔。"
    );
  }
  if (skill.id === "supply") {
    const pct = supplyPercent(skill);
    const gold = supplyKillGold(skill);
    return (
      `部署在戰場上、還活著時，全隊每次擊殺敵人得到的戰鬥金幣增加 ${pct}%：每次從 ${BASE_KILL_GOLD} 變成 ${gold}（向下取整）。` +
      "不限這位武將自己打倒的：其他武將、防禦塔、灼燒等任何方式打倒的敵人都算，擊殺數照常只算一次；敵人漏到城池不算擊殺，也沒有金幣。" +
      `只放在隊伍裡、還沒部署時不生效；陣亡或被移出隊伍時立刻恢復成每次 ${BASE_KILL_GOLD}，重新部署後再生效；換波次、移動位置、升級都維持。` +
      "只增加這一場的戰鬥金幣（用來部署、建造、升級）：建造與升級的花費、拆除的返還、結算的戰場點數，以及玩家的金幣、經驗與存檔都不變。" +
      "同時有幾個補給在場時取最高的倍率，不會疊加。這位武將自己的攻擊力、攻擊間隔、射程、防禦與生命不變。" +
      "在戰場選取這位武將時，單位面板顯示選取當時是否生效與每次擊殺的金幣（重新點選可以更新）。只在戰場生效，不影響存檔。"
    );
  }
  if (skill.id === "knockback") {
    return (
      `這位武將自己的普通攻擊打中目標、實際扣到生命，而且目標沒有被這一擊打倒時，把這名地面敵人沿它自己走過的路線往回推 ${skill.knockbackTiles} 格；` +
      `成功推動後冷卻 ${skill.cooldownSec} 秒（戰鬥中的遊戲時間：2 倍速時跟著加快，暫停與備戰時不計），冷卻中的攻擊照常造成傷害、只是不推。` +
      "沿原路往回退：轉彎處會退回上一段路，最多退到敵人出發的地方，不會被推到別條路或直接推離武將；已在出發的地方推不動時不用掉冷卻。" +
      "傷害照普通攻擊，不另外加傷害、暈眩或攻擊次數，攻擊間隔與射程不變；被推開的敵人不再攻擊原本擋住它的武將，走回武將面前時照常被擋住、照原本的攻擊間隔攻擊。" +
      "只推這一擊的主要目標：其他武將、防禦塔、灼燒等造成的傷害都不會推；打不到飛行敵人（步兵不能對空）；免疫減速的敵人照樣會被推，減速、暈眩、灼燒等狀態照常保留。" +
      "冷卻只在這一場保留：換波次、移動位置、升級、移出隊伍再放回都不會重置；切換關卡或重新開始後重新計算。" +
      "成功推動時敵人上方出現淺藍色的「PUSH」；在戰場選取這位武將時，單位面板顯示選取當時剩下的冷卻（重新點選可以更新）。只在戰場生效，不影響存檔。"
    );
  }
  if (skill.id === "guard_share") {
    const pct = guardSharePercent(skill);
    const r = skill.radiusTiles;
    const full = guardShareSplit(100, skill.shareRatio, Infinity);
    const low = guardShareSplit(100, skill.shareRatio, 5);
    return (
      `部署在戰場上、還活著時，替 ${r} 格內（含邊界，以受傷當下兩人中心的距離計算）的其他友軍武將承擔敵人直接攻擊的 ${pct}%。` +
      `順序是友軍先照自己的閃避、防禦（含防禦光環）與堅韌算出這一擊要扣的生命，這位武將再直接承擔其中的 ${pct}%：例如要扣 100 時友軍扣 ${round3(full.ally)}、這位武將扣 ${round3(full.guard)}。` +
      `承擔的部分直接從這位武將的生命扣掉，不再用它自己的防禦、閃避或堅韌減少；生命不夠時只承擔得了剩下的生命（只剩 5 時友軍扣 ${round3(low.ally)}、這位武將扣 ${round3(low.guard)}），不會免費多擋。` +
      "分攤用的是完整的傷害：友軍生命很少時照樣按完整的傷害分攤，該倒下時照常倒下；這位武將也可能因為承擔而倒下。" +
      "不保護自己、防禦塔與城池；閃避的攻擊沒有傷害，不分攤；灼燒等不是敵人直接攻擊的扣血也不分攤。" +
      "同時有幾名護衛時只由一名承擔（比例高的優先，比例相同時距離近的優先），不疊加；兩名護衛互相保護時，承擔的部分不會再轉給另一名。" +
      "只在戰鬥中、受傷的當下判斷：陣亡、被移出隊伍、移到範圍外時立刻停止，備戰、結算與暫停時不分攤。被保護的夏侯惇反擊時只算自己實際被扣的部分。" +
      "成功承擔時這位武將上方出現「GUARD」並短暫加上描邊；在戰場選取這位武將時，單位面板顯示選取當時能否提供與範圍內的友軍（重新點選可以更新）。只在戰場生效，不影響存檔。"
    );
  }
  if (skill.id === "base_guard") {
    const pct = baseGuardPercent(skill);
    const m = skill.baseDamageMultiplier;
    const five = baseGuardLosses(m, 5);
    const ten = baseGuardLosses(m, 10).reduce((a, b) => a + b, 0);
    return (
      `部署在戰場上、還活著時，敵人漏到城池時城防受到的傷害減少 ${pct}%（每隻從 1 點變成 ${round3(m)} 點），和部署的位置無關。` +
      `城防仍是 20 點整數，不增加上限、不回復：這一場累計的漏城傷害無條件進位後才是實際扣掉的城防，例如連續漏 5 隻依序扣 ${five.join("、")}，共扣 ${five.reduce((a, b) => a + b, 0)}；漏 10 隻共扣 ${ten}。` +
      "累計在這一場保留：換波次、移動位置、升級、陣亡、移出隊伍再放回都不清除；沒有守護時每隻照 1 點累計，不會補扣先前少扣的部分；切換關卡或重新開始才歸零。" +
      "只影響敵人漏到城池扣的城防：防禦塔與武將受到的傷害不變，敵人照常離場、照常進入下一波；同時有幾名守護時取最強的一個，不疊加。" +
      "結算的星數與戰場點數照實際剩下的城防計算，不另外加獎勵、金幣或經驗。" +
      "保住城防（這一隻沒有扣）時城池旁出現「SHIELD」；戰場上方的城防旁顯示目前的漏城減傷，選取這位武將時單位面板顯示選取當時是否生效（重新點選可以更新）。只在戰場生效，不影響存檔。"
    );
  }
  if (skill.id === "charm") {
    return (
      `這位武將自己的普通攻擊打中目標、實際扣到生命，而且目標沒有被這一擊打倒時，讓這名地面敵人受控 ${skill.durationSec} 秒（戰鬥中的遊戲時間：2 倍速時跟著加快，暫停與備戰時不計）；` +
      `受控的敵人停在原地，不前進、不抵達城池，也不攻擊武將，改用自己的攻擊力攻擊 ${skill.attackRadiusTiles} 格內最近的其他地面敵人（照它原本的攻擊間隔），附近沒有其他敵人時就原地等待。` +
      `成功控制後冷卻 ${skill.cooldownSec} 秒，冷卻中的攻擊照常造成傷害、只是不控制；打倒目標、飛行敵人、已經受控的敵人都不控制，也不用掉冷卻。` +
      "受控的敵人仍算在這一波裡，不會讓波次提早結束；受控期間武將與防禦塔都不會攻擊它，範圍與傳遞的傷害、新的減速也不算它，控制結束後照常可以攻擊。" +
      "受控前已有的灼燒、暈眩、減速照原本的時間結束，暈眩中的受控敵人不攻擊；同時只受一位武將控制，不疊加、不刷新。" +
      "這位武將陣亡或被移出隊伍時，它造成的控制立刻結束，敵人從原本的位置繼續前進。冷卻在同一場保留，切換關卡或重新開始後重新計算。" +
      "成功控制時敵人上方出現粉紅色的「CHARM」，受控中的敵人有粉紅色的外圈；在戰場選取這位武將時，單位面板顯示選取當時剩下的冷卻（重新點選可以更新）。只在戰場生效，不影響存檔。"
    );
  }
  if (skill.id === "assassinate") {
    return (
      "每場戰鬥中，這位武將第一次有效的普通攻擊必定打倒主要目標：先照普通攻擊造成傷害，目標沒有倒下時再把它剩下的生命一次扣完；" +
      "不是兩倍傷害，目標的生命再多也一樣。有效是指戰鬥中、目標還活著、打得到（弓兵也打得到飛行敵人），而且這一擊真的扣到生命；沒有目標、備戰、結算或暫停時不會用掉。" +
      "每場只有一次：換波次、移動位置、升級、移出隊伍再放回都不會恢復，切換關卡或重新開始才恢復。" +
      "只對這一擊的主要目標，不會波及其他敵人，攻擊次數與攻擊間隔不變；被打倒的敵人照常只算一次擊殺與金幣，之後的普通攻擊照原本的傷害。" +
      "必殺時目標上方出現緋紅色的「KILL」，這位武將短暫加上緋紅色的描邊；在戰場選取這位武將時，單位面板顯示選取當時這一場用過了沒有（重新點選可以更新）。只在戰場生效，不影響存檔。"
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
  if (skill.id === "tenacity") {
    return {
      skill: {
        id: skill.id,
        low_hp_ratio: skill.lowHpRatio,
        damage_mult: skill.damageMultiplier,
      },
    };
  }
  if (skill.id === "atk_down_aura") {
    return { skill: { id: skill.id, atk_mult: skill.attackMultiplier } };
  }
  if (skill.id === "double_shot") {
    return {
      skill: { id: skill.id, double_shot_chance: skill.doubleShotChance },
    };
  }
  if (skill.id === "chain") {
    return {
      skill: {
        id: skill.id,
        chain_radius: skill.chainRadius,
        chain_ratio: skill.chainRatio,
        chain_max_jumps: skill.chainMaxJumps,
      },
    };
  }
  if (skill.id === "storm") {
    return {
      skill: {
        id: skill.id,
        storm_radius: skill.stormRadius,
        storm_ratio: skill.stormRatio,
        storm_max_targets: skill.stormMaxTargets,
      },
    };
  }
  if (skill.id === "berserk") {
    return {
      skill: {
        id: skill.id,
        berserk_ratio: skill.berserkRatio,
        berserk_max_stacks: skill.berserkMaxStacks,
      },
    };
  }
  if (skill.id === "supply") {
    return {
      skill: { id: skill.id, supply_gold_multiplier: skill.goldMultiplier },
    };
  }
  if (skill.id === "knockback") {
    return {
      skill: {
        id: skill.id,
        knockback_distance: skill.knockbackTiles,
        knockback_cooldown: skill.cooldownSec,
      },
    };
  }
  if (skill.id === "guard_share") {
    return {
      skill: {
        id: skill.id,
        guard_share_ratio: skill.shareRatio,
        guard_radius: skill.radiusTiles,
      },
    };
  }
  if (skill.id === "base_guard") {
    return {
      skill: { id: skill.id, base_damage_mult: skill.baseDamageMultiplier },
    };
  }
  if (skill.id === "assassinate") {
    return { skill: { id: skill.id } };
  }
  if (skill.id === "charm") {
    return {
      skill: {
        id: skill.id,
        charm_duration: skill.durationSec,
        charm_cooldown: skill.cooldownSec,
        charm_attack_radius: skill.attackRadiusTiles,
      },
    };
  }
  return {
    skill: {
      id: skill.id,
      first_attack_multiplier: skill.firstAttackMultiplier,
    },
  };
}
