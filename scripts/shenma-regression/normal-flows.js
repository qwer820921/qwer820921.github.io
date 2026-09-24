async (page) => {
  // 正常流程：手動兩波勝利（含蓋塔）、自動勝利、落敗；每場只結算一次，計數一致，結算寫回 mock
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  if ((await page.locator('[title="切換關卡"]').count()) === 0) return { error: "請先完成登入並進入戰場（可先跑 i2-lifecycle.js）" };

  const W = "Mock W 勝利兩波", L = "Mock L 失敗關";
  const isResult = (m) => m.type === undefined && typeof m.result === "string";
  const results = async (idx) => (await H.bridgeSince(page, idx)).filter(isResult);
  const confirmAndSync = async () => {
    const before = (await H.gasLog(page)).length;
    await page.getByRole("button", { name: "確認" }).click();
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem("shenma_player_state")).syncStatus === "idle", null, { timeout: 30000 });
    await H.sleep(1000);
    return H.countActions((await H.gasLog(page)).slice(before));
  };
  const out = {};

  // (1) 手動兩波＋兩座弓兵塔 → 勝利
  {
    await H.selectStage(page, W);
    await H.dismissSplash(page);
    await H.placeTower(page, 4, 4);
    await H.placeTower(page, 8, 6);
    const idx = await H.bridgeLen(page);
    await H.clickButton(page, "迎戰");
    await H.waitBridge(page, idx, { type: "update_stats", wave: 1, game_state: 1 }, 600000); // 第 1 波清空回備戰
    const prep = await H.hud(page);
    await H.clickButton(page, "迎戰");
    await page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout: 600000, polling: 500 });
    await H.sleep(3000); // 觀察是否有重複結算
    const res = await results(idx);
    const snap = await H.snapshot(page);
    const shot = await H.shot(page, "normal-1-manual-win");
    out.manual_two_waves_win = {
      afterWave1: { wave: prep.wave, startLabel: prep.startLabel, startDisabled: prep.startDisabled },
      resultMessages: res.length,
      result: res[0] && { result: res[0].result, stars: res[0].stars_earned, kills: res[0].kills, loots: res[0].loots },
      godot: { kills: snap.kills, hp: snap.hp, leaked: 20 - snap.hp },
      countsConsistent: snap.kills + (20 - snap.hp) === 6 && res[0] && res[0].kills === snap.kills,
      gasOnConfirm: await confirmAndSync(),
      shot,
    };
    out.manual_two_waves_win.pass = res.length === 1 && res[0].result === "WIN" && out.manual_two_waves_win.countsConsistent &&
      out.manual_two_waves_win.gasOnConfirm.save_result === 1 && out.manual_two_waves_win.gasOnConfirm.save_profile === 1;
    const reset = await H.hud(page);
    out.restart_after_confirm = { hud: { map: reset.map, wave: reset.wave }, pass: reset.map === W && reset.wave === "0/2" };
  }

  // (2) 同關自動兩波 → 勝利（無防禦，漏怪扣血）
  {
    const idx = await H.bridgeLen(page);
    await H.clickButton(page, "自動");
    await page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout: 600000, polling: 500 });
    await H.sleep(3000);
    const res = await results(idx);
    const snap = await H.snapshot(page);
    const shot = await H.shot(page, "normal-2-auto-win");
    out.auto_two_waves = {
      resultMessages: res.length,
      result: res[0] && { result: res[0].result, stars: res[0].stars_earned, kills: res[0].kills },
      godot: { wave: snap.wave, kills: snap.kills, hp: snap.hp },
      countsConsistent: snap.kills + (20 - snap.hp) === 6,
      gasOnConfirm: await confirmAndSync(),
      shot,
    };
    out.auto_two_waves.pass = res.length === 1 && res[0].result === "WIN" && snap.wave === 2 && out.auto_two_waves.countsConsistent;
  }

  // (3) 落敗
  {
    await H.selectStage(page, L);
    const idx = await H.bridgeLen(page);
    await H.clickButton(page, "迎戰");
    await page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout: 600000, polling: 500 });
    await H.sleep(3000);
    const res = await results(idx);
    const snap = await H.snapshot(page);
    const shot = await H.shot(page, "normal-3-lose");
    out.lose = {
      resultMessages: res.length,
      result: res[0] && { result: res[0].result, stars: res[0].stars_earned, loots: res[0].loots },
      godot: { hp: snap.hp, game_state: snap.game_state },
      gasOnConfirm: await confirmAndSync(),
      shot,
    };
    out.lose.pass = res.length === 1 && res[0].result === "LOSE" && snap.hp === 0;
  }

  run.check("手動兩波＋蓋塔：勝利只結算 1 次、擊殺＋漏怪＝6、結算寫回 mock", out.manual_two_waves_win.pass, out.manual_two_waves_win);
  run.check("確認結算後同關重置為 0/2", out.restart_after_confirm.pass, out.restart_after_confirm.hud);
  run.check("自動兩波：勝利只結算 1 次、擊殺＋漏怪＝6", out.auto_two_waves.pass, out.auto_two_waves);
  run.check("落敗：只結算 1 次、HP 0", out.lose.pass, out.lose);
  return run.finish({ out });
}
