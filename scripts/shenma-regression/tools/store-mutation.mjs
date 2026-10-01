// 玩家存檔 store 的反向驗證（戰鬥結算的完整獎勵）：把 store/playerStore.ts 複製到暫存目錄、套用一個刻意的錯誤，
// 用 PLAYER_STORE_SRC 讓 web/player-store.test.mjs 改用那個檔案，確認對應的測試「該失敗時一定失敗」。
// 用法：node scripts/shenma-regression/tools/store-mutation.mjs [變異名稱|all|none|list]（預設 all）
// - none：不改程式，store 測試必須全部通過（確認基準）
// - 其他：預期的測試項目必須 FAIL，否則結束碼 1（測試抓不到這個錯誤）
// 不寫入倉庫
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const STORE = join(ROOT, "src/app/(games)/shenmaSanguo/store/playerStore.ts");
const TEST = join(ROOT, "scripts/shenma-regression/web/player-store.test.mjs");

// 每個變異：原文（必須剛好出現一次）→ 改成的內容，可以有多組；預期會 FAIL 的測試（名稱開頭）
const MUTATIONS = {
  "only-progress": {
    why: "結算不要求完整獎勵（後端只記進度，點數與經驗要靠之後的整份保存）",
    edits: [
      [
        "res = await gameApi.saveResult(key, head.record, head.id, base, true);",
        "res = await gameApi.saveResult(key, head.record, head.id, base, false);",
      ],
    ],
    expect: ["結算-1 ", "結算-2 ", "結算-4 "],
  },
  "save-while-pending": {
    why: "結算還沒確認時照樣送整份保存（整份保存先把獎勵寫進雲端，結算又再加一次）",
    edits: [
      [
        "      if (pendingOf(player).length > 0) {\n        if (writesHeld()) return Promise.resolve(heldSave());",
        "      if (pendingOf(player).length > 0 && false) {\n        if (writesHeld()) return Promise.resolve(heldSave());",
      ],
      [
        "      void get()._syncNow();\n      return { ok: true };",
        "      void runSettleQueue();\n      void get()._syncNow();\n      return { ok: true };",
      ],
    ],
    // 一般情況下保存本來就會等在途的結算；重複發獎出現在結果不明（回應遺失、重新整理）時
    expect: ["結算-4 ", "結算-5 ", "結算-6 "],
  },
  "double-exp": {
    why: "確認時把後端的經驗再加到本機一次（double exp）",
    edits: [
      [
        "      ...(onlyThis ? { syncedRev: head.local_rev } : {}),\n    });",
        "      ...(onlyThis ? { syncedRev: head.local_rev } : {}),\n      exp: cur.exp + head.reward.exp,\n    });",
      ],
    ],
    expect: ["結算-2 ", "結算-3 "],
  },
  "adopt-latest-rev": {
    why: "版本不符（base_mismatch）時也把寫入後的版本當成本機的版本基準（舊快照可以覆寫其他分頁的修改）",
    edits: [
      [
        '    const alone = onlyThis && revOf(cur) === head.local_rev;\n    const rev = revField(res, "rev");\n    const chained =\n      rev !== null &&\n      revField(res, "prev_rev") === base &&\n      serverRevOf(cur) === base;',
        '    const alone = onlyThis && revOf(cur) === head.local_rev;\n    const rev = revField(res, "rev") ?? (revField(res, "prev_rev") ?? 0) + 1;\n    const chained = serverRevOf(cur) === base;',
      ],
    ],
    expect: ["結算-8 ", "結算-8b "],
  },
  "new-id-on-retry": {
    why: "重新確認時換一個新的 request_id（伺服器當成另一場，重複發獎）",
    edits: [
      [
        "res = await gameApi.saveResult(key, head.record, head.id, base, true);",
        'res = await gameApi.saveResult(key, head.record, head.state === "unknown" ? head.id + "-retry" : head.id, base, true);',
      ],
    ],
    expect: ["結算-4 ", "結算-6 "],
  },
  "no-session-record": {
    why: "待確認的結算不留在 session（重新整理後不知道它還沒確認，用整份保存再寫一次獎勵）",
    edits: [
      [
        "function readPendingSettles(raw: unknown): PendingSettle[] {\n",
        "function readPendingSettles(raw: unknown): PendingSettle[] {\n  if (raw !== 1) return [];\n",
      ],
    ],
    expect: ["結算-6 "],
  },
  "no-validation": {
    why: "Godot 的結算不驗證星數與點數",
    edits: [
      [
        '      if (!record || !reward) return { ok: false, error: "INVALID_RESULT" };\n',
        "      if (!record || !reward) return { ok: true };\n",
      ],
    ],
    expect: ["結算-18 "],
  },
  "create-when-stale": {
    why: "讀取回報找不到存檔時不確認這次載入是否已經過期（換了帳號之後仍替舊帳號建檔）",
    edits: [
      [
        '  if (!active()) return { ok: false, error: "SUPERSEDED" };\n  if (writesHeld()) return { ok: false, error: "MIGRATION_HOLD" };',
        '  if (writesHeld()) return { ok: false, error: "MIGRATION_HOLD" };',
      ],
    ],
    expect: ["過期建檔-1 ", "過期建檔-5 ", "過期建檔-6 "],
  },
  "reread-when-stale": {
    why: "建檔回來時不確認是否已經過期（換了帳號之後仍開始讀取舊帳號）",
    edits: [
      [
        '  }\n  // 建檔期間過期：已送出的建檔照常完成，但不再讀取（之後登入這個帳號時會讀到）\n  if (!active()) return { ok: false, error: "SUPERSEDED" };\n',
        "  }\n",
      ],
    ],
    expect: ["過期建檔-2 "],
  },
  "stale-wait-notice": {
    why: "改登入另一個帳號時不拿掉舊讀取的等待說明（目前帳號保存期間仍顯示舊讀取回應較慢）",
    edits: [["      dropStaleReadWaits();\n", ""]],
    expect: ["過期建檔-8 "],
  },
};

const run = (src) => {
  const r = spawnSync(process.execPath, [TEST], {
    encoding: "utf8",
    env: { ...process.env, ...(src ? { PLAYER_STORE_SRC: src } : {}) },
    maxBuffer: 64 * 1024 * 1024,
  });
  const failed = (r.stdout.match(/^FAIL {2}.*$/gm) || []).map((l) =>
    l.slice(6)
  );
  const json = (r.stdout.match(/^RESULT_JSON (.*)$/m) || [])[1];
  return { code: r.status, failed, total: json ? JSON.parse(json).total : 0 };
};

const arg = process.argv[2] || "all";
if (arg === "list") {
  for (const [k, m] of Object.entries(MUTATIONS)) console.log(`${k}  ${m.why}`);
  process.exit(0);
}
if (arg === "none") {
  const r = run(null);
  console.log(`基準：${r.total} 項，失敗 ${r.failed.length} 項`);
  process.exit(r.code === 0 && r.failed.length === 0 ? 0 : 1);
}
const names = arg === "all" ? Object.keys(MUTATIONS) : [arg];
// 工作區可能是 CRLF（core.autocrlf）：比對與寫出都用 LF
const orig = readFileSync(STORE, "utf8");
const base = orig.replace(/\r\n/g, "\n");
const dir = mkdtempSync(join(tmpdir(), "store-mutation-"));
let missed = 0;
for (const name of names) {
  const m = MUTATIONS[name];
  if (!m) {
    console.log(`不認得的變異：${name}（用 list 列出）`);
    process.exit(2);
  }
  let src = base;
  let bad = "";
  for (const [from, to] of m.edits) {
    const n = src.split(from).length - 1;
    if (n !== 1) bad = `原文出現 ${n} 次：${from.slice(0, 60)}`;
    else src = src.replace(from, to);
  }
  if (bad) {
    console.log(`ERROR  ${name}  ${bad}`);
    missed++;
    continue;
  }
  const file = join(dir, `${name}.ts`);
  writeFileSync(file, src);
  const r = run(file);
  const caught = m.expect.filter((e) => r.failed.some((f) => f.startsWith(e)));
  const ok = caught.length === m.expect.length;
  if (!ok) missed++;
  console.log(
    `${ok ? "CAUGHT" : "MISSED"}  ${name}（${m.why}）  預期失敗：${m.expect.join("、")}  實際失敗 ${r.failed.length} 項：${r.failed
      .map((f) => f.split(" ")[0])
      .join("、")}`
  );
}
const unchanged = readFileSync(STORE, "utf8") === orig;
console.log(`原檔未改：${unchanged}`);
console.log(
  "RESULT_JSON " +
    JSON.stringify({
      total: names.length,
      caught: names.length - missed,
      originalUnchanged: unchanged,
    })
);
process.exit(missed || !unchanged ? 1 : 0);
