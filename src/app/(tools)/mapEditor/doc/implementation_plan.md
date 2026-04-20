# 地圖編輯器 Implementation Plan

**建立日期：** 2026-04-20

## 功能概述

可視化塔防地圖編輯器工具，讓設計者能直覺操作格子並輸出 JSON 供神馬三國使用。

## 功能規格

| 功能          | 說明                                         |
| ------------- | -------------------------------------------- |
| 格子尺寸      | 自訂 cols × rows（最大 40×40）               |
| 工具：航點    | 按點順序新增，第一個=出生點，最後一個=終點   |
| 工具：防禦區  | 拖曳塗色（綠色）                             |
| 工具：障礙物  | 拖曳塗色（灰色）                             |
| 工具：清除    | 單格清除                                     |
| tile_textures | 固定 5 個欄位（road/build/empty/base/spawn） |
| 輸出          | 標準 JSON + Google Sheets 跳脫格式           |

## 輸出 JSON 結構

```json
{
  "map_id": "chapter1_1",
  "name": "第一關",
  "chapter": 1,
  "cols": 14,
  "rows": 11,
  "waypoints": [
    [0, 2],
    [11, 2],
    [11, 6],
    [2, 6],
    [2, 9],
    [13, 9]
  ],
  "spawn": [0, 2],
  "base": [13, 9],
  "build_zones": [
    [3, 1],
    [4, 1]
  ],
  "obstacles": [
    [0, 0],
    [1, 0]
  ],
  "tile_textures": {
    "road": "tile_road.webp",
    "build": "tile_build.webp",
    "empty": "tile_empty.webp",
    "base": "tile_base.webp",
    "spawn": "tile_spawn.webp"
  }
}
```

## 路由資訊

- Path: `/mapEditor`
- 模組：工具
- `showInNavbar: false`
