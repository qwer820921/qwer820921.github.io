// 神馬三國 JS 版武將技能接線（utils/heroSkillBinding.ts；純函式、不連網、不碰儲存空間）
// - 期望值是寫死的字面值，照正式技能表（shenmaSanguo/utils/heroSkills.ts 的 HERO_SKILLS 與 heroSkillPayload）的參數名與數值手寫，
//   不由被測函式或技能表產生：引擎讀技能時首擊缺值會補 2 倍、射程缺值會補 1.5 倍，只看引擎實例抓不到參數名寫錯，所以這裡逐鍵比對整個物件
// - 只認內建 13 位武將的完整 ID；未知、沒有前綴、大小寫不同、原型名稱、不是字串都沒有技能
// - 每次回傳新的物件，改掉回傳值不影響下一次；內建武將資料不被改動
// - 武將名冊的技能名稱與完整說明（canvasHeroSkillInfo）：13 段原文照正式技能表的 describeHeroSkill（不帶目前射程與攻擊力）手寫，
//   不由被測函式產生；未知武將一律 null（不猜），回傳值改掉不影響下一次，也不影響部署用的技能參數
// 用法：node "src/app/(games)/shenmaSanguoJs/utils/heroSkillBinding.test.mjs"
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const HERE = dirname(fileURLToPath(import.meta.url));

require.extensions[".ts"] = (module, filename) => {
  const out = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(out.outputText, filename);
};

const { canvasHeroSkill, canvasHeroSkillInfo } = require(
  join(HERE, "heroSkillBinding.ts")
);
const { BUILTIN_HEROES_CONFIG, DEFAULT_PLAYER_HEROES } = require(
  join(HERE, "../engine/builtinData.ts")
);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + JSON.stringify(detail).slice(0, 900)}`
  );
};
const sortKeys = (v) =>
  Array.isArray(v)
    ? v.map(sortKeys)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sortKeys(v[k])])
        )
      : v;
const same = (a, b) =>
  JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

// 正式技能表的 13 位（寫死）
const EXPECTED = {
  hero_ma_chao: { skill: { id: "first_strike", first_attack_multiplier: 2 } },
  hero_zhao_yun: { skill: { id: "dodge", dodge_chance: 0.15 } },
  hero_huang_zhong: { skill: { id: "long_range", range_multiplier: 1.5 } },
  hero_zhou_yu: {
    skill: { id: "burn", burn_ratio: 0.2, burn_ticks: 3, burn_interval: 1 },
  },
  hero_guan_yu: { skill: { id: "slow_aura", slow_mult: 0.9 } },
  hero_liu_bei: { skill: { id: "def_aura", def_mult: 1.2 } },
  hero_zhang_fei: { skill: { id: "stun", stun_sec: 0.5 } },
  hero_wei_yan: { skill: { id: "lifesteal", lifesteal_ratio: 0.15 } },
  hero_cao_cao: { skill: { id: "atk_speed_aura", atk_speed_mult: 1.15 } },
  hero_xia_hou_dun: { skill: { id: "counter", counter_ratio: 0.2 } },
  hero_liao_hua: {
    skill: { id: "tenacity", low_hp_ratio: 0.3, damage_mult: 0.8 },
  },
  hero_yan_liang: { skill: { id: "atk_down_aura", atk_mult: 0.9 } },
  hero_sun_shang_xiang: {
    skill: { id: "double_shot", double_shot_chance: 0.2 },
  },
};

const builtinBefore = JSON.stringify(BUILTIN_HEROES_CONFIG);
const defaultBefore = JSON.stringify(DEFAULT_PLAYER_HEROES);

// ═══ U1：13 位逐一整個物件、每個鍵都等於寫死的值 ═══
for (const [id, want] of Object.entries(EXPECTED)) {
  const got = canvasHeroSkill(id);
  check(
    `${id}：${want.skill.id} 的參數與數值逐鍵相同（不多不少）`,
    same(got, want) &&
      Object.keys(got).join() === "skill" &&
      Object.keys(got.skill).sort().join() ===
        Object.keys(want.skill).sort().join(),
    { got, want }
  );
}
check(
  "內建武將設定與訪客預設武將正好是這 13 位（沒有漏掉或多出的內建武將）",
  same(
    BUILTIN_HEROES_CONFIG.map((c) => c.hero_id).sort(),
    Object.keys(EXPECTED).sort()
  ) &&
    same(
      DEFAULT_PLAYER_HEROES.map((h) => h.hero_id).sort(),
      Object.keys(EXPECTED).sort()
    ),
  {
    builtin: BUILTIN_HEROES_CONFIG.map((c) => c.hero_id),
    defaults: DEFAULT_PLAYER_HEROES.map((h) => h.hero_id),
  }
);
check(
  "13 位的技能 id 都不同（不同武將不共用同一份參數）",
  new Set(Object.keys(EXPECTED).map((id) => canvasHeroSkill(id).skill?.id))
    .size === 13
);

// ═══ U2：不是內建武將的完整 ID 一律沒有技能（不猜、不轉字串） ═══
const UNKNOWN = [
  ["後端才有的武將 hero_gan_ning", "hero_gan_ning"],
  ["名冊有圖但沒有技能的 hero_lv_bu", "hero_lv_bu"],
  ["沒有前綴的 ma_chao", "ma_chao"],
  ["全大寫 HERO_MA_CHAO", "HERO_MA_CHAO"],
  ["ID 大小寫不同 hero_Ma_Chao", "hero_Ma_Chao"],
  ["前後有空白", " hero_ma_chao "],
  ["只有前綴 hero_", "hero_"],
  ["空字串", ""],
  ["constructor", "constructor"],
  ["__proto__", "__proto__"],
  ["toString", "toString"],
  ["hasOwnProperty", "hasOwnProperty"],
  ["hero_constructor", "hero_constructor"],
  ["hero___proto__", "hero___proto__"],
  ["hero_toString", "hero_toString"],
  ["hero_valueOf", "hero_valueOf"],
  ["undefined", undefined],
  ["null", null],
  ["數字", 1],
  ["陣列 [hero_ma_chao]", ["hero_ma_chao"]],
  ["toString 回傳 hero_ma_chao 的物件", { toString: () => "hero_ma_chao" }],
  ["String 物件", new String("hero_ma_chao")],
];
for (const [label, input] of UNKNOWN) {
  let got;
  let threw = null;
  try {
    got = canvasHeroSkill(input);
  } catch (e) {
    threw = String(e);
  }
  check(
    `未知：${label} → {}（沒有 skill）`,
    !threw &&
      got &&
      Object.getPrototypeOf(got) === Object.prototype &&
      Object.keys(got).length === 0 &&
      !Object.prototype.hasOwnProperty.call(got, "skill") &&
      JSON.stringify(got) === "{}",
    { threw, got }
  );
}

// ═══ U3：每次新的物件；改掉回傳值不影響下一次；輸入與內建資料不變 ═══
{
  const a = canvasHeroSkill("hero_ma_chao");
  const b = canvasHeroSkill("hero_ma_chao");
  check(
    "兩次呼叫是不同的物件（外層與 skill 都不同）",
    a !== b && a.skill !== b.skill
  );
  a.skill.first_attack_multiplier = 99;
  a.skill.id = "stun";
  a.extra = 1;
  const z = canvasHeroSkill("hero_zhou_yu");
  z.skill.burn_ticks = 0;
  delete z.skill.burn_interval;
  check(
    "改掉上一次的回傳值後，下一次仍是正式表的值",
    same(canvasHeroSkill("hero_ma_chao"), EXPECTED.hero_ma_chao) &&
      same(canvasHeroSkill("hero_zhou_yu"), EXPECTED.hero_zhou_yu),
    {
      ma: canvasHeroSkill("hero_ma_chao"),
      zhou: canvasHeroSkill("hero_zhou_yu"),
    }
  );
  check(
    "內建武將設定與訪客預設武將沒有被改動",
    JSON.stringify(BUILTIN_HEROES_CONFIG) === builtinBefore &&
      JSON.stringify(DEFAULT_PLAYER_HEROES) === defaultBefore
  );
  const frozenId = Object.freeze(["hero_liu_bei"]);
  let threw = null;
  try {
    canvasHeroSkill(frozenId[0]);
  } catch (e) {
    threw = String(e);
  }
  check("輸入的 ID 來自凍結的陣列也照常（不改輸入）", !threw, threw);
}

// ═══ U4（單元部分）：和原本的武將數值合在一起時，數值（含 0）不變、只多 skill ═══
{
  const base = {
    hero_id: "hero_liao_hua",
    level: 0,
    star: 0,
    atk: 0,
    def: 0,
    hp: 0,
  };
  const merged = { ...base, ...canvasHeroSkill(base.hero_id) };
  check(
    "合併後原本的六個欄位（含 0）不變，另外只有 skill",
    same(merged, {
      hero_id: "hero_liao_hua",
      level: 0,
      star: 0,
      atk: 0,
      def: 0,
      hp: 0,
      skill: { id: "tenacity", low_hp_ratio: 0.3, damage_mult: 0.8 },
    }),
    merged
  );
  const unknown = {
    hero_id: "hero_gan_ning",
    level: 2,
    star: 1,
    atk: 9,
    def: 8,
    hp: 7,
  };
  const mergedUnknown = { ...unknown, ...canvasHeroSkill(unknown.hero_id) };
  check(
    "未知武將合併後和原本完全相同（沒有 skill 欄位）",
    same(mergedUnknown, unknown) && !("skill" in mergedUnknown),
    mergedUnknown
  );
}

// ═══ U5：武將名冊的技能名稱與完整說明（13 段原文寫死，照正式技能表 describeHeroSkill 不帶目前射程與攻擊力的結果手寫） ═══
const EXPECTED_INFO = {
  hero_ma_chao: {
    name: "衝鋒",
    description:
      "每場戰鬥中，第一次命中敵人的普通攻擊造成 2 倍傷害（武將上方會出現金色的「x2!」），之後恢復普通攻擊。沒有目標時不會用掉；同一場戰鬥裡換波次、移動位置、調整隊伍或移除後重新放置都不會再觸發，切換關卡或重新開始才會重置。",
  },
  hero_zhao_yun: {
    name: "閃避",
    description:
      "敵人攻擊這位武將時（目前是被武將擋在路上的敵人），每一擊有 15% 的機率閃避：這一擊不扣血，武將上方出現藍白色的「MISS」；沒有閃避時照原本的防禦計算扣血。每一擊各自判定，沒有冷卻、不會疊加；閃避不會讓敵人馬上再打一次，敵人的攻擊間隔照常。升級、移動位置、換波次都維持同樣的機率。只在戰場生效，不影響存檔。",
  },
  hero_huang_zhong: {
    name: "百步穿楊",
    description:
      "戰場上的有效射程是屬性射程的 1.5 倍，等級提升的射程成長也一起乘上 1.5 倍；普通攻擊的傷害與攻擊間隔不變。只在戰場生效，存檔與屬性表的「範圍」仍是原本的數值；在戰場選取武將時，射程圈顯示的是實際射程。移動位置、調整隊伍或重新放置都不會重複加成。",
  },
  hero_zhou_yu: {
    name: "火攻",
    description:
      "每次普通攻擊命中後，敵人開始灼燒：每 1 秒受到一次傷害，共 3 次，每次是命中當下攻擊力的 20%（第一次在命中 1 秒後），普通攻擊的傷害不變。同一個敵人只有一份灼燒：再次命中時剩餘次數回到 3 次、傷害換成這次命中的攻擊力，不會疊加，下一次灼燒的時間也不會重新計算。敵人離開射程或武將被移除後仍會燒完；敵人被打倒或抵達基地就停止，灼燒不會再引發火攻。灼燒中的敵人有橘色外圈，灼燒的傷害數字是橘色。只在戰場生效，不影響存檔。",
  },
  hero_guan_yu: {
    name: "減速光環",
    description:
      "戰鬥中，以這位武將為中心、目前射程內（含邊界）的所有地面敵人移動速度降低 10%（變成原本的 90%）。範圍跟著射程：升級射程變長時範圍一起變大。不需要普通攻擊的目標，也不改變普通攻擊的傷害與攻擊間隔。飛行敵人與免疫減速的敵人不受影響（普通攻擊照常打得到地面上免疫減速的敵人）。敵人離開範圍，或武將移位、被移除、陣亡時減速就解除；和其他減速（武將在道路上的阻擋、步兵塔、另一個減速光環）同時作用時取最強的一個，不會疊加，文士塔的減速另外計算。戰鬥中武將周圍會顯示淺藍色的範圍圈，被減速的敵人有淺藍色的虛線外圈。只在戰場生效，不影響存檔。",
  },
  hero_liu_bei: {
    name: "防禦光環",
    description:
      "戰鬥中，以這位武將為中心、目前射程內（含邊界）的其他友軍武將防禦力提升 20%（乘在該武將目前等級的防禦上，變成 1.2 倍）。不含自己，防禦塔與城池不受影響；友軍的職業不限，也不需要普通攻擊的目標。範圍跟著射程：升級射程變長時範圍一起變大。受到攻擊時照原本的防禦公式、用提升後的防禦計算，不是直接少扣 20% 的傷害（例如防禦 100 的友軍被攻擊力 100 的敵人打一下，從扣 50 變成扣約 45.5）；趙雲的閃避照常先判定。同時在幾個防禦光環範圍內時取最強的一個，不會疊加。友軍離開範圍，或這位武將移位、被移除、陣亡、戰鬥結束時加成就解除。戰鬥中武將周圍會顯示淺綠色的範圍圈，受到加成的友軍有淺綠色的外框；在戰場上選取友軍時會分開列出原本的防禦與加成後的防禦。只在戰場生效：存檔與屬性表的防禦不會提高。",
  },
  hero_zhang_fei: {
    name: "暈眩",
    description:
      "每次普通攻擊命中、而且敵人被打後還活著時，這個敵人暈眩 0.5 秒（遊戲時間）：暈眩中停止移動，也不能攻擊擋住它的武將，但照常受到傷害、可以被打倒。再次命中時剩餘時間刷新成 0.5 秒，不會累加；已經有更長的暈眩時不會縮短。普通攻擊的傷害與攻擊間隔不變，沒有機率、不波及其他敵人；打倒敵人的那一擊與灼燒都不會引發暈眩。暈眩不是減速：免疫減速的敵人也會暈眩；暈眩期間減速與灼燒照常計時，結束後恢復當時的移動速度，敵人的攻擊冷卻照常倒數但不會累積，恢復後最多先打一下。這位武將移位、被移除或陣亡時，已經造成的暈眩照樣持續到時間結束；暈眩不會讓武將打得到原本打不到的敵人（步兵打不到飛行敵人）。暈眩中的敵人頭上有轉動的黃色星星。只在戰場生效，不影響存檔。",
  },
  hero_wei_yan: {
    name: "吸血",
    description:
      "每次普通攻擊命中敵人後，這位武將恢復這一擊實際造成傷害的 15% 生命（例如打掉 100 恢復 15）。只算實際扣掉的生命：打倒敵人的那一擊也會恢復，但超過敵人剩餘生命的部分不算（敵人只剩 30 時恢復 4.5，不是 15）。恢復後不會超過最大生命，滿血時不恢復；已經陣亡的武將不會因此復活。只算這位武將自己普通攻擊的直接傷害：沒有命中（沒有目標、職業打不到飛行敵人）就不恢復，灼燒、其他武將與防禦塔造成的傷害也不算；普通攻擊的傷害、攻擊間隔與射程不變，也沒有另外計時的回血。恢復時武將上方出現綠色的「+恢復量」；戰場上的單位面板顯示的是選取當時的生命，重新點選武將可以看到恢復後的生命。只在戰場生效：恢復的是這場戰鬥中的生命，最大生命與屬性不變，不影響存檔。",
  },
  hero_cao_cao: {
    name: "指揮",
    description:
      "戰鬥中，以這位武將為中心、目前射程內（含邊界）的其他友軍武將攻擊速度提升 15%：每秒攻擊次數變成 1.15 倍，攻擊間隔變成原本的 1 ÷ 1.15（例如 1 秒變成約 0.87 秒，不是直接少 15%）。不含自己，防禦塔與城池不受影響；友軍的職業不限，也不需要普通攻擊的目標。範圍跟著射程：升級射程變長時範圍一起變大。友軍的攻擊力與射程不變。加成只用在之後開始的攻擊冷卻：進入範圍時正在倒數的冷卻照原本的時間打完，不會立刻補打；離開範圍，或這位武將移位、被移除、陣亡、戰鬥結束時加成解除，正在倒數的冷卻同樣照原本的時間。同時在幾個攻速光環範圍內時取最強的一個，不會疊加。戰鬥中武將周圍會顯示淡紫色的範圍圈，受到加成的友軍有淡紫色的外框；在戰場上選取友軍時會分開列出原本與加成後的攻擊間隔（選取當時的數值）。只在戰場生效：存檔與屬性表的攻擊間隔不會改變。",
  },
  hero_xia_hou_dun: {
    name: "反擊",
    description:
      "受到敵人的直接攻擊（目前是被武將擋在路上的敵人）、實際扣血後自己仍然活著時，對這次攻擊自己的敵人造成這一擊實際扣血 20% 的傷害。以防禦計算後實際扣掉的生命為準，不是敵人攻擊力的 20%：例如防禦 100 的武將被攻擊力 100 的敵人打一下扣 50、反彈 10；在劉備的防禦光環裡（防禦 120）扣約 45.45、反彈約 9.09。反彈不會替自己減少傷害。閃避（沒有扣血）、打倒自己的那一擊、沒有攻擊者的扣血都不反彈；只反彈給這次攻擊自己、仍然活著的敵人，不會波及其他敵人。反彈可以打倒攻擊者（擊殺與金幣照常只算一次），免疫減速的敵人照樣會受到反彈；反彈不會再引發吸血、暈眩、灼燒等其他技能，也不會來回反彈。反彈的傷害數字是洋紅色。普通攻擊的傷害、攻擊間隔與射程不變；戰場上的單位面板顯示的是選取當時的生命，重新點選武將可以看到最新的生命。只在戰場生效，不影響存檔。",
  },
  hero_liao_hua: {
    name: "堅韌",
    description:
      "受傷前生命不高於最大生命的 30%（含剛好 30%）時，受到的傷害先照防禦計算，再降低 20%（變成 80%）。例如最大生命 1000、防禦 100 的廖化被攻擊力 100 的敵人打一下：生命 301 時扣 50 變成 251（這一擊不減傷），下一擊只扣 40；生命剛好 300 時就只扣 40。是防禦計算之後再少扣，不是提高防禦：在劉備的防禦光環裡扣約 45.45 的一擊變成約 36.36。用受傷前的生命判斷，生命回到超過 30% 時就不減傷；升級後照新的最大生命計算。閃避的一擊不扣血；減傷後仍然不夠的一擊照常倒下，不會留下 1 點生命，也不會復活。生效時武將的血條有古銅色外框與小盾牌；戰場上的單位面板顯示選取當時是否生效，重新點選武將可以更新。只在戰場生效：防禦、最大生命與存檔都不變。",
  },
  hero_yan_liang: {
    name: "威壓",
    description:
      "戰鬥中，以這位武將為中心、目前射程內（含邊界）的所有敵人攻擊武將的直接攻擊力降低 10%（變成原本的 90%）。範圍跟著射程：升級射程變長時範圍一起變大；地面、飛行與免疫減速的敵人都算，也不需要普通攻擊的目標。被打的武將照常用防禦計算：例如攻擊力 100 的敵人打防禦 100 的武將，從扣 50 變成扣 45。同時在幾個威壓範圍內時取最強的一個，不會疊加；敵人離開範圍，或這位武將移位、被移除、陣亡時就恢復。只降低直接攻擊：敵人的移動速度與攻擊間隔不變，漏到城池時扣的城防也不會減少。戰鬥中武將周圍有暗紅色的範圍圈，受到威壓的敵人血條右上方有暗紅色的向下箭頭（白色描邊）。只在戰場生效，不影響存檔。",
  },
  hero_sun_shang_xiang: {
    name: "連射",
    description:
      "每次普通攻擊命中敵人、而且敵人被這一擊打過後還活著時，有 20% 的機率在同一次攻擊對同一個敵人再打一擊，傷害是這次普通攻擊的攻擊力（100%）；武將上方會出現金色的「+1」。每次普通攻擊各自判定一次、最多追加一擊，追加的一擊不會再連射；不換目標，也不會打到其他敵人。第一擊就打倒敵人時不會連射（不會改打旁邊的敵人）；沒有目標、或打不到的敵人（飛行敵人要能對空的職業才打得到）不會判定。追加的一擊照常可以打倒敵人，擊殺與金幣只算一次；追加的一擊不會引發其他技能。攻擊間隔不變：連射不會讓下一次攻擊提早或延後。只在戰場生效，不影響存檔。",
  },
};
for (const [id, want] of Object.entries(EXPECTED_INFO)) {
  const got = canvasHeroSkillInfo(id);
  check(
    `名冊說明 ${id}：名稱「${want.name}」與完整說明逐字相同、只有 name 與 description`,
    !!got &&
      Object.getPrototypeOf(got) === Object.prototype &&
      Object.keys(got).sort().join() === "description,name" &&
      got.name === want.name &&
      got.description === want.description,
    { got, want }
  );
}
check(
  "名冊說明涵蓋內建 13 位（和部署技能是同一份名單）",
  same(Object.keys(EXPECTED_INFO).sort(), Object.keys(EXPECTED).sort()),
  Object.keys(EXPECTED_INFO)
);
{
  const d = (id) => (canvasHeroSkillInfo(id) || {}).description || "";
  check(
    "錨點：馬超首擊是 2 倍、反擊打的是這次攻擊自己的敵人、廖化的門檻含剛好 30%",
    d("hero_ma_chao").includes("造成 2 倍傷害") &&
      d("hero_xia_hou_dun").includes("對這次攻擊自己的敵人造成") &&
      d("hero_liao_hua").includes("不高於最大生命的 30%（含剛好 30%）"),
    {
      ma: d("hero_ma_chao").slice(0, 40),
      xia: d("hero_xia_hou_dun").slice(0, 60),
      liao: d("hero_liao_hua").slice(0, 40),
    }
  );
  check(
    "說明不帶目前的射程與攻擊力（沒有「目前等級」「目前攻擊力」的數值句）",
    Object.keys(EXPECTED_INFO).every(
      (id) => !/目前等級：|目前等級的範圍半徑|目前攻擊力 /.test(d(id))
    ),
    Object.keys(EXPECTED_INFO).filter((id) =>
      /目前等級：|目前等級的範圍半徑|目前攻擊力 /.test(d(id))
    )
  );
}

// ═══ U6：名冊說明只認內建 13 位的完整 ID；其他一律 null（不猜、不只去掉前綴查） ═══
for (const [label, input] of UNKNOWN) {
  let got;
  let threw = null;
  try {
    got = canvasHeroSkillInfo(input);
  } catch (e) {
    threw = String(e);
  }
  check(`名冊說明未知：${label} → null`, !threw && got === null, {
    threw,
    got,
  });
}

// ═══ U7：名冊說明每次新的物件；改掉回傳值不影響下一次、不影響部署技能參數與內建資料 ═══
{
  const a = canvasHeroSkillInfo("hero_liao_hua");
  const b = canvasHeroSkillInfo("hero_liao_hua");
  check("名冊說明兩次呼叫是不同的物件", !!a && !!b && a !== b, { a, b });
  a.name = "誘餌";
  a.description = "誘餌說明";
  a.extra = 1;
  check(
    "改掉名冊說明的回傳值後，下一次仍是正式表的原文",
    same(canvasHeroSkillInfo("hero_liao_hua"), EXPECTED_INFO.hero_liao_hua),
    canvasHeroSkillInfo("hero_liao_hua")
  );
  check(
    "查過名冊說明之後，13 位的部署技能參數仍逐鍵等於正式表的值",
    Object.entries(EXPECTED).every(([id, want]) =>
      same(canvasHeroSkill(id), want)
    ),
    Object.keys(EXPECTED).filter(
      (id) => !same(canvasHeroSkill(id), EXPECTED[id])
    )
  );
  check(
    "查過名冊說明之後，內建武將設定與訪客預設武將沒有被改動",
    JSON.stringify(BUILTIN_HEROES_CONFIG) === builtinBefore &&
      JSON.stringify(DEFAULT_PLAYER_HEROES) === defaultBefore,
    {
      builtin: JSON.stringify(BUILTIN_HEROES_CONFIG) === builtinBefore,
      defaults: JSON.stringify(DEFAULT_PLAYER_HEROES) === defaultBefore,
    }
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
