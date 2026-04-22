# 格子個別貼圖功能 — 實作計劃

> 建立日期：2026-04-22

---

## 功能目標

讓每一格地圖格子可以獨立設定貼圖，不受格子類型（路徑 / 防禦區 / 障礙物）限制。

---

## 設計原則：型別與貼圖完全分離

| 屬性 | 用途 | 誰決定 |
|------|------|--------|
| `type` (ROAD / BUILD / OBSTACLE...) | Gameplay 邏輯（可不可以走、可不可以放塔） | 不變 |
| `texture` | 視覺呈現（顯示哪張圖片） | 完全獨立，不綁定 type |

**移除的概念**：`tile_textures`（按類型決定貼圖的繼承規則）從 JSON 完全移除。  
每格貼圖一律存於 `cell_textures`，無繼承、無 fallback 鏈，沒有兩套規則。

---

## JSON 格式

### 移除 `tile_textures`，新增 `background_texture` 與 `cell_textures`

```json
{
  "cols": 14,
  "rows": 11,
  "paths": { "path_a": [[0,2], [1,2], "..."] },
  "base": [13, 9],
  "build_zones": [[2,0], "..."],
  "obstacles": [[0,0], "..."],

  "background_texture": "tile_empty.webp",

  "cell_textures": {
    "0,0":  "tile_dirt.webp",
    "1,0":  "tile_dirt.webp",
    "2,0":  "tile_grass.webp",
    "3,2":  "tile_stone.webp",
    "...":  "..."
  }
}
```

### 欄位說明

| 欄位 | 用途 | 備註 |
|------|------|------|
| `background_texture` | GameMap.gd 用於鋪滿 viewport 外圍（格子以外的區域） | 單一字串，非物件 |
| `cell_textures` | 每一格的貼圖，涵蓋地圖所有格子（14×11 = 154 格） | key: `"col,row"` |
| ~~`tile_textures`~~ | ~~按類型決定貼圖~~ | **完全移除** |

`tile_textures` 僅作為**編輯器內部畫筆預設值**（`textures` useState），不序列化進 JSON，不進入 Godot。

### GAS / Sheets 無需異動

`cell_textures` 是 `path_json` 內部結構的一部分，GAS 視整個 `path_json` 為不透明的 JSON 字串直接存取，不感知內部欄位變化。

---

## 調整範圍

### 1. `src/app/(tools)/mapEditor/types/index.ts`

**異動量：約 6 行**

#### GridCell — 新增 `texture` 欄位

```ts
export interface GridCell {
  type: CellType;
  pathId?: string;
  waypointIndex?: number;
  texture: string;        // ← 新增，每格明確存貼圖名稱，非 optional
}
```

`texture` 不設為 optional，每格建立時就帶預設值，避免渲染端需要 null 判斷。

#### MapJson — 移除 `tile_textures`，新增兩個欄位

```ts
export interface MapJson {
  map_id: string;
  name: string;
  chapter: number;
  unlock_stage?: string;
  cols: number;
  rows: number;
  paths: Record<string, number[][]>;
  waypoints?: number[][];
  spawn?: number[];
  base: number[];
  build_zones: number[][];
  obstacles: number[][];
  background_texture?: string;              // ← 新增
  cell_textures?: Record<string, string>;   // ← 新增，key: "col,row"
  tile_textures?: TileTextures;             // ← 改為 optional（向後相容舊格式匯入用）
}
```

`tile_textures` 改為 optional 是為了讓舊格式 JSON 匯入時不報錯，新地圖輸出不包含此欄位。

---

### 2. `src/app/(tools)/mapEditor/components/mapTab.tsx`

**異動量：約 80 行（修改既有，無大規模重構）**

#### 2-a. Tool 型別新增 `"texture"`

```ts
// 第 15 行附近
type Tool = "waypoint" | "build" | "obstacle" | "erase" | "texture";
```

#### 2-b. `makeGrid()` — 格子建立時帶入預設貼圖

```ts
function makeGrid(cols: number, rows: number, defaultTex = "tile_empty.webp"): GridCell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      type: "empty" as CellType,
      texture: defaultTex,
    }))
  );
}
```

#### 2-c. State 新增貼圖工具用的選取狀態

```ts
// 第 174 行附近的 useState 區塊加入：
const [activeCellTexture, setActiveCellTexture] = useState("tile_grass.webp");
```

`textures`（TileTextures）state 保持不變，繼續作為畫筆預設值，但**不再序列化進 JSON**。

#### 2-d. `applyCell()` — 各工具塗色時同步寫入 texture

在每個 tool 分支中，塗完格子類型後順帶寫入對應的預設貼圖：

```ts
if (tool === "build") {
  if (cell.type === "road") return prev;
  next[row][col] = { type: "build", texture: textures.build };
  return next;
}
if (tool === "obstacle") {
  if (cell.type === "road") return prev;
  next[row][col] = { type: "obstacle", texture: textures.obstacle };
  return next;
}
if (tool === "erase") {
  next[row][col] = { type: "empty", texture: textures.empty };
  // ... 路徑清除邏輯不變
}
if (tool === "texture") {
  // 只改貼圖，不動 type
  next[row][col] = { ...cell, texture: activeCellTexture };
  return next;
}
```

waypoint 工具的 `setGrid` 內也補上 texture：

```ts
g2[row][col] = {
  type: "road",
  waypointIndex: newPath.length - 1,
  pathId: activePathId,
  texture: textures.road,  // ← 新增
};
```

#### 2-e. `getCellTexture()` — 直接取 `cell.texture`

原本依 type 判斷，改成直接讀 `cell.texture`：

```ts
function getCellTexture(cell: GridCell): string {
  return cell.texture;
}
```

調用處同步簡化，移除 `paths` 和 `textures` 參數傳入。

#### 2-f. 工具列 — 新增「🎨 格子貼圖」按鈕與貼圖選取列

在工具列現有按鈕（🚩 / 🟩 / ⬛ / 🧹）後面新增：

```tsx
{ id: "texture", label: "🎨 格子貼圖" }
```

選中 `texture` 工具時，在工具列下方顯示貼圖選取列（複用現有 `TextureSelector` 元件）：

```tsx
{tool === "texture" && (
  <div className={styles.cellTextureBar}>
    <span className={styles.toolLabel}>選擇貼圖：</span>
    {imageOptions.map((img) => (
      <button
        key={img}
        className={`${styles.textureOption} ${activeCellTexture === img ? styles.textureOptionSelected : ""}`}
        onClick={() => setActiveCellTexture(img)}
        title={img}
        type="button"
      >
        <Image
          src={`/images/shenmaSanguo/${img}`}
          alt={img}
          width={26}
          height={26}
          style={{ imageRendering: "pixelated", objectFit: "cover" }}
          unoptimized
        />
      </button>
    ))}
  </div>
)}
```

#### 2-g. 格子渲染 — 直接使用 `cell.texture`

```tsx
// 第 866 行附近
style={{
  backgroundImage: `url(/images/shenmaSanguo/${cell.texture})`,
  // ... 其餘不變
}}
```

#### 2-h. `buildMapJson()` — 輸出 `cell_textures` 與 `background_texture`，移除 `tile_textures`

```ts
const cellTextures: Record<string, string> = {};
grid.forEach((rowArr, rowIdx) =>
  rowArr.forEach((cell, colIdx) => {
    cellTextures[`${colIdx},${rowIdx}`] = cell.texture;
  })
);

return {
  map_id: mapId,
  name: mapName,
  chapter: parseInt(chapter) || 1,
  unlock_stage: unlockStage,
  cols,
  rows,
  paths: cleanPaths,
  waypoints: legacyWaypoints,
  spawn,
  base,
  build_zones: buildZones,
  obstacles,
  background_texture: textures.empty,   // ← 新增，取自 palette 的 empty 預設
  cell_textures: cellTextures,           // ← 新增
  // tile_textures 移除，不序列化
};
```

#### 2-i. `loadFromJson()` — 解析 `cell_textures`，相容舊格式

```ts
// 新格式：直接從 cell_textures 回填各格 texture
if (json.cell_textures) {
  Object.entries(json.cell_textures).forEach(([key, tex]) => {
    const [col, row] = key.split(",").map(Number);
    if (finalGrid[row]?.[col]) {
      finalGrid[row][col].texture = tex as string;
    }
  });
} else {
  // 舊格式相容：tile_textures 存在則依 type 推算，否則用 DEFAULT_TEXTURES
  const tx = json.tile_textures ?? DEFAULT_TEXTURES;
  finalGrid.forEach((rowArr, rowIdx) =>
    rowArr.forEach((cell, colIdx) => {
      cell.texture = deriveTextureFromType(cell, paths, colIdx, rowIdx, tx);
    })
  );
}
```

`deriveTextureFromType` 是從原 `getCellTexture()` 提取的舊邏輯，僅用於相容舊格式匯入，之後可視情況刪除。

---

### 3. `godot/shenmaSanguo/map/GameMap.gd`

**異動量：約 35 行**

#### 3-a. 新增 `_cell_textures` 與 `_bg_texture` 變數，移除舊的型別貼圖邏輯

```gdscript
# 移除：var _tile_textures: Dictionary = {}
# 新增：
var _cell_textures: Dictionary = {}   # Vector2i → Texture2D
var _bg_texture: Texture2D = null     # viewport 外圍背景
```

`_DEFAULT_TILE_TEXTURES` 常數與 `_load_tile_textures()`、`_tile_type_name()` 方法一併移除。

#### 3-b. `setup()` — 改呼叫新方法

```gdscript
func setup(path_json: Dictionary) -> void:
    _parse_path_json(path_json)
    _compute_map_size()
    _compute_tile_size()
    _center_map()
    _load_textures(path_json)   # 取代原本的 _load_tile_textures()
    queue_redraw()
    map_ready.emit()
```

#### 3-c. 新增 `_load_textures()` 方法

```gdscript
func _load_textures(pj: Dictionary) -> void:
    _cell_textures.clear()

    # 背景貼圖
    var bg_name: String = str(pj.get("background_texture", "tile_empty.webp"))
    var bg_path: String = "res://assets/" + bg_name
    if ResourceLoader.exists(bg_path):
        _bg_texture = load(bg_path) as Texture2D

    # 每格貼圖
    var raw: Dictionary = pj.get("cell_textures", {})
    for key: String in raw:
        var parts: PackedStringArray = key.split(",")
        if parts.size() != 2:
            continue
        var cell: Vector2i = Vector2i(int(parts[0]), int(parts[1]))
        var img_name: String = str(raw[key])
        var path: String = "res://assets/" + img_name
        if ResourceLoader.exists(path):
            _cell_textures[cell] = load(path) as Texture2D
```

#### 3-d. `_draw()` — 貼圖查找改為純 cell-level

背景鋪設改用 `_bg_texture`：

```gdscript
# 舊：_tile_textures.has("empty")
# 新：
if _bg_texture != null:
    # 鋪滿 viewport（邏輯不變，只是換變數）
    var ts: float = float(tile_size)
    var start_x: float = fmod(_map_offset.x, ts) - ts
    var start_y: float = fmod(_map_offset.y, ts) - ts
    var max_c: int = int(ceil(vp.x / ts)) + 2
    var max_r: int = int(ceil(vp.y / ts)) + 2
    for col in range(max_c):
        for row in range(max_r):
            draw_texture_rect(_bg_texture,
                Rect2(Vector2(start_x + col * ts, start_y + row * ts), Vector2(ts, ts)), false)
else:
    draw_rect(Rect2(Vector2.ZERO, vp), COLOR_BG)
```

格子繪製改為直接查 `_cell_textures`：

```gdscript
# 舊：依 type_name 查 _tile_textures
# 新：
var tex: Texture2D = _cell_textures.get(cell, null)
if tex != null:
    draw_rect(rect, _tile_color(cell))   # 底色（透明部分的顯示用）
    draw_texture_rect(tex, rect, false)
else:
    draw_rect(rect, _tile_color(cell))   # 無貼圖時純色 fallback
_draw_tile_icon(rect, cell)
```

`use_textures` 判斷邏輯移除，改為直接看 `_cell_textures` 是否有值。

---

## 編輯器操作流程（UX）

```
選「🚩 路徑」工具 → 點格子 → type=road, texture=tile_stone.webp（畫筆預設自動填）
選「🟩 防禦區」工具 → 點格子 → type=build, texture=tile_grass.webp（畫筆預設自動填）

選「🎨 格子貼圖」工具
    → 工具列出現貼圖選取列
    → 選任意貼圖
    → 點格子 → 只改 texture，type 完全不動

選「🧹 清除」工具 → 點格子 → type=empty, texture=tile_empty.webp（重置）
```

**結果**：路徑的 type 仍是 `road`（敵人走得過），視覺上可顯示草地、土地或任意貼圖，型別與貼圖互不干擾。

---

## 連接障礙物的視覺處理策略

### 問題描述

如「熔岩要塞」這類關卡，地圖邊緣有大片連續的熔岩岩石區，若逐格填充障礙物貼圖會很繁瑣，且相鄰格之間的接縫難以處理。

### 現階段建議做法：背景鋪滿

```
┌──────────────────────────────┐
│  background_texture 鋪滿     │  ← 熔岩 / 岩石 無縫貼圖，自動填滿整個 viewport
│  ┌────────────────────┐      │
│  │  cell_textures     │      │  ← 只定義石板路 + 防禦區這塊中央區域
│  └────────────────────┘      │
└──────────────────────────────┘
```

- `background_texture` 使用可無縫拼接的熔岩貼圖，GameMap.gd 自動鋪滿整個視口
- `cell_textures` 只填中央有意義的格子（路徑、防禦區），邊緣留空讓背景透出
- 不需要手動定義每一格邊緣障礙物的貼圖，視覺上自然連成一片

**效果**：邊緣連續區域靠美術資源的無縫設計達成，無需改動系統。

### 未來可選擇的進階做法：Autotile

若需要角落、直邊、內凹等不同形狀的精確控制（如 Godot TileMap 的 terrain 功能），需要：

1. 每種地形準備多張變體貼圖（角落 / 橫邊 / 直邊 / 中央 / 獨立…共約 16 種）
2. GameMap.gd 在渲染時檢查每格的上下左右鄰格，根據鄰格關係選對應變體
3. 編輯器同步新增「地形刷」工具，自動計算鄰格並選圖

此做法複雜度高，現階段不實作，列為未來選項。

---

## 調整量估算

| 檔案 | 新增 | 修改 | 刪除 | 備註 |
|------|------|------|------|------|
| `types/index.ts` | 2 行 | 2 行 | 0 | 最小 |
| `mapTab.tsx` | ~50 行 | ~30 行 | ~10 行 | 主要工作量 |
| `GameMap.gd` | ~25 行 | ~15 行 | ~20 行 | 移除舊貼圖邏輯 |

**無破壞性修改**：舊格式 JSON 匯入時，編輯器自動從 `tile_textures`（若有）推算每格 texture 並轉換為新格式，下次存檔即完成遷移。

---

## 注意事項

1. `GridCell.texture` 設為必填後，所有建立 GridCell 的地方（`makeGrid`、`applyCell` 各分支、`loadFromJson` 回填）都必須確保有值，TypeScript 編譯器會協助找出遺漏。
2. `_load_textures()` 在 Godot 端以 `ResourceLoader.exists()` 做防護，找不到的貼圖直接略過不 crash，該格會 fallback 到 `_tile_color()` 純色。
3. 每次新增貼圖資源時，需同步更新 `mapTab.tsx` 的 `DEFAULT_TILE_IMAGE_OPTIONS` 清單，編輯器才能選取新圖片。
4. GAS / Sheets 無需任何異動，`cell_textures` 是 `path_json` 的內部結構，GAS 以不透明 JSON 字串處理。
5. **貼圖資源必須在 Godot 匯出前就存在**：`cell_textures` 中填寫的圖片名稱（如 `"tile_lava.webp"`）必須實際放置於 `godot/shenmaSanguo/assets/` 資料夾中，並在匯出時一起打包。若資源不存在，`ResourceLoader.exists()` 回傳 false，該格 fallback 純色。無法從 Web 端動態新增貼圖，這是 Godot Web 匯出的本質限制。新增貼圖的完整流程：將圖片加入 `godot/shenmaSanguo/assets/` → 重新匯出 Godot → 更新編輯器的 `DEFAULT_TILE_IMAGE_OPTIONS`。
