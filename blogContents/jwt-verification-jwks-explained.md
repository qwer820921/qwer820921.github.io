---
title: "JWT 驗證原理與 JWKS 機制完整解析：為什麼後端不能只靠 jwt.decode 保證安全？"
date: "2026-03-03"
author: "子yee"
description: "拿到 Token 後，後端該如何正確且安全地驗證？本文深入探討 JWT 的簽名驗證流程、RS256 與 HS256 的差異，以及現代分散式架構中不可或缺的 JWKS 公鑰分發機制，並揭示為什麼單純使用 jwt.decode 是不安全的。"
category: "Security"
tags: ["JWT", "JWKS", "Security", "Backend", "Authentication", "Architecture"]
---

## 前言：驗證 Token 的第一步，你做對了嗎？

在上一篇文章中，我們討論了如何透過 OAuth2 與 OIDC 流程取得 Access Token 與 ID Token。然而，對於後端工程師來說，真正的挑戰才剛開始：**當 Client 在 Header 帶上 `Authorization: Bearer <token>` 請求 API 時，你的伺服器該如何確保這個 Token 是合法且未經竄改的？**

很多初學者會直接使用 `jwt.decode()` 取得內容，但這完全沒有驗證簽名，Payload 很容易被偽造。在架構師眼中，這是極其危險的行為。本文將帶你深入 JWT 的驗證核心，並解析現代架構如何透過 **JWKS (JSON Web Key Set)** 實現優雅且安全的公鑰管理。

---

## 1. JWT 如何驗證？從「信任」談起

JWT (JSON Web Token) 的核心價值在於其**自包含 (Self-contained)** 的特性。它可以在不查資料庫的情況下驗證簽名，但這僅保證 Token 未被竄改，無法反映使用者最新狀態或是否已被撤銷。

### 為什麼不能只用 `jwt.decode`？

`jwt.decode` 僅僅是將 Base64 編碼的字串轉回 JSON 格式。任何人都可以偽造一個 JWT 並在 Payload 中宣稱自己是 `admin`。

> **核心原則**：在驗證簽名之前，Payload 中的任何資訊都是不可信的。

### RS256 vs. HS256：對稱與非對稱的博弈

| 特性         | HS256 (HMAC with SHA-256)                       | RS256 (RSA Signature with SHA-256)                    |
| :----------- | :---------------------------------------------- | :---------------------------------------------------- |
| **簽名類型** | 對稱簽名                                        | 非對稱簽名                                            |
| **密鑰管理** | 簽發者與驗證者共享同一個 **Secret**             | 簽發者持有 **Private Key**，驗證者持有 **Public Key** |
| **安全性**   | 若驗證端被攻破，Secret 外洩，攻擊者可偽造 Token | 驗證端只有 Public Key，即使外洩也無法偽造 Token       |
| **適用場景** | 單一服務內部驗證                                | 跨服務、分散式架構（如 OIDC）                         |

### Signature 驗證流程

1. **拆解**：將 JWT 拆分為 Header, Payload, Signature。
2. **重組**：將 Header 與 Payload 進行 Base64URL 編碼後重新組合。
3. **計算**：使用指定的演算法與金鑰對重組後的內容進行雜湊計算。
4. **比對**：將計算結果與 JWT 帶有的 Signature 進行比對。

---

## 2. JWKS 是什麼？公鑰分發的標準化方案

在 RS256 演算法下，後端需要「公鑰」來驗證簽名。但在微服務架構中，如果每個服務都手動存一份公鑰檔案，當金鑰輪轉（Key Rotation）時，將會是一場運維災難。**JWKS (JSON Web Key Set)** 正是為了解決這個問題。

### /.well-known/jwks.json

根據 [RFC 7517](https://datatracker.ietf.org/doc/html/rfc7517)，授權伺服器會公開一個端點（通常是 `https://domain/.well-known/jwks.json`），回傳一個包含多組公鑰的 JSON 物件。

### JWKS 範例結構

```json
{
  "keys": [
    {
      "alg": "RS256",
      "kty": "RSA",
      "use": "sig",
      "n": "vMy6...",
      "e": "AQAB",
      "kid": "key-id-2026-01",
      "x5c": ["..."] // x5c 包含 X.509 證書鏈（可用於驗證公鑰）；若無 x5c，可使用 n (modulus) 與 e (exponent) 生成公鑰
    }
  ]
}
```

### 關鍵欄位解析：`kid` 的用途

`kid` (Key ID) 是 JWT Header 中的一個選擇性欄位。在 OIDC/OAuth2 實務中，它通常是必填的。它的作用是：**告訴驗證者，請去 JWKS 列表中尋找 ID 相同的公鑰來驗證我。** 這使得授權伺服器可以同時並存多組金鑰，實現平滑的 **Key Rotation**（新舊金鑰交替）。若 JWT Header 中沒有 `kid`，Client 需自行判斷使用哪個金鑰進行驗證。

---

## 3. 後端驗證的完整流程：架構師的標準實作

一個嚴謹的後端 JWT 驗證流程應包含以下步驟：

### 第一階段：取得與解析

1. **取得 Token**：從 `Authorization` Header 中提取 Bearer Token。
2. **解析 Header**：使用 `jwt.decode(token, { complete: true })` 取得 Header 中的 `kid` 與 `alg`。

**注意：此時不驗證簽名，僅為獲取元數據。**

務必確保你的 JWT 函式庫配置為**不允許 `alg: none`**，並建議使用「允許的演算法白名單」來更精確地防範演算法攻擊。

### 第二階段：金鑰獲取

3. **比對快取**：檢查本地快取中是否有對應該 `kid` 的公鑰。**為了避免每次驗證都發送網路請求，應實作 JWKS 快取機制，並設定適當的 TTL (Time-To-Live) 與失效刷新策略。快取 JWKS 時，也建議監控 HTTP Cache-Control 與 max-age，以遵循授權伺服器建議。**
4. **請求 JWKS**（若快取失效）：向 `jwks_uri` 請求最新的金鑰集，並更新快取。

### 第三階段：安全性驗證

5. **驗證簽名 (Signature)**：使用公鑰與 `alg` 驗證 Token 完整性。
6. **驗證標準聲明 (Standard Claims)**：
   - **`exp` (Expiration)**：檢查 Token 是否已過期。
   - **`nbf` (Not Before)**：檢查 Token 是否在生效時間之前被使用。
   - **`iat` (Issued At)**：檢查 Token 的簽發時間。
   - **`iss` (Issuer)**：檢查簽發者是否為可信任的來源。
   - **`aud` (Audience)**：檢查該 Token 是否真的是發給「本服務」使用的。

> **安全性提醒**：即使簽名合法，也應檢查 `nbf`/`iat` 與 `exp`，防止舊 Token 被重放（Replay Attack）。

> **架構師提示**：永遠不要跳過 `aud` 驗證。**否則**，如果攻擊者拿 A 服務的 Token 去請求 B 服務，而 B 服務沒檢查 `aud`，這將導致權限提升攻擊。

---

## 總結：公鑰驗證是現代安全架構的基石

為什麼後端不能只用 `jwt.decode`？因為在分散式系統中，**「驗證」的本質是確認「信任鏈」的完整性**。

透過 **RS256 + JWKS**，我們實現了：

1. **解耦**：後端服務不需要預先持有私鑰，甚至不需要手動管理公鑰檔案。
2. \*\*動態性：支援金鑰輪轉（Key Rotation），提升系統的長期安全性。。
3. **標準化**：遵循 RFC 規範，讓不同語言撰寫的服務都能無縫整合。

### 參考資料

- [RFC 7519: JSON Web Token (JWT)](https://datatracker.ietf.org/doc/html/rfc7519)
- [RFC 7517: JSON Web Key (JWK)](https://datatracker.ietf.org/doc/html/rfc7517)
- [Curity: JWT Security Best Practices](https://curity.io/resources/learn/jwt-best-practices/)
- [Auth0: Understanding JWKS](https://auth0.com/docs/secure/tokens/json-web-tokens/json-web-key-sets)
- [JWT.io: Introduction to JSON Web Tokens](https://jwt.io/introduction/)
