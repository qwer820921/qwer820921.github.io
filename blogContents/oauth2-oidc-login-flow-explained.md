---
title: "深入淺出 OAuth 2.0 與 OpenID Connect：從核心架構到 PKCE 實戰解析"
date: "2026-03-03"
author: "子yee"
description: "為什麼登入會跳轉好幾次？本文以資深架構師視角，深入解析 OAuth2 與 OIDC 的核心機制、授權流程以及現代安全增強方案 PKCE，助你掌握身份驗證與授權的精髓。"
category: "Security"
tags:
  [
    "OAuth2",
    "OIDC",
    "Security",
    "Authentication",
    "Authorization",
    "Next.js",
    "Web Development",
  ]
---

## 前言：為什麼登入會跳轉好幾次？

身為開發者，你一定在實作「使用 Google 登入」或「使用 GitHub 登入」時觀察到一個有趣的現象：當使用者點擊登入按鈕後，瀏覽器會經歷一連串的跳轉（Redirect）。從你的應用程式跳到 Google 進行身份驗證，輸入完密碼後，Google 會將你導向一個中間頁面，最終才回到你的應用程式首頁。這個過程中，瀏覽器會經歷數次跳轉，而這些跳轉的目的地，即 `redirect_uri`，可以是你的前端應用程式，也可以是後端服務。

**「為什麼登入不能在一個 API 請求中完成？這些跳轉究竟在保護什麼？」**

這不僅是初學者的疑問，也是許多資深工程師在調試生產環境問題時必須釐清的核心邏輯。本文將從軟體架構的角度，帶你深入理解這套支撐現代網路身份體系的兩大支柱：**OAuth 2.0** 與 **OpenID Connect (OIDC)**。

---

## OAuth 2.0 核心概念：它不是登入協議

在進入技術細節前，必須先建立一個最重要的觀念：**OAuth 2.0 是一個「授權框架 (Authorization Framework)」，而非「身份驗證協議 (Authentication Protocol)」**。

### 核心比喻：飯店房卡系統

想像你入住一家飯店：

1. **Resource Owner (資源擁有者)**：你（使用者）。
2. **Client (用戶端)**：飯店內的「智慧保險箱」或「健身房門禁機」。
3. **Authorization Server (授權伺服器)**：飯店櫃檯。
4. **Resource Server (資源伺服器)**：你的房間。

當你向櫃檯（Authorization Server）出示證件並核對身份後，櫃檯會給你一張**房卡 (Access Token)**。你拿著這張房卡去刷房間門（Resource Server），門禁系統只會檢查「這張卡是否有權限打開這扇門」，而不會再要求你出示身分證。

> **關鍵洞察**：房卡本身並不代表你的身份（你是誰），**它只能代表對資源的存取權限**。

### 四個核心角色

| 角色           | 英文名稱             | 說明                                                           |
| :------------- | :------------------- | :------------------------------------------------------------- |
| **資源擁有者** | Resource Owner       | 擁有資料的使用者，能授權存取其帳戶。                           |
| **用戶端**     | Client               | 想要存取使用者資料的應用程式（如你的 Web App）。               |
| **授權伺服器** | Authorization Server | 驗證使用者身份並核發 Token 的伺服器（如 Google Auth Server）。 |
| **資源伺服器** | Resource Server      | 存放受保護資料的伺服器（如 Google Drive API）。                |

### 特別強調：Access Token 的本質

根據 [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)，OAuth 2.0 並未定義 **Access Token** 的內部格式。它可能是一個 **JWT (JSON Web Token)**，也可能是一個隨機生成的**不透明字串 (Opaque Token)**。因此，Client **不應該**依賴解析 Access Token 來獲取使用者資訊，那是 OIDC 的職責。不同的 OAuth 2.0 實作可能會採用不同的格式，例如 Google 通常核發不透明字串，而 Auth0 或 Keycloak 則可能核發 JWT 格式的 Access Token。

---

## OpenID Connect (OIDC) 身份層：定義「你是誰」

如果 OAuth 2.0 是關於「權限」，那麼 OIDC 就是關於「身份」。OIDC 是建立在 OAuth 2.0 之上的身份層（Identity Layer）。

### 房卡與身份證件的比喻

延續飯店的比喻，OIDC 就像是在給你房卡的同時，額外附上了一張印有你照片和姓名的**臨時識別證 (ID Token)**。

- **Access Token (房卡)**：給機器看的，用來開門。
- **ID Token (識別證)**：給應用程式看的，用來顯示「歡迎回來，王小明」。

### ID Token vs. Access Token

| 特性         | ID Token                      | Access Token                                                                                          |
| :----------- | :---------------------------- | :---------------------------------------------------------------------------------------------------- |
| **用途**     | 身份驗證 (Authentication)     | 授權 (Authorization)                                                                                  |
| **讀取對象** | Client (應用程式)             | Resource Server (API 伺服器)                                                                          |
| **格式**     | 必須是 **JWT**                | 可能是不透明字串，也可能是 JWT，取決於實作（例如 Google 通常為不透明字串，Auth0/Keycloak 可能為 JWT） |
| **內容**     | 包含使用者的基本資訊 (Claims) | 包含權限範圍 (Scopes)                                                                                 |

---

## Authorization Code Flow 詳細流程

這是最安全且最常用的流程，特別適用於有後端的 Web 應用程式。

| 步驟 | 動作                | 目的                                                                                                                                         |
| :--- | :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **用戶重定向**      | Client 將使用者引導至授權伺服器，並帶上 `client_id` 與 `scope`。                                                                             |
| 2    | **使用者授權**      | 使用者在授權伺服器登入，並同意授權。                                                                                                         |
| 3    | **重定向回 Client** | 授權伺服器將使用者導回您預先註冊的 `redirect_uri`（通常是您的後端或前端），並附上一個**短暫有效（通常為數分鐘）**的 **Authorization Code**。 |
| 4    | **交換 Token**      | Client 在後端使用 `code` + `client_secret` 向授權伺服器請求 Token。                                                                          |
| 5    | **核發 Token**      | 授權伺服器驗證無誤後，回傳 `access_token` 與 `id_token`。                                                                                    |
| 6    | **存取資源**        | Client 使用 `access_token` 向資源伺服器請求資料。**請注意，ID Token 不會用來直接存取資源。**                                                 |

### 為什麼要這麼多跳轉？

1. **安全性**：使用者的密碼只輸入在 Google 的頁面上，你的 App 永遠拿不到密碼。
2. **中間人防禦**：Authorization Code 是透過瀏覽器傳遞的，即使被攔截，駭客也沒有 `client_secret` 來交換真正的 Token。

---

## PKCE 安全增強機制：防範授權碼攔截

對於單頁應用程式 (SPA) 或行動裝置 App，無法安全地儲存 `client_secret`。這時我們需要 **PKCE (Proof Key for Code Exchange)**，定義於 [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)。

### PKCE 運作原理

PKCE 引入了動態生成的秘密，取代靜態的 `client_secret`：

1. **Code Verifier**：Client 生成一個高熵的隨機字串。
2. **Code Challenge**：將 `code_verifier` 進行雜湊處理（通常使用 **SHA256**）。

**流程精確描述：**

> 「Client 在發起授權請求時傳送 `code_challenge` 給授權伺服器。在最後一步交換 Token 時，Client 必須提供原始的 `code_verifier`。授權伺服器會將其雜湊後與先前收到的 `code_challenge` 比對，確保請求 Token 的人與發起授權的人是同一個。」

---

## Token 結構解析：解構 JWT

在 OIDC 中，ID Token 採用 JWT 格式。

### JWT 的三個部分

1. **Header**：定義演算法（如 `{"alg": "RS256", "typ": "JWT"}`）。
2. **Payload**：包含聲明 (Claims)，如 `sub` (使用者 ID), `iss` (簽發者), `exp` (過期時間)。
3. **Signature**：簽名，確保內容未被竄改。

### 實際範例 (RS256)

在生產環境中，我們通常使用 **RS256 (非對稱加密)** 而非 HS256。這意味著授權伺服器使用私鑰簽名，而 Client 使用公鑰驗證。**相比 HS256 (對稱簽名)，RS256 的安全性更高，特別適合於多服務架構中，因為 Client 無需共享私鑰即可驗證簽名。**

```json
// Header
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key-id-123"
}

// Payload
{
  "iss": "https://accounts.google.com",
  "sub": "1234567890",
  "aud": "my-client-id",
  "iat": 1614556800,
  "exp": 1614560400,
  "name": "Manus Architect",
  "email": "architect@manus.im"
}
```

### 如何驗證簽名？

Client 會從授權伺服器的 `jwks_uri` 端點獲取公鑰清單，並根據 Header 中的 `kid` 找到對應的公鑰來驗證 Signature。

---

## 總結：架構師的洞察

回到最初的問題：**為什麼登入會跳轉三次？**

1. **第一次跳轉**：將使用者安全地交給可信賴的身份提供者 (IdP)。
2. **第二次跳轉**：將使用者重定向回 `redirect_uri`，並帶回一個**短暫有效（通常為數分鐘）**的「暫時憑證 (Authorization Code)」，避免敏感資料在瀏覽器歷史記錄中暴露。
3. **第三次跳轉**（應用程式內部）：完成 Token 交換後，將使用者導向最終目的地。

在現代分散式架構中，OAuth 2.0 + OIDC 解決的不僅是「登入」，更是**「跨系統信任」**的問題。透過標準化的協議，我們能夠在不共享密碼的前提下，安全地在不同服務間傳遞信任與權限。

### 參考資料

- [OAuth 2.0 Official Website](https://oauth.net/2/)
- [RFC 6749: The OAuth 2.0 Authorization Framework](https://datatracker.ietf.org/doc/html/rfc6749)
- [OpenID Connect Core 1.0 Specification](https://openid.net/specs/openid-connect-core-1_0.html)
- [RFC 7636: Proof Key for Code Exchange (PKCE)](https://datatracker.ietf.org/doc/html/rfc7636)
- [Auth0: Authorization Code Flow with PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce)
