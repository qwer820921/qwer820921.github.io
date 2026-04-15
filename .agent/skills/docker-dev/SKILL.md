---
name: Docker 開發環境
description: 本專案的 Docker 容器化開發環境配置說明，包含啟動、停止、重建、除錯等操作指引
---

# Docker 開發環境

本專案使用 Docker 進行本機容器化開發，確保跨平台一致性並避免 Windows / Linux 跨系統編譯問題。

---

## 1. 架構概覽

```
┌─────────────────────────────────────────┐
│  Windows Host                           │
│                                         │
│  專案目錄 (Volume 掛載) ──────┐         │
│                               ▼         │
│  ┌──────────────────────────────────┐   │
│  │  Docker Container (Alpine Linux) │   │
│  │                                  │   │
│  │  /app  ← 專案原始碼 (掛載)      │   │
│  │  /app/node_modules ← 匿名卷     │   │
│  │  /app/.next        ← 匿名卷     │   │
│  │                                  │   │
│  │  Next.js Dev Server :3000        │   │
│  └──────────┬───────────────────────┘   │
│             │                           │
│         Port 映射                       │
│         3000 → 3001                     │
│             │                           │
│  瀏覽器 → http://localhost:3001         │
└─────────────────────────────────────────┘
```

### 關鍵檔案

| 檔案                 | 用途                               |
| -------------------- | ---------------------------------- |
| `Dockerfile.dev`     | 開發用映像定義（Node 18 Alpine）   |
| `docker-compose.yml` | 服務編排（Port、Volume、環境變數） |
| `.dockerignore`      | 建置時排除的檔案清單               |

---

## 2. 日常操作指令

### 啟動服務

```bash
# 背景啟動（推薦日常使用）
docker compose up -d --build

# 前台啟動（可直接看 log）
docker compose up --build
```

### 查看日誌

```bash
# 持續追蹤容器日誌
docker compose logs -f

# 只看最近 50 行
docker compose logs --tail 50
```

### 停止服務

```bash
# 停止並移除容器（保留匿名卷）
docker compose down

# 停止並移除容器 + 匿名卷（完全清除，下次啟動會重新 npm ci）
docker compose down -v
```

### 重新建置

```bash
# 修改了 package.json 或 Dockerfile.dev 後，需要重建
docker compose up --build

# 強制不使用快取重建（排除快取問題時使用）
docker compose build --no-cache
docker compose up
```

### 進入容器內部

```bash
# 開啟容器內的 shell（用於除錯）
docker compose exec web sh

# 在容器內執行一次性指令
docker compose exec web npm run lint
```

---

## 3. 匿名卷機制說明

`docker-compose.yml` 中使用了兩個**匿名卷（Anonymous Volumes）**：

```yaml
volumes:
  - .:/app # 掛載專案目錄
  - /app/node_modules # 匿名卷：隔離 node_modules
  - /app/.next # 匿名卷：隔離 .next
```

### 為什麼需要匿名卷？

| 問題                      | 說明                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **跨平台 native modules** | Windows 的 `node_modules` 包含 Windows 編譯的 binary（如 `sharp`、`esbuild`），直接掛載到 Linux 容器會導致執行錯誤 |
| **`.next` 快取衝突**      | `.next` 目錄包含平台相關的編譯快取，跨系統共用會導致不可預期的編譯錯誤                                             |

### 匿名卷的行為

- `docker compose down`：**保留**匿名卷，下次啟動不需重新安裝
- `docker compose down -v`：**刪除**匿名卷，下次啟動會重新執行 `npm ci`

---

## 4. Hot Reload（熱更新）

### 運作原理

Docker for Windows 使用 WSL2 filesystem，原生的 `inotify` 檔案監聽可能無法跨越 Windows → Linux 邊界。因此透過環境變數啟用 **Polling 模式**：

```yaml
environment:
  - WATCHPACK_POLLING=true # Next.js 使用的檔案監聽器
  - CHOKIDAR_USEPOLLING=true # 其他依賴使用的檔案監聽器
```

### 驗證 Hot Reload

1. 確認容器正在運行：`docker compose ps`
2. 修改任意 `.tsx` 檔案並儲存
3. 觀察容器日誌是否出現 `Compiling ...` 訊息
4. 瀏覽器頁面應自動刷新

---

## 5. 常見問題排除

### Q: 啟動後瀏覽器顯示無法連線

```bash
# 1. 確認容器狀態
docker compose ps

# 2. 檢查容器日誌是否有錯誤
docker compose logs

# 3. 確認 Port 沒有被佔用
netstat -ano | findstr :3001
```

### Q: `npm ci` 失敗或依賴安裝錯誤

```bash
# 清除所有匿名卷後重建
docker compose down -v
docker compose up --build
```

### Q: 修改檔案後沒有觸發 Hot Reload

```bash
# 確認環境變數有生效
docker compose exec web env | findstr POLLING

# 重啟容器
docker compose restart
```

### Q: 需要安裝新的 npm 套件

```bash
# 方法一：在 Host 修改 package.json 後重建
npm install some-package --save    # 在 Windows 更新 package.json
docker compose up --build          # 重建容器

# 方法二：進入容器內安裝（臨時，重建後會消失）
docker compose exec web npm install some-package
```

### Q: 磁碟空間不足

```bash
# 清理未使用的 Docker 資源
docker system prune -a

# 只清理懸掛的映像
docker image prune
```

---

## 6. 注意事項

> ⚠️ **不要在 Docker 容器中執行 `npm run build` 再部署**。本專案部署至 GitHub Pages 是透過 Host 端的 `npm run deploy`，Docker 僅用於開發環境。

> ⚠️ **`lint-staged` 警告是正常的**。容器使用 Node 18，而 `lint-staged@16` 要求 Node >= 20。這只是警告，不影響 `next dev` 的運作。如果需要在容器內執行 lint，可將 Dockerfile.dev 的基底映像升級為 `node:20-alpine`。

> ⚠️ **`.env.local` 會自動帶入容器**。因為 Volume 掛載整個專案目錄，`.env.local` 會自動可用，不需要在 `docker-compose.yml` 中額外設定 `env_file`。
