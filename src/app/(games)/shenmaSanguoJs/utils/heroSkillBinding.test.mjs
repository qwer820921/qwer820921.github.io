// 神馬三國 JS 版武將技能接線（utils/heroSkillBinding.ts；純函式、不連網、不碰儲存空間）
// - 期望值是寫死的字面值，照正式技能表（shenmaSanguo/utils/heroSkills.ts 的 HERO_SKILLS 與 heroSkillPayload）的參數名與數值手寫，
//   不由被測函式或技能表產生：引擎讀技能時首擊缺值會補 2 倍、射程缺值會補 1.5 倍，只看引擎實例抓不到參數名寫錯，所以這裡逐鍵比對整個物件
// - 只認內建 13 位武將的完整 ID；未知、沒有前綴、大小寫不同、原型名稱、不是字串都沒有技能
// - 每次回傳新的物件，改掉回傳值不影響下一次；內建武將資料不被改動
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

const { canvasHeroSkill } = require(join(HERE, "heroSkillBinding.ts"));
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

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
