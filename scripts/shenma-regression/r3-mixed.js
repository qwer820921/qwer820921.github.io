async (page) => {
  // R3（瀏覽器）：混合敵人組不可提前結算；整波無效必須拒絕開戰且不給獎勵；拒絕後切到有效關卡可恢復
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  if ((await page.locator('[title="切換關卡"]').count()) === 0) return { error: "請先完成登入並進入戰場（可先跑 i2-lifecycle.js）" };
  // 預期內的 console error（Godot Web 版的 push_error 與 push_warning 都走 console.error）：
  //   - 拒絕開戰的錯誤；本腳本刻意放入的無效敵人組被略過時的警告
  //   - 上述訊息附帶的呼叫位置行（單獨出現時不會掩蓋其他錯誤的主訊息行）
  const REJECT = /拒絕開始第 \d+ 波/;
  const run = H.begin({
    expectedConsole: [
      REJECT,
      /^WARNING: \[WaveManager\] (找不到敵人設定 ID: 'mock_missing_config'|敵人組 'mock_b_grunt' 數量為 0)，跳過此組$/,
      /^\s*at: push_(warning|error) \(core\/variant\/variant_utility\.cpp:\d+\)$/,
      /^\s*GDScript backtrace/,
      /^\s*\[\d+\] \w+ \(res:\/\/[\w/]+\.gd:\d+\)$/,
    ],
  });
  const M = "Mock M 混合組", E = "Mock E 無效波", B = "Mock B 對照關";
  const isResult = (m) => m.type === undefined && typeof m.result === "string";
  const out = {};

  // (1) 混合組：缺設定的組排在 3 隻 B 步兵前面
  {
    await H.selectStage(page, M);
    const idx = await H.bridgeLen(page);
    await H.clickButton(page, "迎戰");
    const early = await H.waitGameTime(page, 1.5);
    const earlyResults = (await H.bridgeSince(page, idx)).filter(isResult).length;
    const shotEarly = await H.shot(page, "r3-1-mixed-early");
    await page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout: 600000, polling: 500 });
    await H.sleep(3000); // 觀察是否有重複結算
    const msgs = await H.bridgeSince(page, idx);
    const results = msgs.filter(isResult);
    const firstResultAt = msgs.findIndex(isResult);
    const statsBeforeResult = msgs.slice(0, firstResultAt).filter((m) => m.type === "update_stats").pop();
    const snap = await H.snapshot(page);
    out.mixed = {
      early: { game_state: early.game_state, wave: early.wave, hp: early.hp, active: early.active_enemies, spawning: early.spawning_groups, results: earlyResults },
      resultMessages: results.length,
      result: results[0] && { result: results[0].result, kills: results[0].kills, stars: results[0].stars_earned },
      statsRightBeforeResult: statsBeforeResult && { hp: statsBeforeResult.hp, wave: statsBeforeResult.wave },
      final: { hp: snap.hp, kills: snap.kills, game_state: snap.game_state },
      shots: [shotEarly, await H.shot(page, "r3-1-mixed-result")],
    };
    run.check("R3 混合組：開戰 1.5 秒後仍在戰鬥、尚未結算", early.game_state === 2 && earlyResults === 0 && early.active_enemies + early.spawning_groups > 0, out.mixed.early);
    run.check("R3 混合組：只結算 1 次且為勝利", results.length === 1 && results[0].result === "WIN", out.mixed.result);
    run.check("R3 混合組：結算前 3 隻有效敵人都已處理（擊殺＋漏怪＝3）",
      statsBeforeResult && statsBeforeResult.hp === 17 && snap.kills + (20 - snap.hp) === 3, { before: out.mixed.statsRightBeforeResult, final: out.mixed.final });
    await page.getByRole("button", { name: "確認" }).click();
    await H.sleep(1000);
  }

  // (2) 整波無效：按迎戰、按自動都必須被拒絕，不前進波次、不結算
  {
    await H.selectStage(page, E);
    const idx = await H.bridgeLen(page);
    const tStart = Date.now();
    await H.clickButton(page, "迎戰");
    const afterStart = await H.waitGameTime(page, 2.0);
    const hudStart = await H.hud(page);
    await H.clickButton(page, "自動");
    const afterAuto = await H.waitGameTime(page, 2.0);
    const hudAuto = await H.hud(page);
    const results = (await H.bridgeSince(page, idx)).filter(isResult).length;
    const rejectLogs = S.state.console.filter((c) => c.t >= tStart && REJECT.test(c.text)).map((c) => c.text);
    const pick = (s) => ({ game_state: s.game_state, wave: s.wave, hp: s.hp, auto_mode: s.auto_mode, active: s.active_enemies });
    out.invalid_wave = {
      afterStart: pick(afterStart), hudAfterStart: { startLabel: hudStart.startLabel, startDisabled: hudStart.startDisabled, result: hudStart.result },
      afterAuto: pick(afterAuto), hudAfterAuto: { autoActive: hudAuto.autoActive, startLabel: hudAuto.startLabel },
      resultMessages: results, rejectLogs,
      shot: await H.shot(page, "r3-2-invalid-wave-rejected"),
    };
    run.check("R3 無效波：按迎戰被拒絕，仍在備戰、波次 0、沒有結算",
      afterStart.game_state === 1 && afterStart.wave === 0 && hudStart.result === null && hudStart.startLabel === "迎戰", out.invalid_wave.afterStart);
    run.check("R3 無效波：按自動也被拒絕，自動模式關閉且 React 顯示一致",
      afterAuto.game_state === 1 && afterAuto.wave === 0 && afterAuto.auto_mode === false && hudAuto.autoActive === false, out.invalid_wave.afterAuto);
    run.check("R3 無效波：沒有任何結算訊息（不給勝利獎勵）", results === 0, results);
    run.check("R3 無效波：主控台有可辨識的拒絕錯誤（迎戰、自動各一次）", rejectLogs.length >= 2, rejectLogs);
  }

  // (3) 拒絕後切到有效關卡，可以正常打完
  {
    await H.selectStage(page, B);
    const idx = await H.bridgeLen(page);
    await H.clickButton(page, "迎戰");
    await page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout: 600000, polling: 500 });
    await H.sleep(3000);
    const results = (await H.bridgeSince(page, idx)).filter(isResult);
    out.recover = {
      resultMessages: results.length,
      result: results[0] && { result: results[0].result, stage_id: results[0].stage_id },
      shot: await H.shot(page, "r3-3-recover-valid-stage"),
    };
    run.check("R3 拒絕後切到有效關卡：正常結算 1 次", results.length === 1 && results[0].result === "WIN" && results[0].stage_id === "chapter1_2", out.recover.result);
    await page.getByRole("button", { name: "確認" }).click();
    await H.sleep(1000);
  }

  return run.finish({ out });
}
