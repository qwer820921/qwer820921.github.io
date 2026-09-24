async (page) => {
  // I2（瀏覽器）：出兵間隔中切關、A→B→A、同關重開；以 Godot debug_snapshot 判定
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const KEY = "mock_r2_web";

  // 前置：登入 mock 存檔並進入戰場
  if ((await page.locator('[title="切換關卡"]').count()) === 0) {
    await page.goto(H.BASE + "/shenmaSanguo");
    const input = page.getByPlaceholder("例：eric_sanguo_2026");
    if (await input.isVisible({ timeout: 15000 }).catch(() => false)) {
      await input.fill(KEY);
      await page.getByRole("button", { name: "進入遊戲" }).click();
    }
    await H.waitHud(page);
  }

  const A = "Mock A 慢速出兵", B = "Mock B 對照關";
  const A_INTERVAL = 4.0; // A 關出兵間隔（遊戲秒）
  const waitMidSpawn = async () => {
    const deadline = Date.now() + 300000;
    for (;;) {
      const s = await H.snapshot(page);
      if (s.active_enemies >= 1 && s.spawning_groups >= 1) return s;
      if (Date.now() > deadline) throw new Error("等不到 A 關出兵中");
      await H.sleep(300);
    }
  };
  const judge = (s, stageId) => ({
    stage: s.stage, game_state: s.game_state, wave: s.wave, hp: s.hp,
    enemy_nodes: s.enemy_nodes, active_enemies: s.active_enemies, spawning_groups: s.spawning_groups,
    pass: s.stage === stageId && s.game_state === 1 && s.wave === 0 && s.hp === 20 &&
      Object.keys(s.enemy_nodes).length === 0 && s.active_enemies === 0 && s.spawning_groups === 0,
  });
  const out = {};

  // (1) A 出兵間隔內切到 B
  await H.selectStage(page, A);
  await H.clickButton(page, "迎戰");
  const mid1 = await waitMidSpawn();
  await H.shot(page, "i2-1-a-mid-spawn");
  await H.selectStage(page, B);
  const after1 = await H.waitGameTime(page, A_INTERVAL * 2 + 1);
  out.a_to_b = { beforeSwitch: { stage: mid1.stage, active: mid1.active_enemies, spawning: mid1.spawning_groups, gen: mid1.wave_generation }, waitedGameSec: A_INTERVAL * 2 + 1, after: judge(after1, "chapter1_2"), afterGen: after1.wave_generation, shot: await H.shot(page, "i2-1-b-after-wait") };

  // (2) A → B → A
  await H.selectStage(page, A);
  await H.clickButton(page, "迎戰");
  await waitMidSpawn();
  await H.selectStage(page, B);
  await H.selectStage(page, A);
  const after2 = await H.waitGameTime(page, A_INTERVAL * 2 + 1);
  out.a_b_a = { after: judge(after2, "chapter1_1"), shot: await H.shot(page, "i2-2-a-b-a") };

  // (3) 同關重開：A 出兵中再選一次 A
  await H.clickButton(page, "迎戰");
  await waitMidSpawn();
  await H.selectStage(page, A);
  const after3 = await H.waitGameTime(page, A_INTERVAL * 2 + 1);
  out.same_stage_restart = { after: judge(after3, "chapter1_1"), shot: await H.shot(page, "i2-3-same-stage-restart") };

  run.check("I2-1 A 出兵間隔內切到 B：B 仍備戰、HP 20、沒有 A 的敵人", out.a_to_b.after.pass, out.a_to_b.after);
  run.check("I2-2 A→B→A：A 仍備戰、HP 20、沒有敵人", out.a_b_a.after.pass, out.a_b_a.after);
  run.check("I2-3 同關重開：A 仍備戰、HP 20、沒有敵人", out.same_stage_restart.after.pass, out.same_stage_restart.after);
  return run.finish({ out });
}
