# 裁減後的 Godot 4.6.2 網頁模板

神馬三國的交付產物（`public/games/shenmaSanguo/`）用裁減過的 Godot 4.6.2 網頁模板（web nothreads、template_debug）匯出：拿掉 3D、XR、3D／2D 導航、進階 GUI 編輯元件與用不到的模組，引擎（index.wasm）約小三分之一。中文字型與文字、GUI、2D 物理、Ogg Vorbis、WebGL2、GDScript 都保留。

`manifest.json` 是這個模板的完整紀錄：原始碼（tag、下載網址、tar.gz 的 sha256）、工具版本（emsdk、SCons）、全部 SCons 參數、Windows 上需要的兩個本機修補，以及**釘選的模板 sha256**。模板 zip、Godot 原始碼與 emsdk 放在倉庫外的工具目錄，不進版控。

## 匯出時

`godot-check.sh` 一律用釘選的模板：`WEB_TEMPLATE_DEBUG` 必須指向 sha256 和 `manifest.json` 相同的 zip，沒有設定或內容不同時直接拒絕（結束碼 2），不會靜默改用官方模板產生交付產物。

```bash
GODOT=<Godot 4.6.2 console> WEB_TEMPLATE_DEBUG=<工具目錄>/web-templates/shenma-4.6.2-trim-web_nothreads_debug-63482ed9b6b2.zip \
  bash scripts/shenma-regression/godot-check.sh <新的暫存目錄>
```

## 重建模板

平常不需要重建（建置約 7 分鐘，每次都用已驗證的 zip）。要重建時：

1. 工具目錄放 emsdk：照 `manifest.tools.emsdk` 的 commit 取得 emsdk，`emsdk install 4.0.11`、`emsdk activate 4.0.11`；SCons 用 emsdk 內附的 Python 以 pip 安裝 `manifest.tools.scons` 的版本。
2. 執行 `node scripts/shenma-regression/web-template/build-web-template.mjs <工具目錄>`：
   - 沒有原始碼時下載 `manifest.source.url`，tar.gz 的 sha256 必須相同才解開
   - 套用 `manifest.windowsPatches`（已套用就略過；找不到原文就失敗）：`platform/web/SCsub` 的 closure externs 路徑改正斜線、emsdk 的 `google-closure-compiler` 入口改成 node 可以執行的檔案（原檔備份 `.sh-orig`）
   - 執行 SCons（`manifest.scons` 的參數），把 zip 以 sha256 前 12 碼命名複製到 `<工具目錄>/web-templates/`
   - `--check` 只檢查工具目錄與修補，不建置
3. 重建的 zip 通常不會和釘選的逐位元組相同：要重新匯出並跑 Godot 完整回歸、瀏覽器回歸與載入量測，確認後才更新 `manifest.json` 的 `template`（同時記錄 wasm 的大小與 sha256）。
