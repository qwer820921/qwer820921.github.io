// 神馬三國 JS 版共用存檔測試用的嚴格契約 fixture（只給這個功能的測試用；不是共用 harness 的 mock，也不是正式後端）。
// 逐分支照後端 v2.9（Code.v2.9.gs）的玩家動作：get_profile、create_profile、save_profile、upgrade_hero、save_result（只有 settle_contract 2），
// 和 get_heroes_config／get_enemies_config／get_all_maps 的讀取。和共用 harness 的 mock 不同：
// - save_profile 遇到不存在的存檔回 404、不建立（只有 create_profile 會建立）
// - base_rev：null／沒帶時照 REQUIRE_BASE_REV（預設關，可切換）；非負整數以外回 400 BAD_BASE_REV；和目前版本不同回 409 REV_CONFLICT（附目前的 data 與 rev），不寫入
// - 弱驗證：gold 是數字、nickname 是字串、heroes 是陣列、team 沒有或是陣列
// - 結算（settle_contract 2）：request_id 去重、指紋不同 REQUEST_ID_REUSED、被擠出去重紀錄的舊結算 RESULT_UNKNOWN、base_mismatch 的回應規則
// 沒有模擬的部分（照實列出）：鎖與 BUSY、MAX_CELL_CHARS 以外的試算表限制、舊版 save_result（沒有 settle_contract）、管理動作、battle_logs 的寫入失敗
// 這份 fixture 和後端原始碼的一致性另外用原始碼在本機模擬環境逐一比對（不是正式 DB 的驗收）

const MAX_CELL_CHARS = 49000;
const RESULT_MEMORY = 30;
const SETTLE_CONTRACT = 2;
const MAX_LEVEL_UPS = 10000;

const clone = (o) =>
  o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** 和後端 isValidPlayerData 相同 */
export function isValidPlayerData(d) {
  return (
    isObj(d) &&
    typeof d.gold === "number" &&
    typeof d.nickname === "string" &&
    Array.isArray(d.heroes) &&
    (d.team === undefined || Array.isArray(d.team))
  );
}
const revNumber = (v) => {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && Math.floor(n) === n ? n : 0;
};
const parseBaseRev = (payload) => {
  const v = payload ? payload.base_rev : undefined;
  if (v === undefined || v === null) return { ok: true, value: null };
  if (
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= 0 &&
    Math.floor(v) === v
  )
    return { ok: true, value: v };
  return { ok: false };
};
const isCount = (v) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const logNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const stageToNum = (id) => {
  const m = String(id || "").match(/chapter(\d+)_(\d+)/);
  return m ? parseInt(m[1], 10) * 100 + parseInt(m[2], 10) : 0;
};
const nextStageId = (id) => {
  const m = String(id || "").match(/chapter(\d+)_(\d+)/);
  if (!m) return id;
  let chapter = parseInt(m[1], 10);
  let stage = parseInt(m[2], 10) + 1;
  if (stage > 10) {
    chapter += 1;
    stage = 1;
  }
  return "chapter" + chapter + "_" + stage;
};
const validGrowth = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const speedGrowthOf = (config) => {
  const a = validGrowth(config.atk_spd_growth);
  if (a !== null) return a;
  const s = validGrowth(config.speed_growth);
  return s !== null ? s : 0;
};
const settleInput = (payload, result) => {
  const stars = payload.stars_earned;
  if (
    !(
      typeof stars === "number" &&
      Number.isInteger(stars) &&
      stars >= 0 &&
      stars <= 3
    )
  )
    return { ok: false, field: "stars_earned" };
  if (
    payload.loots !== undefined &&
    payload.loots !== null &&
    !Array.isArray(payload.loots)
  )
    return { ok: false, field: "loots" };
  const loots = Array.isArray(payload.loots) ? payload.loots : [];
  let bp = 0;
  let gold = 0;
  let hasBp = false;
  for (const l of loots) {
    if (
      !l ||
      typeof l !== "object" ||
      (l.item !== "battle_points" && l.item !== "gold")
    )
      continue;
    if (!isCount(l.count)) return { ok: false, field: "loots" };
    if (l.item === "battle_points") {
      bp += l.count;
      hasBp = true;
    } else gold += l.count;
  }
  const points = result === "WIN" ? (hasBp ? bp : gold) : 10;
  if (!Number.isSafeInteger(points)) return { ok: false, field: "loots" };
  const exp = result === "WIN" ? 50 + stars * 20 : 10;
  return {
    ok: true,
    stars,
    points,
    exp,
    kills: logNumber(payload.kills),
    time: logNumber(payload.time_seconds),
  };
};
const settleFingerprint = (result, stageId, s) =>
  [result, stageId, s.stars, s.points, s.kills, s.time].join("|");
const applySettle = (data, result, stageId, s) => {
  let level = Number(data.level);
  if (!(Number.isFinite(level) && level >= 1 && Math.floor(level) === level))
    level = 1;
  let exp = Number(data.exp);
  if (!(Number.isFinite(exp) && exp >= 0)) exp = 0;
  exp += s.exp;
  for (let n = 0; n < MAX_LEVEL_UPS && exp >= level * 100; n++) {
    exp -= level * 100;
    level += 1;
  }
  data.gold = (Number(data.gold) || 0) + s.points;
  data.exp = exp;
  data.level = level;
  data.capacity = 10 + level;
  if (result === "WIN") {
    const next = nextStageId(stageId);
    if (stageToNum(next) > stageToNum(String(data.max_stage || "")))
      data.max_stage = next;
  }
  return {
    gold: data.gold,
    exp: data.exp,
    level: data.level,
    capacity: data.capacity,
    max_stage: data.max_stage,
  };
};
const resultBody = (out, baseRev, rev, prevRev) => {
  out.prev_rev = prevRev;
  if (baseRev !== null && baseRev === prevRev) out.rev = rev;
  else if (baseRev !== null) out.base_mismatch = true;
  return out;
};

/**
 * 建立一個記憶體內的後端。heroesConfig 是 heroes_config 的列（物件，數值照試算表讀出來的型別）。
 * 回傳的 handle({ action, key, payload }) 回應和後端相同形狀（{ status, ... }）
 */
export function createProfileFixture({
  heroesConfig = [],
  enemies = [],
  maps = [],
  requireBaseRev = false,
} = {}) {
  /** key → { cell: 存檔原文（JSON 字串）, colRev } */
  const players = new Map();
  const log = [];
  let requireRev = requireBaseRev;
  let uuid = 0;

  const readMeta = (raw) => {
    const m = isObj(raw) ? raw : {};
    const results = Array.isArray(m.results)
      ? m.results.filter(
          (r) => r && typeof r === "object" && typeof r.id === "string"
        )
      : [];
    const t = m.trimmed_rev;
    const trimmedRev =
      typeof t === "number" &&
      Number.isFinite(t) &&
      t >= 0 &&
      Math.floor(t) === t
        ? t
        : null;
    return { rev: revNumber(m.rev), results, trimmedRev };
  };
  const find = (key) => {
    const row = players.get(key);
    if (!row) return null;
    let obj = null;
    try {
      obj = JSON.parse(row.cell);
    } catch {
      obj = null;
    }
    const meta = readMeta(isObj(obj) ? obj._meta : null);
    const ok = isValidPlayerData(obj);
    const data = ok
      ? (() => {
          const d = { ...obj };
          delete d._meta;
          return d;
        })()
      : null;
    return {
      key,
      data,
      corrupt: !ok,
      meta,
      rev: Math.max(meta.rev, revNumber(row.colRev)),
    };
  };
  const write = (found, data, opts = {}) => {
    const bump = opts.bump !== false;
    const prevRev = found.rev;
    const next = bump ? prevRev + 1 : prevRev;
    const trimmedRev =
      opts.trimmedRev !== undefined ? opts.trimmedRev : found.meta.trimmedRev;
    const meta = { rev: next, results: opts.results || found.meta.results };
    if (trimmedRev !== null && trimmedRev !== undefined)
      meta.trimmed_rev = trimmedRev;
    const clean = { ...data };
    delete clean._meta;
    const json = JSON.stringify({ ...clean, _meta: meta });
    if (json.length > MAX_CELL_CHARS) return null;
    players.set(found.key, { cell: json, colRev: next });
    return { rev: next, prevRev };
  };
  const rememberResult = (meta, entry) => {
    const all = meta.results.concat([entry]);
    let trimmedRev = meta.trimmedRev;
    const dropped =
      all.length > RESULT_MEMORY
        ? all.slice(0, all.length - RESULT_MEMORY)
        : [];
    for (const r of dropped) {
      const p = revNumber(r.prev_rev);
      if (trimmedRev === null || p > trimmedRev) trimmedRev = p;
    }
    return { results: all.slice(-RESULT_MEMORY), trimmedRev };
  };
  const trimHorizon = (meta) => {
    if (meta.trimmedRev !== null) return meta.trimmedRev;
    if (meta.results.length < RESULT_MEMORY) return -1;
    return meta.results.reduce(
      (min, r) => Math.min(min, revNumber(r.prev_rev)),
      Infinity
    );
  };
  const conflictBody = (error, found) => ({
    error,
    rev: found.rev,
    data: clone(found.data),
  });

  const actions = {
    get_profile(key) {
      const found = find(key);
      if (!found) return { status: 404, error: "PROFILE_NOT_FOUND" };
      if (found.corrupt)
        return { status: 500, error: "DATA_CORRUPT", rev: found.rev };
      return { status: 200, data: clone(found.data), rev: found.rev };
    },
    create_profile(key, payload) {
      if (find(key) !== null)
        return { status: 400, error: "KEY_ALREADY_EXISTS" };
      const nickname =
        payload && typeof payload.nickname === "string" && payload.nickname
          ? payload.nickname.slice(0, 50)
          : "旅行者";
      const initialData = {
        nickname,
        level: 1,
        exp: 0,
        gold: 500,
        capacity: 11,
        max_stage: "chapter1_1",
        heroes: [],
        team: [],
      };
      players.set(key, {
        cell: JSON.stringify({
          ...initialData,
          _meta: { rev: 1, results: [] },
        }),
        colRev: 1,
      });
      return {
        status: 200,
        success: true,
        key,
        data: clone(initialData),
        rev: 1,
      };
    },
    save_profile(key, payload) {
      const found = find(key);
      if (!found) return { status: 404, error: "PROFILE_NOT_FOUND" };
      const base = parseBaseRev(payload);
      if (!base.ok) return { status: 400, error: "BAD_BASE_REV" };
      if (found.corrupt)
        return { status: 500, error: "DATA_CORRUPT", rev: found.rev };
      const data = payload.data;
      if (!data) return { status: 400, error: "MISSING_DATA" };
      if (!isValidPlayerData(data))
        return { status: 400, error: "INVALID_DATA" };
      if (base.value === null && requireRev)
        return { status: 428, ...conflictBody("BASE_REV_REQUIRED", found) };
      if (base.value !== null && base.value !== found.rev)
        return { status: 409, ...conflictBody("REV_CONFLICT", found) };
      const w = write(found, data);
      if (!w) return { status: 413, error: "DATA_TOO_LARGE" };
      return { status: 200, success: true, rev: w.rev, prev_rev: w.prevRev };
    },
    upgrade_hero(key, payload) {
      if (!payload || typeof payload.hero_id !== "string" || !payload.hero_id)
        return { status: 400, error: "MISSING_HERO_ID" };
      const base = parseBaseRev(payload);
      if (!base.ok) return { status: 400, error: "BAD_BASE_REV" };
      const found = find(key);
      if (!found) return { status: 404, error: "PROFILE_NOT_FOUND" };
      if (found.corrupt)
        return { status: 500, error: "DATA_CORRUPT", rev: found.rev };
      if (base.value === null && requireRev)
        return { status: 428, ...conflictBody("BASE_REV_REQUIRED", found) };
      if (base.value !== null && base.value !== found.rev)
        return { status: 409, ...conflictBody("REV_CONFLICT", found) };
      const playerData = { ...found.data };
      const heroId = payload.hero_id;
      const config = heroesConfig.filter((c) => c.hero_id === heroId)[0];
      if (!config) return { status: 404, error: "HERO_CONFIG_NOT_FOUND" };
      playerData.heroes = Array.isArray(playerData.heroes)
        ? playerData.heroes.slice()
        : [];
      const heroIndex = playerData.heroes.findIndex(
        (h) => h && h.hero_id === heroId
      );
      const hero =
        heroIndex === -1
          ? {
              hero_id: heroId,
              level: 1,
              star: 0,
              atk: Number(config.base_atk) || 0,
              def: Number(config.base_def) || 0,
              hp: Number(config.base_hp) || 0,
            }
          : { ...playerData.heroes[heroIndex] };
      const level = Number(hero.level) || 1;
      const upgradeCost = (Number(config.upgrade_cost_base) || 100) * level;
      if ((Number(playerData.gold) || 0) < upgradeCost) {
        return {
          status: 400,
          error: "GOLD_NOT_ENOUGH",
          required: upgradeCost,
          current: playerData.gold,
          rev: found.rev,
        };
      }
      playerData.gold = (Number(playerData.gold) || 0) - upgradeCost;
      hero.level = level + 1;
      hero.atk = (Number(hero.atk) || 0) + (Number(config.atk_growth) || 0);
      hero.def = (Number(hero.def) || 0) + (Number(config.def_growth) || 0);
      hero.hp = (Number(hero.hp) || 0) + (Number(config.hp_growth) || 0);
      hero.attack_range =
        (Number(config.attack_range) || 2) +
        (hero.level - 1) * (Number(config.range_growth) || 0);
      hero.attack_speed = Math.max(
        0.1,
        (Number(config.attack_speed) || 1) *
          (1 - (hero.level - 1) * speedGrowthOf(config))
      );
      if (heroIndex === -1) playerData.heroes.push(hero);
      else playerData.heroes[heroIndex] = hero;
      const w = write(found, playerData);
      if (!w) return { status: 413, error: "DATA_TOO_LARGE" };
      return {
        status: 200,
        success: true,
        hero: clone(hero),
        gold_remaining: playerData.gold,
        cost: upgradeCost,
        rev: w.rev,
        prev_rev: w.prevRev,
      };
    },
    save_result(key, payload) {
      if (payload.settle_contract !== SETTLE_CONTRACT)
        return { status: 400, error: "FIXTURE_LEGACY_SETTLE_NOT_MODELED" };
      const requestId =
        typeof payload.request_id === "string" ? payload.request_id : "";
      if (!requestId) return { status: 400, error: "REQUEST_ID_REQUIRED" };
      if (requestId.length > 100)
        return { status: 400, error: "INVALID_REQUEST_ID" };
      const base = parseBaseRev(payload);
      if (!base.ok) return { status: 400, error: "BAD_BASE_REV" };
      if (base.value === null)
        return { status: 428, error: "BASE_REV_REQUIRED" };
      const stageId =
        typeof payload.stage_id === "string" && payload.stage_id.length <= 50
          ? payload.stage_id
          : "";
      const result =
        payload.result === "WIN" || payload.result === "LOSE"
          ? payload.result
          : "";
      if (!stageId || !result) return { status: 400, error: "INVALID_RESULT" };
      const s = settleInput(payload, result);
      if (!s.ok)
        return { status: 400, error: "INVALID_REWARD", field: s.field };
      const lootsJson = JSON.stringify(
        Array.isArray(payload.loots) ? payload.loots : []
      );
      if (lootsJson.length > MAX_CELL_CHARS)
        return { status: 413, error: "DATA_TOO_LARGE" };
      const found = find(key);
      if (!found) return { status: 404, error: "PROFILE_NOT_FOUND" };
      if (found.corrupt)
        return { status: 500, error: "DATA_CORRUPT", rev: found.rev };
      const fp = settleFingerprint(result, stageId, s);
      const prior = found.meta.results.filter((r) => r.id === requestId)[0];
      const settleBody = (entry, extra) => ({
        success: true,
        settle_contract: SETTLE_CONTRACT,
        request_id: requestId,
        log_id: entry.log_id,
        reward: clone(entry.reward),
        after: clone(entry.after),
        ...extra,
      });
      if (prior) {
        const priorRev = revNumber(prior.rev);
        const priorPrev = revNumber(prior.prev_rev);
        if (prior.c !== SETTLE_CONTRACT) {
          return {
            status: 200,
            ...resultBody(
              {
                success: true,
                duplicate: true,
                legacy_result: true,
                log_id: prior.log_id,
              },
              base.value,
              priorRev,
              priorPrev
            ),
          };
        }
        if (prior.fp !== fp)
          return {
            status: 409,
            error: "REQUEST_ID_REUSED",
            request_id: requestId,
          };
        return {
          status: 200,
          ...resultBody(
            settleBody(prior, { duplicate: true }),
            base.value,
            priorRev,
            priorPrev
          ),
        };
      }
      if (base.value <= trimHorizon(found.meta))
        return { status: 409, error: "RESULT_UNKNOWN", request_id: requestId };
      const data = { ...found.data };
      const after = applySettle(data, result, stageId, s);
      const logId = `fixture-log-${++uuid}`;
      const entry = {
        id: requestId,
        log_id: logId,
        rev: found.rev + 1,
        prev_rev: found.rev,
        c: SETTLE_CONTRACT,
        fp,
        reward: { points: s.points, exp: s.exp },
        after,
      };
      const mem = rememberResult(found.meta, entry);
      const w = write(found, data, {
        results: mem.results,
        trimmedRev: mem.trimmedRev,
      });
      if (!w) return { status: 413, error: "DATA_TOO_LARGE" };
      return {
        status: 200,
        ...resultBody(
          settleBody(entry, { logged: true }),
          base.value,
          w.rev,
          w.prevRev
        ),
      };
    },
  };
  const PLAYER = new Set(Object.keys(actions));

  return {
    log,
    /** 處理一個請求（和 doPost 相同的 key 檢查與 action 分派） */
    handle(body) {
      const action = body && body.action;
      const key = body && body.key;
      const payload = body && isObj(body.payload) ? body.payload : {};
      let res;
      if (
        PLAYER.has(action) &&
        (typeof key !== "string" || !key || key.length > 200)
      )
        res = { status: 400, error: "MISSING_KEY" };
      else if (PLAYER.has(action)) res = actions[action](key, payload);
      else if (action === "get_heroes_config")
        res = { status: 200, heroes: clone(heroesConfig) };
      else if (action === "get_enemies_config")
        res = {
          status: 200,
          enemies: clone(enemies),
          columns: enemies.length ? Object.keys(enemies[0]) : [],
        };
      else if (action === "get_all_maps")
        res = { status: 200, maps: clone(maps) };
      else res = { status: 400, error: "UNKNOWN_ACTION" };
      log.push({
        action,
        key,
        payload: clone(payload),
        status: res.status,
        error: res.error ?? null,
      });
      return res;
    },
    /** 放一份存檔（data 原樣；corrupt 時放無法解析的原文）；results 是去重紀錄 */
    seed(
      key,
      data,
      rev = 1,
      { corrupt = false, results = [], trimmedRev = null } = {}
    ) {
      const meta = { rev, results };
      if (trimmedRev !== null) meta.trimmed_rev = trimmedRev;
      players.set(key, {
        cell: corrupt ? "{not json" : JSON.stringify({ ...data, _meta: meta }),
        colRev: rev,
      });
    },
    /** 讀目前的存檔（不含 _meta）與版本；沒有時 null */
    read(key) {
      const f = find(key);
      return f
        ? {
            data: clone(f.data),
            rev: f.rev,
            corrupt: f.corrupt,
            results: clone(f.meta.results),
          }
        : null;
    },
    setRequireBaseRev(v) {
      requireRev = !!v;
    },
  };
}
