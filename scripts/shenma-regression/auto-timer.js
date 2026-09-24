async (page) => {
  // I2（自動下一波）與 I3（自動模式同步）：以 update_stats.auto_next_wave_pending 命中 1.5 秒等待窗口
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  if ((await page.locator('[title="切換關卡"]').count()) === 0) return { error: "請先完成登入並進入戰場（可先跑 i2-lifecycle.js）" };

  const A = "Mock A 慢速出兵", B = "Mock B 對照關", C = "Mock C 快速自動";
  const DELAY = 1.5;
  const out = {};

  // 開啟自動並等到「清波後、等待自動下一波」的窗口；回傳窗口開始時的 bridge 索引
  const enterAutoWindow = async () => {
    await H.selectStage(page, C);
    const idx = await H.bridgeLen(page);
    await H.clickButton(page, "自動");
    const pending = await H.waitBridge(page, idx, { type: "update_stats", auto_next_wave_pending: true }, 300000);
    return { idx: await H.bridgeLen(page), pending };
  };
  // 窗口開始後，是否在我們的操作之前就已經開出第 2 波（代表沒有命中窗口）
  const wave2Before = async (fromIdx, untilIdx) =>
    (await H.bridgeSince(page, fromIdx)).slice(0, untilIdx - fromIdx).some((m) => m.type === "update_stats" && m.wave >= 2);

  // (a) 等待窗口內切到 B
  {
    const w = await enterAutoWindow();
    const switchIdx = await H.selectStage(page, B);
    const s = await H.waitGameTime(page, DELAY + 2.5);
    out.window_switch_to_b = {
      hitWindow: !(await wave2Before(w.idx, switchIdx)),
      pendingAt: { wave: w.pending.wave, hp: w.pending.hp },
      after: { stage: s.stage, game_state: s.game_state, wave: s.wave, hp: s.hp, auto_mode: s.auto_mode, enemy_nodes: s.enemy_nodes },
      pass: s.stage === "chapter1_2" && s.game_state === 1 && s.wave === 0 && s.hp === 20 && Object.keys(s.enemy_nodes).length === 0,
      shot: await H.shot(page, "auto-a-window-switch-b"),
    };
  }

  // (b) 等待窗口內關閉自動：回到備戰、不偷開下一波，之後可手動迎戰
  {
    const w = await enterAutoWindow();
    const offIdx = await H.bridgeLen(page);
    await H.clickButton(page, "自動");
    const offStats = await H.waitBridge(page, offIdx, { type: "update_stats", auto_mode: false }, 120000);
    const hudOff = await H.hud(page);
    const s = await H.waitGameTime(page, DELAY + 2.5);
    const hudLater = await H.hud(page);
    const manIdx = await H.bridgeLen(page);
    await H.clickButton(page, "迎戰");
    const manual = await H.waitBridge(page, manIdx, { type: "update_stats", wave: 2, game_state: 2 }, 120000);
    out.window_auto_off = {
      hitWindow: !(await wave2Before(w.idx, offIdx)),
      statsAfterOff: { game_state: offStats.game_state, wave: offStats.wave, pending: offStats.auto_next_wave_pending },
      reactAfterOff: { autoActive: hudOff.autoActive, startLabel: hudOff.startLabel, startDisabled: hudOff.startDisabled },
      afterWait: { game_state: s.game_state, wave: s.wave, active_enemies: s.active_enemies, auto_mode: s.auto_mode },
      reactAfterWait: { autoActive: hudLater.autoActive, startDisabled: hudLater.startDisabled },
      manualWave2: { wave: manual.wave, game_state: manual.game_state },
      pass: offStats.game_state === 1 && s.wave === 1 && s.game_state === 1 && s.active_enemies === 0 &&
        hudOff.autoActive === false && hudLater.startDisabled === false && manual.wave === 2,
      shot: await H.shot(page, "auto-b-window-auto-off"),
    };
  }

  // (c) 等待窗口內同關重開
  {
    const w = await enterAutoWindow();
    const restartIdx = await H.selectStage(page, C);
    const s = await H.waitGameTime(page, DELAY + 2.5);
    out.window_same_stage_restart = {
      hitWindow: !(await wave2Before(w.idx, restartIdx)),
      after: { stage: s.stage, game_state: s.game_state, wave: s.wave, hp: s.hp, enemy_nodes: s.enemy_nodes },
      pass: s.stage === "chapter1_3" && s.game_state === 1 && s.wave === 0 && s.hp === 20 && Object.keys(s.enemy_nodes).length === 0,
      shot: await H.shot(page, "auto-c-window-restart"),
    };
  }

  // (d) 多次切換自動：React 按鈕狀態與 Godot 實際模式一致
  {
    await H.selectStage(page, A); // 慢速關：戰鬥期間可反覆切換
    const rounds = [];
    for (let i = 0; i < 6; i++) {
      const idx = await H.bridgeLen(page);
      await H.clickButton(page, "自動");
      const expect = i % 2 === 0; // 第 1 次開、第 2 次關……
      const st = await H.waitBridge(page, idx, { type: "update_stats", auto_mode: expect }, 120000);
      await H.sleep(200);
      const hud = await H.hud(page);
      const snap = await H.snapshot(page);
      rounds.push({ toggle: i + 1, expect, stats: st.auto_mode, react: hud.autoActive, godot: snap.auto_mode, game_state: snap.game_state });
    }
    out.auto_toggle_sync = {
      rounds,
      pass: rounds.every((r) => r.stats === r.expect && r.react === r.expect && r.godot === r.expect),
      shot: await H.shot(page, "auto-d-toggle-sync"),
    };
  }

  // hitWindow=false 代表操作前第 2 波就已開出，沒有真正命中窗口，同樣算失敗
  run.check("自動等待窗口內切到 B：命中窗口且 B 不自動開戰", out.window_switch_to_b.hitWindow && out.window_switch_to_b.pass, out.window_switch_to_b);
  run.check("自動等待窗口內關閉自動：命中窗口、回備戰不偷開下一波、可手動迎戰", out.window_auto_off.hitWindow && out.window_auto_off.pass, out.window_auto_off);
  run.check("自動等待窗口內同關重開：命中窗口且不自動開戰", out.window_same_stage_restart.hitWindow && out.window_same_stage_restart.pass, out.window_same_stage_restart);
  run.check("多次切換自動：React、update_stats、Godot 三方一致", out.auto_toggle_sync.pass, out.auto_toggle_sync.rounds);
  return run.finish({ out });
}
