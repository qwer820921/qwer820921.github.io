---
title: "【系統部署】前端應用程式的 Docker 容器化與本地部署指南"
date: "2026-02-07"
description: "一份詳盡的前端應用程式 Docker 容器化指南，涵蓋多階段構建、Nginx 優化配置及本地部署工作流，確保開發與生產環境一致性。"
category: "Deployment"
tags: ["Docker", "Frontend", "Nginx", "Deployment", "Containerization", "CI/CD"]
---

# 【系統部署】前端應用程式的 Docker 容器化與本地部署指南

**作者：** Manus AI
**日期：** 2026年2月11日

---

## 1. Overview

在現代前端開發中，將應用程式容器化已成為標準實踐，尤其是在微服務架構和 CI/CD 流水線中。Docker 提供了一種輕量級、可移植且自給自足的環境，確保應用程式在任何地方都能以相同的方式運行，從而解決了長期困擾開發者的「在我機器上可以跑」的問題。本指南將專注於如何為前端應用程式（如基於 React, Angular, Vue 的單頁應用程式 SPA）進行高效的 Docker 容器化，並透過 Nginx 進行生產環境的最佳化服務，最終實現便捷的本地開發與部署工作流。

透過本指南，您將學習到如何利用多階段構建（Multi-stage Build）技術來創建最小化且安全的 Docker 映像檔，如何配置 Nginx 作為高性能的靜態檔案伺服器，以及如何使用 Docker Compose 簡化本地開發環境的設置和應用程式的啟動。這將有助於提升開發效率、確保環境一致性，並為未來的生產部署奠定堅實基礎。

## 2. Architecture / Design

前端應用程式的 Docker 容器化部署架構，旨在將前端應用程式的構建（Build）與運行（Run）環境分離，並透過 Nginx 提供高效的靜態檔案服務。這種設計模式確保了最終映像檔的輕量化、安全性與高性能。

### 2.1 專案結構 (Project Structure)

一個典型的容器化前端專案將包含以下核心檔案和目錄結構：

```
. # 專案根目錄
├── my-frontend-app/ # 前端應用程式目錄
│   ├── src/ # 原始碼
│   ├── public/ # 靜態資源
│   ├── package.json # NPM 依賴管理
│   ├── Dockerfile # Docker 構建檔案
│   └── nginx.conf # Nginx 伺服器配置檔案
└── docker-compose.yml # Docker Compose 配置檔案 (用於本地開發/多服務協調)
```

### 2.2 Dockerfile 設計 (Dockerfile Design) - 多階段構建 (Multi-stage Build)

多階段構建是 Dockerfile 的一項關鍵特性，它允許在一個 Dockerfile 中定義多個 `FROM` 指令，每個 `FROM` 指令都代表一個構建階段。這樣做的好處是，最終的映像檔只包含運行應用程式所需的最小化組件，而不會包含構建時所需的龐大工具和依賴。這顯著減少了映像檔的大小，提升了安全性和部署速度。

#### 2.2.1 第一階段：構建階段 (Build Stage)

此階段的目標是安裝所有前端專案的開發依賴，並執行構建命令（例如 `npm run build` 或 `yarn build`），生成生產環境所需的靜態檔案。我們通常會選擇一個包含 Node.js 環境的基礎映像檔。

```dockerfile
# Stage 1: Build the frontend application
FROM node:lts-alpine as builder

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock) to leverage Docker cache
COPY package*.json ./

# Install dependencies
RUN npm install --silent

# Copy the rest of the application code
COPY . .

# Build the application for production
# Replace 'npm run build' with your specific build command (e.g., 'ng build --configuration=production')
RUN npm run build

# The build output will typically be in a 'dist' or 'build' folder
# For example, for React it's 'build', for Angular it's 'dist/<project-name>'
# For this example, we assume the output is in 'dist'
```

#### 2.2.2 第二階段：運行階段 (Runtime Stage)

此階段的目標是只包含運行前端應用程式所需的最小化環境，即一個輕量級的靜態檔案伺服器 Nginx。它將從第一階段複製構建好的靜態檔案，並配置 Nginx 來服務這些檔案。

```dockerfile
# Stage 2: Serve the application with Nginx
FROM nginx:alpine

# Copy the custom Nginx configuration file
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built frontend application from the 'builder' stage
# Adjust '/app/dist' to your actual build output directory from Stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 80 for Nginx
EXPOSE 80

# Command to run Nginx when the container starts
CMD ["nginx", "-g", "daemon off;"]
```

### 2.3 Nginx 配置 (Nginx Configuration) - `nginx.conf`

Nginx 作為一個高性能的 Web 伺服器，非常適合用來服務前端應用的靜態檔案。對於單頁應用程式（SPA），Nginx 的配置需要特別處理路由回退（Fallback Routing），以確保所有未匹配的路由都能指向 `index.html`。

```nginx
# nginx.conf
server {
    listen 80;
    server_name localhost;

    # Set the root directory for serving static files
    # This should match the directory where your built frontend files are copied
    root /usr/share/nginx/html;
    index index.html index.htm;

    # Try to serve files directly, if not found, fallback to index.html
    # This is crucial for Single Page Applications (SPAs) to handle client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Optional: Configure caching for static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|woff|woff2|ttf|svg|eot)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # Optional: Enable Gzip compression for better performance
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_buffers 16 8k;
    gzip_http_version 1.1;
    gzip_min_length 256;
    gzip_vary on;

    # Optional: Add security headers
    add_header X-Frame-Options "DENY";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "no-referrer-when-downgrade";
    # Content-Security-Policy can be complex, configure carefully
    # add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';";
}
```

### 2.4 Docker Compose 配置 (Docker Compose Configuration) - `docker-compose.yml`

Docker Compose 是一個用於定義和運行多容器 Docker 應用程式的工具。透過一個 YAML 檔案，您可以配置應用程式的服務、網路和儲存。對於本地部署，它極大地簡化了多個服務（例如前端、後端 API、資料庫）的協調與啟動。

```yaml
# docker-compose.yml
version: "3.8"

services:
  frontend:
    build:
      context: ./my-frontend-app # 指向 Dockerfile 所在的目錄
      dockerfile: Dockerfile
    ports:
      - "80:80" # 將主機的 80 埠映射到容器的 80 埠
    # volumes: # 僅在開發環境下考慮使用，生產環境不建議
    #   - ./my-frontend-app:/usr/share/nginx/html # 將本地程式碼掛載到容器，實現熱重載
    # environment: # 如果前端應用程式需要運行時環境變數
    #   - API_BASE_URL=http://localhost:3000
    restart: always # 容器退出後自動重啟
```

## 3. Prerequisites

在開始容器化前端應用程式之前，請確保您的開發環境已安裝以下工具：

- **Docker Desktop** 或 **Docker Engine**: 這是運行 Docker 容器的基礎。您可以從 [Docker 官方網站](https://www.docker.com/get-started) 下載並安裝。
- **Node.js & npm/yarn**: 用於前端應用程式的開發和構建。雖然 Dockerfile 會處理容器內的 Node.js 環境，但在本地開發時仍需要。
- **一個前端應用程式**: 任何基於 React, Angular, Vue 或其他框架的單頁應用程式。

## 4. Implementation / Code Example

以下將提供一個完整的實作範例，假設您有一個名為 `my-frontend-app` 的前端專案。

### 4.1 專案設置

首先，確保您的專案結構如 `2.1 專案結構` 中所示。在 `my-frontend-app` 目錄下，您應該有您的前端程式碼、`package.json` 等。然後，創建 `Dockerfile` 和 `nginx.conf` 檔案。

### 4.2 `my-frontend-app/Dockerfile`

請參考 `2.2 Dockerfile 設計` 中的多階段構建範例，將其內容複製到您的 `my-frontend-app/Dockerfile` 檔案中。請務必根據您的前端框架調整 `RUN npm run build` 命令和 `COPY --from=builder /app/dist` 的路徑。

### 4.3 `my-frontend-app/nginx.conf`

請參考 `2.3 Nginx 配置` 中的範例，將其內容複製到您的 `my-frontend-app/nginx.conf` 檔案中。此配置已針對 SPA 進行優化，並包含基本的快取和 Gzip 壓縮。

### 4.4 `docker-compose.yml`

在專案的根目錄（與 `my-frontend-app` 同級）創建 `docker-compose.yml` 檔案，並複製 `2.4 Docker Compose 配置` 中的內容。確保 `context` 指向正確的前端應用程式目錄。

### 4.5 本地部署工作流 (Local Deployment Workflow)

完成上述檔案設置後，您可以按照以下步驟在本地部署您的前端應用程式：

1.  **打開終端機**：導航到包含 `docker-compose.yml` 檔案的專案根目錄。
2.  **構建並啟動容器**：執行以下命令。
    ```bash
    docker-compose up --build -d
    ```
    - `up`: 啟動服務。
    - `--build`: 強制重新構建映像檔，確保使用最新的 `Dockerfile` 和程式碼。
    - `-d`: 在後台運行容器（detached mode）。
3.  **驗證服務**：等待 Docker 映像檔構建完成並啟動容器。您可以使用 `docker-compose ps` 命令查看容器狀態。
4.  **訪問應用程式**：打開您的瀏覽器，訪問 `http://localhost` (如果 `docker-compose.yml` 中映射的是 80 埠)。
5.  **停止與清理**：當您完成開發或測試後，可以執行以下命令停止並移除容器、網路和卷。
    ```bash
    docker-compose down
    ```
    如果您想移除所有映像檔，可以執行 `docker-compose down --rmi all`。

## 5. Parameters / API Reference

此處主要涉及 Dockerfile 指令、Nginx 配置指令和 Docker Compose 服務配置。

### 5.1 Dockerfile 關鍵指令

| 指令      | 描述                                                                             |
| :-------- | :------------------------------------------------------------------------------- |
| `FROM`    | 指定基礎映像檔。多階段構建中會多次使用。                                         |
| `WORKDIR` | 設定容器內的工作目錄。                                                           |
| `COPY`    | 將主機上的檔案或目錄複製到容器內。`--from` 參數用於從其他構建階段複製檔案。      |
| `RUN`     | 在當前映像檔層中執行命令。常用於安裝依賴、構建應用程式。                         |
| `EXPOSE`  | 聲明容器在運行時監聽的埠號。這是一個文檔說明，不實際發布埠號。                   |
| `CMD`     | 提供容器啟動時的預設執行命令。如果 Dockerfile 中有多個 `CMD`，只有最後一個生效。 |

### 5.2 Nginx `nginx.conf` 關鍵配置

| 配置項       | 描述                                                                                                                           |
| :----------- | :----------------------------------------------------------------------------------------------------------------------------- |
| `listen`     | Nginx 監聽的埠號。                                                                                                             |
| `root`       | 靜態檔案的根目錄。                                                                                                             |
| `index`      | 預設的索引檔案名稱。                                                                                                           |
| `location /` | 處理所有請求的區塊。`try_files $uri $uri/ /index.html;` 對於 SPA 至關重要，它會嘗試查找檔案，如果找不到則回退到 `index.html`。 |
| `gzip on;`   | 啟用 Gzip 壓縮。                                                                                                               |
| `expires`    | 設定 HTTP 響應頭中的 `Expires` 和 `Cache-Control`，控制瀏覽器快取。                                                            |
| `add_header` | 添加自定義的 HTTP 響應頭，常用於安全性配置。                                                                                   |

### 5.3 Docker Compose `docker-compose.yml` 關鍵配置

| 配置項        | 描述                                                                                                  |
| :------------ | :---------------------------------------------------------------------------------------------------- |
| `version`     | Docker Compose 檔案格式版本。                                                                         |
| `services`    | 定義應用程式中的各個服務。                                                                            |
| `build`       | 指定如何構建服務的映像檔。`context` 指向 `Dockerfile` 所在目錄，`dockerfile` 指定 `Dockerfile` 名稱。 |
| `ports`       | 將主機埠號映射到容器埠號。格式為 `HOST:CONTAINER`。                                                   |
| `volumes`     | 將主機路徑或具名卷掛載到容器內。常用於開發時的程式碼同步。                                            |
| `environment` | 設定容器內的環境變數。                                                                                |
| `restart`     | 定義容器退出後的重啟策略（例如 `always`, `on-failure`）。                                             |

## 6. Notes & Best Practices

1.  **多階段構建的優勢**：始終使用多階段構建。這不僅能大幅縮小最終映像檔的體積，還能減少不必要的依賴和潛在的安全漏洞，因為運行時映像檔只包含必要的組件。
2.  **Nginx 配置優化**：
    - **SPA 路由回退**：`try_files $uri $uri/ /index.html;` 是 SPA 部署的關鍵。它確保了無論用戶訪問哪個前端路由，Nginx 都能正確地返回 `index.html`，讓前端路由器接管。
    - **快取策略**：為靜態資源（JS, CSS, 圖片等）配置合理的 `expires` 和 `Cache-Control` 頭，可以顯著提升應用程式的載入速度和用戶體驗。
    - **Gzip 壓縮**：啟用 Gzip 壓縮可以減少傳輸的資料量，尤其對於大型 JS/CSS 檔案效果顯著。
    - **安全性頭**：添加 `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection` 等 HTTP 安全性頭，可以增強應用程式的安全性。
3.  **環境變數管理**：
    - 前端應用程式通常需要在運行時獲取不同的環境變數（例如 API 服務的 URL）。避免將敏感資訊硬編碼到程式碼中。
    - 對於 Docker 容器，可以透過 `docker-compose.yml` 的 `environment` 區塊或 Dockerfile 中的 `ARG`/`ENV` 指令來注入環境變數。在 Nginx 配置中，可以利用 `envsubst` 在容器啟動時替換 Nginx 配置中的變數。
4.  **本地開發與熱重載**：
    - 在開發階段，可以考慮在 `docker-compose.yml` 中使用 `volumes` 將本地程式碼目錄掛載到容器內，並結合前端開發伺服器的熱重載功能，實現程式碼修改後容器內自動更新。
    - 然而，在生產環境中應避免使用 `volumes` 掛載程式碼，因為這會增加部署的複雜性並可能引入不一致性。
5.  **映像檔標籤 (Image Tagging)**：為您的 Docker 映像檔使用有意義的標籤（例如 `v1.0.0`, `latest`, `commit-sha`），以便於版本管理和回溯。
6.  **安全性考量**：
    - 使用官方的、受信任的基礎映像檔（例如 `node:lts-alpine`, `nginx:alpine`）。
    - 定期更新基礎映像檔，以獲取最新的安全補丁。
    - 避免在最終映像檔中包含不必要的工具和依賴。

## 7. 為什麼選擇這種方式？

將前端應用程式進行 Docker 容器化並透過 Nginx 部署，是現代 Web 開發中的一個黃金標準。選擇這種方式，主要基於以下幾個不可或缺的優勢：

1.  **環境一致性**：Docker 容器提供了一個隔離且標準化的運行環境，確保了應用程式從開發、測試到生產環境的一致性。這極大地減少了因環境差異導致的問題，加速了開發與部署流程。
2.  **高效能服務**：Nginx 作為一個輕量級且高效能的 Web 伺服器，非常適合服務前端應用的靜態檔案。其優化的快取機制、Gzip 壓縮以及對 SPA 路由的良好支持，能夠顯著提升應用程式的載入速度和用戶體驗。
3.  **資源優化與安全性**：透過多階段構建，最終的 Docker 映像檔只包含運行應用程式所需的最小化組件，不包含構建工具和開發依賴。這不僅使得映像檔體積更小，減少了儲存和傳輸成本，也降低了潛在的安全攻擊面。
4.  **簡化部署與擴展**：容器化的應用程式易於部署到任何支援 Docker 的環境，無論是本地開發、測試伺服器還是雲端平台（如 Kubernetes, AWS ECS）。Docker Compose 進一步簡化了本地多服務應用程式的啟動和管理，為未來的水平擴展奠定了基礎。
5.  **標準化工作流**：這種模式提供了一個清晰、可重複的部署工作流，有助於團隊成員之間的協作，並能輕鬆整合到 CI/CD 流水線中，實現自動化測試和部署。

---

**參考資料**

- [1] OneUptime. (2026, February 2). _How to Use Multi-Stage Docker Builds_. Retrieved from https://oneuptime.com/blog/post/2026-02-02-docker-multi-stage-builds/view
- [2] DEV Community. (2025, October 7). _Guide to Containerizing a Modern JavaScript SPA (Vue/Vite/React) with a Multi-Stage Nginx Build_. Retrieved from https://dev.to/it-wibrc/guide-to-containerizing-a-modern-javascript-spa-vuevitereact-with-a-multi-stage-nginx-build-1lma
- [3] Telerik. (2025, June 4). _Deploying Angular Apps with NGINX and Docker_. Retrieved from https://www.telerik.com/blogs/deploying-angular-apps-nginx-docker
- [4] Docker. (n.d.). _Get Started with Docker_. Retrieved from https://www.docker.com/get-started
- [5] Heroku Dev Center. (2025, November 5). _Local Development with Docker Compose_. Retrieved from https://devcenter.heroku.com/articles/local-development-with-docker-compose
