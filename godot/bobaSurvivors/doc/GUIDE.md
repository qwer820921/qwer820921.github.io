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

## 🛡️ 程式碼維護 (Code Maintenance)

- **怪物擴充**: 在 `Main.gd` 的 `boss_registry` 加入新的字典資料即可新增 Boss。
- **UI 調整**: 若修改了 `StatsDashboard.tscn` 的層級結構，務必同步更新 `StatsDashboard.gd` 中的 `@onready` 路徑。
- **物體碰撞**: 子彈對敵人使用 `Area2D` 偵測，玩家與敵人則主要透過群組（"player", "main"）進行通訊，避免硬編碼路徑。

---

_子yee 萬事屋 - 高品質開發範本_
