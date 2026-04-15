# 🛠️ 開發與維護指南 (Dev & Maintenance)

## 🔠 字體設置 (Traditional Chinese Fix)

為解決 Web 版豆腐塊問題，必須確保：

- 字體檔案位於 `res://fonts/font.ttf`。
- `project.godot` 中的 `gui/theme/custom_font` 被正確指向該路徑。
- 專案 Theme 建議掛載在 `Main` 節點或使用全域覆蓋。

## 🎨 素材管理 (Assets)

- **圖標資源**:
  - 統一存放於 `res://gfx/`。
  - `StatsDashboard.tscn` 使用 `TextureRect` 動態加載。
  - 檔案名規則：`xxx_icon.webp`。
- **背景貼圖**:
  - 地板資源建議使用 **無縫 (Seamless)** 紋理。
  - 強烈建議使用 `.webp` 格式以平衡畫質與加載速度（特別是 Web 端）。

## 🚀 Web/Export 兼容性指南

為確保 Web 匯出內容與本地執行一致，開發時請務必遵循：

- **資源偵測**：禁止使用 `FileAccess.file_exists()` 來判斷 pck 包內的資源。請改用 `ResourceLoader.exists("res://path/to/asset.webp")`。
- **路徑敏感度**：Web 版對路徑大小寫極度敏感，請確保代碼中的路徑與實體檔案完全吻合。
- **UI 渲染**：避免使用 Emoji 作為 UI 文字，請改用圖標素材，否則 Web 端會出現「豆腐塊」亂碼。

## 🛡️ 程式碼維護 (Code Maintenance)

- **人物比例**: `Player.gd` 中設定 `scale = Vector2(2.25, 2.25)` 以適配廣角視野 (Zoom 0.5) 並提升手機端視覺壓迫力。
- **UI 調整**: `StatsDashboard.gd` 包含一個 `%SkillBox` (HBoxContainer) 用於動態渲染玩家當前獲得的所有技能圖標。
- **怪物擴充**: 在 `Main.gd` 的 `boss_registry` 加入新的字典資料即可新增 Boss。
- **物體碰撞**: 子彈對敵人使用 `Area2D` 偵測，玩家與敵人則主要透過群組（"player", "main"）進行通訊，避免硬編碼路徑。

---

_子yee 萬事屋 - 高品質開發範本_
