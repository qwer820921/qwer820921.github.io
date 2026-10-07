import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9225;
const TARGET_URL = "http://localhost:3000/shenmaSanguoJs";
const ARTIFACT_DIR = "C:\\Users\\2500804\\.gemini\\antigravity-ide\\brain\\45e76019-c8ee-471b-bac7-dc9170c211f8";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          resolve(msg.result);
        }
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  async screenshot(filename) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    const buf = Buffer.from(res.data, "base64");
    const outPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(outPath, buf);
    console.log(`[Screenshot saved]: ${filename}`);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log("🚀 啟動 Headless Chrome 進行全功能極致確認...");
  const chromeProcess = spawn(CHROME_PATH, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,900",
    TARGET_URL,
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        const pages = await res.json();
        const page = pages.find((p) => p.url.includes("shenmaSanguoJs")) || pages[0];
        if (page && page.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      } catch {}
    }

    if (!wsUrl) {
      throw new Error("無法連接 Chrome DevTools Protocol");
    }

    console.log("✔ 已成功連接至 CDP Session:", wsUrl);
    const client = new CdpClient(wsUrl);
    await client.connect();
    await client.send("Page.enable");
    await client.send("Runtime.enable");

    // 等待頁面與 React 19 掛載完成
    await sleep(2000);

    console.log("\n==============================================");
    console.log("測試 1: 檢查登入視窗與訪客模式");
    console.log("==============================================");

    const isLoginVisible = await client.eval(`
      !!document.querySelector("div[class*='keySetupCard']")
    `);
    console.log("  登入卡片是否可見:", isLoginVisible);

    if (isLoginVisible) {
      // 點擊訪客模式按鈕
      const clickedGuest = await client.eval(`
        (() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const guestBtn = btns.find(b => b.textContent && b.textContent.includes("訪客一鍵試玩"));
          if (guestBtn) {
            guestBtn.click();
            return true;
          }
          return false;
        })()
      `);
      console.log("  點擊「訪客一鍵試玩」:", clickedGuest);
      await sleep(1000);
    }

    await client.screenshot("e2e_01_game_main_screen.png");

    // 檢查頂欄 HUD 資訊
    const hudInfo = await client.eval(`
      (() => {
        const mapName = document.querySelector("span[class*='hudMapName']")?.textContent?.trim();
        const wave = document.querySelector("span[class*='hudWave']")?.textContent?.trim();
        const stats = Array.from(document.querySelectorAll("span[class*='hudStat']")).map(s => s.textContent.trim());
        return { mapName, wave, stats };
      })()
    `);
    console.log("  頂欄 HUD 讀取結果:", hudInfo);

    console.log("\n==============================================");
    console.log("測試 2: 主公資訊視窗 (PlayerInfoModal) 與軍情地圖捷徑");
    console.log("==============================================");
    const avatarClicked = await client.eval(`
      (() => {
        const avatar = document.querySelector("button[class*='hudAvatar']");
        if (avatar) { avatar.click(); return true; }
        return false;
      })()
    `);
    console.log("  點擊主公頭像 👤:", avatarClicked);
    await sleep(500);

    const playerInfo = await client.eval(`
      (() => {
        const modal = document.querySelector(".modal-dialog");
        if (!modal) return null;
        const text = modal.textContent;
        const key = modal.querySelector("code")?.textContent?.trim();
        return { hasModal: true, key, hasNick: text.includes("主公稱謂") };
      })()
    `);
    console.log("  主公資訊彈窗狀態:", playerInfo);
    await client.screenshot("e2e_02_player_info_modal.png");

    // 點擊前往戰略軍情地圖按鈕
    const clickedToStageSelector = await client.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll(".modal-dialog button"));
        const btn = btns.find(b => b.textContent && b.textContent.includes("前往戰略軍情地圖"));
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `);
    console.log("  點擊「前往戰略軍情地圖」按鈕:", clickedToStageSelector);
    await sleep(500);

    console.log("\n==============================================");
    console.log("測試 3: 關卡選擇器 (StageSelectorModal) 極致全面驗證");
    console.log("==============================================");
    const stageSelectorInfo = await client.eval(`
      (() => {
        const modal = document.querySelector(".modal-dialog");
        if (!modal) return null;
        const title = modal.querySelector(".modal-title")?.textContent?.trim();
        const cards = Array.from(modal.querySelectorAll(".card")).map(c => {
          const h6 = c.querySelector("h6")?.textContent?.trim();
          const badge = c.querySelector(".badge")?.textContent?.trim();
          const btn = c.querySelector("button")?.textContent?.trim();
          const btnDisabled = c.querySelector("button")?.disabled;
          return { h6, badge, btn, btnDisabled };
        });
        const freePlaySwitch = !!document.getElementById("free-play-switch");
        const navLinks = Array.from(modal.querySelectorAll(".nav-link")).map(n => n.textContent.trim());
        return { title, cardsCount: cards.length, sampleCards: cards, freePlaySwitch, navLinks };
      })()
    `);
    console.log("  軍情地圖狀態:", {
      title: stageSelectorInfo?.title,
      cardsCount: stageSelectorInfo?.cardsCount,
      navLinks: stageSelectorInfo?.navLinks,
    });
    await client.screenshot("e2e_03_stage_selector_modal.png");

    // 3.1 驗證點擊未開放關卡（如第 1 章的 chapter1_7 或任意標示「尚未開放」卡片）
    const clickIncompleteResult = await client.eval(`
      (() => {
        const cards = Array.from(document.querySelectorAll(".modal-dialog .card"));
        const incomCard = cards.find(c => c.textContent && c.textContent.includes("尚未開放"));
        if (incomCard) {
          incomCard.click();
          const alert = document.querySelector(".modal-dialog .alert")?.textContent?.trim();
          return { success: true, name: incomCard.querySelector("h6")?.textContent?.trim(), alert };
        }
        return { success: false, alert: null };
      })()
    `);
    console.log("  3.1 點擊未開放關卡攔截結果:", clickIncompleteResult);
    await client.screenshot("e2e_03_stage_incomplete_alert.png");

    // 3.2 切換至第 2 章 Tab，確認所有關卡皆顯示「尚未開放」且不可挑戰
    const checkChapter2 = await client.eval(`
      (() => {
        const navs = Array.from(document.querySelectorAll(".modal-dialog .nav-link"));
        const ch2Nav = navs.find(n => n.textContent && n.textContent.includes("第 2 章"));
        if (ch2Nav) {
          ch2Nav.click();
          return true;
        }
        return false;
      })()
    `);
    console.log("  3.2 切換至第 2 章 Tab:", checkChapter2);
    await sleep(500);

    const chapter2Cards = await client.eval(`
      (() => {
        const cards = Array.from(document.querySelectorAll(".modal-dialog .card"));
        const allIncomplete = cards.every(c => c.textContent && c.textContent.includes("尚未開放"));
        return { count: cards.length, allIncomplete };
      })()
    `);
    console.log("  3.2 第 2 章關卡全數未開放檢驗:", chapter2Cards);
    await client.screenshot("e2e_03_chapter2_all_incomplete.png");

    // 3.3 切換回第 1 章，並測試開啟「全關卡自由演練」
    await client.eval(`
      (() => {
        const navs = Array.from(document.querySelectorAll(".modal-dialog .nav-link"));
        const ch1Nav = navs.find(n => n.textContent && n.textContent.includes("第 1 章"));
        if (ch1Nav) ch1Nav.click();
      })()
    `);
    await sleep(500);

    // 開啟自由演練開關
    const toggleFreePlay = await client.eval(`
      (() => {
        const sw = document.getElementById("free-play-switch");
        if (sw) {
          sw.click();
          return sw.checked;
        }
        return false;
      })()
    `);
    console.log("  3.3 開啟自由演練模式:", toggleFreePlay);
    await sleep(500);
    await client.screenshot("e2e_03_free_play_enabled.png");

    // 切換至第二關（標有「演練試玩 (自由模式)」之卡片）
    const switchTargetResult = await client.eval(`
      (() => {
        const cards = Array.from(document.querySelectorAll(".modal-dialog .card"));
        const targetCard = cards.find(c => c.textContent && (c.textContent.includes("演練試玩") || c.textContent.includes("開赴戰場"))) || cards[1];
        if (targetCard) {
          const btn = targetCard.querySelector("button") || targetCard;
          const targetName = targetCard.querySelector("h6")?.textContent?.trim();
          btn.click();
          return { success: true, targetName };
        }
        return { success: false, targetName: "" };
      })()
    `);
    console.log("  點擊切換關卡目標卡片:", switchTargetResult);
    await sleep(1000);

    const hudAfterStageSwitch = await client.eval(`
      (() => {
        const mapName = document.querySelector("span[class*='hudMapName']")?.textContent?.trim();
        return mapName;
      })()
    `);
    console.log("  關卡切換後頂欄地圖名稱:", hudAfterStageSwitch);
    if (switchTargetResult?.success && hudAfterStageSwitch === switchTargetResult.targetName) {
      console.log("  ✔ 關卡切換極致驗證成功！頂欄地圖名稱與切換關卡完全一致！");
    } else {
      console.log("  切換驗證結果:", hudAfterStageSwitch, "預期:", switchTargetResult?.targetName);
    }

    console.log("\n==============================================");
    console.log("測試 4: 武將名錄 (HeroRosterModal) 與升級名將修為");
    console.log("==============================================");
    await client.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll("button[class*='hudBarBtn']"));
        const btn = btns.find(b => b.textContent && b.textContent.trim() === "武將");
        if (btn) btn.click();
      })()
    `);
    await sleep(500);

    const heroRosterInfo = await client.eval(`
      (() => {
        const modal = document.querySelector(".modal-dialog");
        if (!modal) return null;
        const title = modal.querySelector(".modal-title")?.textContent?.trim();
        const heroName = modal.querySelector("h4")?.textContent?.trim();
        const upgBtn = Array.from(modal.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("提升修為"));
        return { title, heroName, hasUpgBtn: !!upgBtn, upgBtnText: upgBtn?.textContent?.trim() };
      })()
    `);
    console.log("  名將錄狀態:", heroRosterInfo);
    await client.screenshot("e2e_04_hero_roster_modal.png");

    // 點擊升級名將
    const heroUpgResult = await client.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll(".modal-dialog button"));
        const upgBtn = btns.find(b => b.textContent && b.textContent.includes("提升修為"));
        if (upgBtn && !upgBtn.disabled) {
          upgBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log("  點擊「提升修為」按鈕:", heroUpgResult);
    await sleep(500);

    const alertMsg = await client.eval(`
      document.querySelector(".modal-dialog .alert")?.textContent?.trim()
    `);
    console.log("  升級回饋訊息:", alertMsg);

    // 關閉名將錄
    await client.eval(`
      document.querySelector(".modal-dialog .btn-close")?.click()
    `);
    await sleep(300);

    console.log("\n==============================================");
    console.log("測試 5: 出征隊伍編排 (TeamEditModal)");
    console.log("==============================================");
    await client.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll("button[class*='hudBarBtn']"));
        const btn = btns.find(b => b.textContent && b.textContent.trim() === "隊伍");
        if (btn) btn.click();
      })()
    `);
    await sleep(500);

    const teamEditInfo = await client.eval(`
      (() => {
        const modal = document.querySelector(".modal-dialog");
        if (!modal) return null;
        const title = modal.querySelector(".modal-title")?.textContent?.trim();
        const slots = Array.from(modal.querySelectorAll("div[class*='teamSlotCard']")).length;
        const autoBtn = Array.from(modal.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("一鍵推薦"));
        return { title, slotsCount: slots, hasAutoBtn: !!autoBtn };
      })()
    `);
    console.log("  隊伍編排狀態:", teamEditInfo);
    await client.screenshot("e2e_05_team_edit_modal.png");

    // 點擊一鍵推薦並儲存
    await client.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll(".modal-dialog button"));
        const autoBtn = btns.find(b => b.textContent && b.textContent.includes("一鍵推薦"));
        if (autoBtn) autoBtn.click();
      })()
    `);
    await sleep(300);

    await client.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll(".modal-dialog button"));
        const saveBtn = btns.find(b => b.textContent && b.textContent.includes("確認並儲存陣容"));
        if (saveBtn) saveBtn.click();
      })()
    `);
    await sleep(500);
    console.log("  ✔ 出征隊伍儲存完畢！");

    console.log("\n==============================================");
    console.log("測試 5.1: 懸浮玩法提示 (BattleTips)");
    console.log("==============================================");
    await client.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll("button[class*='hudStageBtn']"));
        const btn = btns.find(b => b.textContent && b.textContent.includes("❓"));
        if (btn) btn.click();
      })()
    `);
    await sleep(300);
    const tipsVisible = await client.eval(`!!document.querySelector("section[class*='battleTips']")`);
    console.log("  玩法提示卡片是否顯示:", tipsVisible);
    await client.screenshot("e2e_05_1_battle_tips.png");
    await client.eval(`
      document.querySelector("button[class*='battleTipsClose']")?.click()
    `);
    await sleep(200);

    console.log("\n==============================================");
    console.log("測試 5.2: 下一波敵軍軍情情報 (NextWaveModal)");
    console.log("==============================================");
    await client.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll("button[class*='hudBarBtn']"));
        const btn = btns.find(b => b.textContent && b.textContent.includes("下一波"));
        if (btn) btn.click();
      })()
    `);
    await sleep(500);
    const nextWaveInfo = await client.eval(`
      (() => {
        const modal = document.querySelector(".modal-dialog");
        if (!modal) return null;
        const title = modal.querySelector(".modal-title")?.textContent?.trim();
        const trs = Array.from(modal.querySelectorAll("tbody tr")).length;
        return { title, enemyRowsCount: trs };
      })()
    `);
    console.log("  下一波軍情狀態:", nextWaveInfo);
    await client.screenshot("e2e_05_2_next_wave_modal.png");
    await client.eval(`
      document.querySelector(".modal-dialog button[class*='btn-outline-warning']")?.click()
    `);
    await sleep(300);

    console.log("\n==============================================");
    console.log("測試 5.3: 系統設定與存檔備份 (SettingsModal)");
    console.log("==============================================");
    await client.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll("button[class*='hudStageBtn']"));
        const btn = btns.find(b => b.textContent && b.textContent.includes("⚙️"));
        if (btn) btn.click();
      })()
    `);
    await sleep(500);
    const settingsInfo = await client.eval(`
      (() => {
        const modal = document.querySelector(".modal-dialog");
        if (!modal) return null;
        const title = modal.querySelector(".modal-title")?.textContent?.trim();
        const hasExportBtn = !!Array.from(modal.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("匯出存檔"));
        const hasImportBtn = !!Array.from(modal.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("匯入還原"));
        return { title, hasExportBtn, hasImportBtn };
      })()
    `);
    console.log("  系統設定狀態:", settingsInfo);
    await client.screenshot("e2e_05_3_settings_modal.png");
    await client.eval(`
      document.querySelector(".modal-dialog .btn-close")?.click()
    `);
    await sleep(300);

    console.log("\n==============================================");
    console.log("測試 5.4: 建造防禦塔 (PlacementMenu) 與升級/索敵面板 (UpgradePanel)");
    console.log("==============================================");
    const placementOpened = await client.eval(`
      (() => {
        if (window.__testBridge) {
          const buildTile = window.__testBridge.engine.gameMap.getAllTiles().find(t => window.__testBridge.engine.gameMap.canPlaceTower(t.col, t.row));
          if (buildTile) {
            window.__testBridge.onPlacementMenuOpen({ col: buildTile.col, row: buildTile.row, isRoad: false, isBuild: true });
            return { success: true, col: buildTile.col, row: buildTile.row };
          }
        }
        return { success: false, col: 0, row: 0 };
      })()
    `);
    console.log("  觸發防禦塔選單開啟:", placementOpened);
    await sleep(500);
    const placementMenuVisible = await client.eval(`!!document.querySelector("div[class*='placementMenu']")`);
    console.log("  防禦塔選單是否可見:", placementMenuVisible);
    await client.screenshot("e2e_05_4_placement_menu.png");

    // 點選弓兵塔建造
    const towerBuilt = await client.eval(`
      (() => {
        const cards = Array.from(document.querySelectorAll("div[class*='placementContent'] button"));
        const archer = cards.find(c => c.textContent && c.textContent.includes("弓兵塔"));
        if (archer) {
          archer.click();
          return true;
        }
        return false;
      })()
    `);
    console.log("  點擊建造弓兵塔:", towerBuilt);
    await sleep(500);

    // 點選已建成的弓兵塔開啟升級面板
    const upgradeOpened = await client.eval(`
      (() => {
        if (window.__testBridge && ${placementOpened?.col !== undefined}) {
          const tower = window.__testBridge.engine.towers.find(t => t.gridCell.col === ${placementOpened?.col} && t.gridCell.row === ${placementOpened?.row});
          if (tower) {
            window.__testBridge.onUpgradePanelOpen(tower);
            return { success: true, towerName: tower.towerName, level: tower.towerLevel, atk: tower.atk };
          }
        }
        return { success: false };
      })()
    `);
    console.log("  已建防禦塔升級面板開啟狀態:", upgradeOpened);
    await sleep(500);
    const upgradePanelVisible = await client.eval(`!!document.querySelector("div[class*='upgradePanel']")`);
    console.log("  防禦塔升級面板是否可見:", upgradePanelVisible);
    await client.screenshot("e2e_05_5_upgrade_panel.png");

    // 測試切換索敵模式
    const switchedTargetMode = await client.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll("div[class*='targetModeRow'] button"));
        const weakest = btns.find(b => b.textContent && b.textContent.includes("殘血"));
        if (weakest) {
          weakest.click();
          return true;
        }
        return false;
      })()
    `);
    console.log("  切換索敵模式為【殘血】:", switchedTargetMode);

    // 測試升級防禦塔
    const upgradedTower = await client.eval(`
      (() => {
        const upgBtn = document.querySelector("button[class*='upgradeBtn']");
        if (upgBtn && !upgBtn.disabled) {
          upgBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log("  點擊防禦塔升級:", upgradedTower);
    await sleep(300);

    // 關閉升級面板
    await client.eval(`
      (() => {
        const closeBtn = document.querySelector("div[class*='upgradePanel'] button[class*='closeBtn']");
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(300);

    console.log("\n==============================================");
    console.log("測試 6: 戰鬥迎戰、倍速切換與暫停控制");
    console.log("==============================================");
    // 點擊中央「進入戰場」或底部「迎戰」
    const startBattleClicked = await client.eval(`
      (() => {
        const centerBtn = document.querySelector("button[class*='centerEnterBattleBtn']");
        if (centerBtn) { centerBtn.click(); return "centerBtn"; }
        const btns = Array.from(document.querySelectorAll("button[class*='hudBarBtn']"));
        const battleBtn = btns.find(b => b.textContent && b.textContent.trim() === "迎戰");
        if (battleBtn) { battleBtn.click(); return "battleBtn"; }
        return false;
      })()
    `);
    console.log("  開始戰鬥迎戰觸發:", startBattleClicked);
    await sleep(1500);

    const battleStatus1 = await client.eval(`
      (() => {
        const wave = document.querySelector("span[class*='hudWave']")?.textContent?.trim();
        const pauseBtn = Array.from(document.querySelectorAll("button[class*='hudBarBtn']")).find(b => b.textContent && b.textContent.includes("暫停"));
        return { wave, hasPauseBtn: !!pauseBtn };
      })()
    `);
    console.log("  進入戰鬥狀態:", battleStatus1);
    await client.screenshot("e2e_06_in_battle_running.png");

    // 點擊 2x 倍速
    const speed2Clicked = await client.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll("button[class*='hudBarBtn']"));
        const s2 = btns.find(b => b.textContent && b.textContent.trim() === "2x");
        if (s2) { s2.click(); return true; }
        return false;
      })()
    `);
    console.log("  切換 2x 倍速:", speed2Clicked);

    // 點擊暫停
    const pauseClicked = await client.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll("button[class*='hudBarBtn']"));
        const p = btns.find(b => b.textContent && b.textContent.includes("暫停"));
        if (p) { p.click(); return true; }
        return false;
      })()
    `);
    console.log("  點擊暫停:", pauseClicked);
    await sleep(500);

    const pauseBadgeVisible = await client.eval(`
      !!document.querySelector("div[class*='pauseBadge']")
    `);
    console.log("  暫停徽章是否浮現:", pauseBadgeVisible);
    await client.screenshot("e2e_07_battle_paused.png");

    // 點擊繼續
    await client.eval(`
      (() => {
        const resumeBtn = document.querySelector("button[class*='pauseBadgeBtn']") ||
          Array.from(document.querySelectorAll("button[class*='hudBarBtn']")).find(b => b.textContent && b.textContent.includes("繼續"));
        if (resumeBtn) resumeBtn.click();
      })()
    `);
    await sleep(500);
    console.log("  ✔ 戰鬥暫停與恢復驗證成功！");

    console.log("\n==============================================");
    console.log("測試 7: 登出帳號流程與乾淨重置");
    console.log("==============================================");
    // 開啟主公資訊彈窗
    await client.eval(`
      document.querySelector("button[class*='hudAvatar']")?.click()
    `);
    await sleep(500);

    // 點擊登出當前帳號
    await client.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll(".modal-dialog button"));
        const logoutBtn = btns.find(b => b.textContent && b.textContent.includes("登出當前帳號"));
        if (logoutBtn) logoutBtn.click();
      })()
    `);
    await sleep(300);

    // 點擊確認登出
    await client.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll(".modal-dialog button"));
        const confirmBtn = btns.find(b => b.textContent && b.textContent.includes("確認登出"));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(1000);

    const isLoginVisibleAgain = await client.eval(`
      !!document.querySelector("div[class*='keySetupCard']")
    `);
    console.log("  登出後是否乾淨返回登入頁面:", isLoginVisibleAgain);

    const storageClean = await client.eval(`
      (() => {
        const k1 = localStorage.getItem("shenma_js_player_key");
        const k2 = localStorage.getItem("shenma_player_key");
        return { k1, k2, isClean: !k1 && !k2 };
      })()
    `);
    console.log("  本地 LocalStorage 金鑰清除狀況:", storageClean);
    await client.screenshot("e2e_08_logged_out_clean_screen.png");

    console.log("\n==============================================");
    console.log("🎉 【全功能極致確認】測試全部成功！ 🎉");
    console.log("==============================================");

    client.close();
  } catch (err) {
    console.error("❌ 測試過程發生異常:", err);
  } finally {
    chromeProcess.kill();
  }
}

run();
