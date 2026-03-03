---
title: "JWT 是什麼？用一張門票帶你看懂登入背後的秘密"
date: "2026-03-03"
author: "子yee"
description: "深入解析 JSON Web Token (JWT) 的運作原理、結構、安全考量與最佳實踐，並以演唱會門票為比喻，帶您輕鬆理解現代網路應用程式的身份驗證機制。"
category: "Security"
tags:
  [
    "JWT",
    "JSON Web Token",
    "Authentication",
    "Authorization",
    "Security",
    "Web Development",
    "API Security",
  ]
---

## 1. 導言：登入的本質與一張特殊的「門票」

在現代網路應用程式中，使用者登入後如何維持其身份狀態，並安全地存取受保護的資源，是一個核心且複雜的議題。傳統上，我們可能依賴 `Session` 機制，但隨著分散式系統、微服務架構以及行動應用程式的興起，`Session` 的局限性日益凸顯。此時，**JSON Web Token (JWT)** [1] 應運而生，成為解決這些挑戰的強大工具。

想像一下，您買了一張熱門演唱會的門票。這張門票不僅證明了您是合法觀眾，上面還印有您的座位號、入場時間等資訊，並且有防偽標誌。您不需要每次進入不同區域都重新驗證身份，只需出示這張門票，工作人員就能快速確認您的權限。JWT 的運作原理，就如同這張演唱會門票，它是一種**「緊湊 (Compact)」**、**「URL 安全 (URL-safe)」**且**「自包含 (Self-contained)」**的方式，用於在不同方之間安全地傳輸資訊。

本文將以資深軟體架構師的視角，深入淺出地剖析 JWT 的核心概念、結構、運作流程、安全考量與最佳實踐，並透過「演唱會門票」的比喻，幫助您徹底理解這個在現代網路安全中不可或缺的技術。

## 2. 為什麼需要 JWT？從 Session 到 Token 的演進

在深入 JWT 之前，讓我們先回顧一下傳統的身份驗證方式及其面臨的挑戰：

### 2.1 傳統 Session-based 身份驗證

在 `Session` 機制中，當使用者登入成功後，伺服器會在內部儲存一個 `Session` 物件，其中包含使用者的身份資訊。伺服器會生成一個唯一的 `Session ID`，並將其透過 `Cookie` 發送給瀏覽器。之後每次請求，瀏覽器都會攜帶這個 `Session ID`，伺服器再根據 `Session ID` 找到對應的 `Session` 物件，從而識別使用者。

**優點：**

- 伺服器端可以控制 `Session` 的生命週期，隨時使其失效。
- 敏感資訊儲存在伺服器端，相對安全。

**缺點：**

- **擴展性問題 (Scalability Issues)**：在分散式系統或負載平衡環境中，需要共享 `Session` 狀態（例如使用 Redis 等外部儲存），增加了系統複雜度。
- **跨域問題 (CORS Issues)**：Cookie 受到同源政策 (Same-Origin Policy) 與 `SameSite` 屬性限制，使跨網域身份共享變得複雜。CORS (Cross-Origin Resource Sharing) 則是瀏覽器對跨來源 HTTP 請求的一種安全機制，兩者概念不同但常被混淆。
- **行動應用支援不足 (Mobile App Challenges)**：行動應用程式通常不依賴 `Cookie`，需要額外的機制來處理 `Session ID`。

### 2.2 無狀態 (Stateless) 的 Token 身份驗證

JWT 引入了**無狀態 (Stateless)** 的概念。伺服器不再需要儲存使用者的 `Session` 狀態。當使用者登入成功後，伺服器會生成一個 JWT 並發送給客戶端。客戶端（例如瀏覽器或行動應用）會將這個 JWT 儲存起來（例如在 `localStorage` 或 `Cookie` 中），並在之後的每次請求中，將 JWT 放在 `HTTP Header` (通常是 `Authorization: Bearer <token>`) 中發送給伺服器。

伺服器接收到 JWT 後，會驗證其簽名，並解析出其中的使用者資訊。在理想的純無狀態設計中，此時無需查詢資料庫即可完成身份驗證；但實務上，為了檢查使用者是否被停權、角色是否更新或 Token 是否在黑名單中，可能仍需額外查詢資料庫或外部儲存。這種無狀態的特性，極大地簡化了分散式系統的設計，提升了系統的擴展性。

## 3. JWT 的結構拆解：門票的 Header, Payload 與 Signature

一個 JWT 實際上是一個由三個部分組成的字串，每個部分都經過 Base64Url 編碼，並用點 `.` 分隔：`Header.Payload.Signature` [3]。

### 3.1 Header (頭部)：門票的材質與驗證方式

`Header` 通常包含兩部分資訊：

- `typ` (Type)：表示這個 Token 的類型，通常是 `JWT`。
- `alg` (Algorithm)：表示簽名所使用的演算法，例如 `HMAC SHA256` 或 `RSA`。

**範例：**

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

這個 `Header` 會被 Base64Url 編碼。

### 3.2 Payload (負載)：門票上的個人資訊與權限

`Payload` 包含了**「聲明 (Claims)」**，這些聲明是關於實體（通常是使用者）的資訊以及其他元數據。聲明分為三種類型：

- **註冊聲明 (Registered Claims)**：預定義的聲明，非強制性但建議使用，例如：

  - `iss` (Issuer)：簽發者。
  - `exp` (Expiration Time)：過期時間戳。
  - `sub` (Subject)：主題，通常是使用者 ID。
  - `aud` (Audience)：接收者。
  - `iat` (Issued At)：簽發時間戳。

- **公開聲明 (Public Claims)**：為 JWT 使用者定義的聲明，應在 [IANA JSON Web Token Registry](https://www.iana.org/assignments/jwt/jwt.xhtml) 中註冊，或定義為 URI。

- **私有聲明 (Private Claims)**：自定義的聲明，用於在同意使用 JWT 的各方之間共享資訊。例如，您可以添加 `user_role` 或 `company_id` 等資訊。

**範例：**

```json
{
  "sub": "1234567890",
  "name": "John Doe",
  "user_role": "admin",
  "iat": 1516239022,
  "exp": 1516242622
}
```

這個 `Payload` 也會被 Base64Url 編碼。

### 3.3 Signature (簽名)：門票的防偽標誌

`Signature` 是 JWT 安全性的核心。它用於驗證 Token 的發送者，並確保 Token 在傳輸過程中沒有被篡改。簽名是透過以下方式生成的：

1. 將 Base64Url 編碼後的 `Header` 和 `Payload` 用點 `.` 連接起來。
2. 使用 Header 中指定的演算法 (例如 HS256)，並配合一個只有伺服器知道的「密鑰 (Secret Key)」，對連接後的字串進行**簽名運算**，產生用於驗證完整性的數位簽章。本文討論的是「JWS (JSON Web Signature)」形式的 JWT，而非加密型 JWE (JSON Web Encryption)。

**簽名計算公式：**

```
HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  secret
)
```

**重要提示：** JWT 的 `Header` 和 `Payload` 只是經過 Base64Url 編碼，**並非加密**。這意味著任何人都可以在沒有密鑰的情況下解碼這些資訊。因此，**絕對不要在 `Payload` 中放置任何敏感資訊** [4]。`Signature` 的作用是確保這些資訊在傳輸過程中沒有被惡意修改。

## 4. JWT 的運作流程：從入場到驗證

現在，讓我們將 JWT 的三個部分串聯起來，看看它在實際應用中是如何運作的：

1.  **使用者登入 (User Login)**：使用者輸入帳號密碼，發送登入請求到認證伺服器 (Authentication Server)。
2.  **生成 JWT (JWT Generation)**：認證伺服器驗證使用者憑證。如果驗證成功，伺服器會根據使用者資訊和預設的演算法、密鑰，生成一個 JWT。
3.  **發送 JWT (JWT Issuance)**：認證伺服器將生成的 JWT 發送給客戶端。客戶端通常會將其儲存在 `localStorage` 或 `Cookie` 中。
4.  **存取受保護資源 (Access Protected Resources)**：客戶端在之後的每次請求中，都會將 JWT 放在 `Authorization: Bearer <token>` 頭部發送給資源伺服器 (Resource Server)。
5.  **驗證 JWT (JWT Verification)**：資源伺服器接收到請求後，會：
    a. 檢查 JWT 的格式是否正確。
    b. 使用相同的演算法和密鑰，重新計算簽名，並與收到的簽名進行比對，確保 Token 未被篡改。
    c. 解析 `Payload`，檢查 `exp` (過期時間) 等聲明，確保 Token 仍在有效期內。
    d. 根據 `Payload` 中的使用者資訊和權限，判斷使用者是否有權存取該資源。
6.  **響應資源 (Resource Response)**：如果 JWT 驗證成功且權限足夠，資源伺服器會返回請求的資源；否則，返回錯誤訊息（例如 401 Unauthorized 或 403 Forbidden）。

這個流程確保了每次請求都是無狀態的，資源伺服器無需查詢資料庫即可完成身份驗證和授權判斷。

## 5. 安全實踐與風險控管：保護您的「門票」

儘管 JWT 提供了強大的安全性，但如果使用不當，仍然可能引入安全漏洞。以下是一些重要的安全實踐和風險控管建議 [5] [6]：

### 5.1 密鑰管理 (Secret Key Management)

- **強密鑰**：使用足夠長且複雜的密鑰。對於 `HS256`，建議至少 32 位元組的隨機字串。
- **安全儲存**：密鑰必須安全地儲存在伺服器端，絕不能洩露給客戶端或版本控制系統。
- **定期輪換**：定期更換密鑰，以降低潛在洩露的風險。

### 5.2 Token 的生命週期管理 (Token Lifecycle Management)

- **短生命週期**：`Access Token` 應設定較短的過期時間（例如 15 分鐘到數小時），以降低被盜用後的風險。
- **Refresh Token (刷新令牌)**：對於需要長時間登入的應用，可以使用 `Refresh Token`。`Refresh Token` 的生命週期較長，用於在 `Access Token` 過期後，向認證伺服器換取新的 `Access Token`。`建議採用 **Refresh Token Rotation (旋轉式刷新令牌)** 機制，使 `Refresh Token`只能使用一次，以降低被盜用風險。在這種機制下，每次使用`Refresh Token`換取新的`Access Token`時，也會同時發放一個新的`Refresh Token`，並使舊的 `Refresh Token` 失效。`Refresh Token`應儲存在更安全的地方（例如設定`HttpOnly`與`Secure`屬性的`Cookie` 中）。
- **黑名單機制 (Blacklisting)**：JWT 本質上是無狀態的，若未引入額外機制，伺服器無法主動撤銷已簽發的 Token。如果需要強制登出或撤銷 Token，需要實作黑名單機制，將失效的 Token 儲存在伺服器端（例如 Redis），每次驗證時檢查。

### 5.3 Token 儲存位置 (Token Storage)

- **Access Token**：由於 `Access Token` 的生命週期較短，且頻繁用於 API 請求，建議將其儲存在**記憶體 (in-memory)** 中，避免儲存在 `localStorage` 或 `sessionStorage`，以降低被 XSS (Cross-Site Scripting) 攻擊竊取的風險。當使用者關閉瀏覽器或頁面時，`Access Token` 也會隨之清除。
- **Refresh Token**：`Refresh Token` 由於生命週期較長，且用於換取新的 `Access Token`，其安全性更為重要。建議將其儲存在設定了 `HttpOnly` 和 `Secure` 屬性的 `Cookie` 中。`HttpOnly` 屬性可以防止 JavaScript 讀取 `Cookie`，有效防禦 XSS 攻擊；`Secure` 屬性則確保 `Cookie` 只在 HTTPS 連線下傳輸。

### 5.4 傳輸安全 (Transmission Security)

- **始終使用 HTTPS**：確保 JWT 在客戶端和伺服器之間傳輸時是加密的，防止中間人攻擊 (Man-in-the-Middle Attack)。

### 5.5 聲明 (Claims) 的使用

- **避免敏感資訊**：`Payload` 內容是可讀的，切勿放置密碼、個人身份證號碼等敏感資訊。
- \*\*驗證聲明：伺服器端在驗證 JWT 時，除了簽名，還應嚴格驗證 `exp` (過期時間) 和 `nbf` (Not Before) 以防止過期重用，以及 `iss` (簽發者) 和 `aud` (接收者) 以防止跨系統濫用。若需進一步防止重放攻擊 (Replay Attack)，可使用 `jti` (JWT ID) 並搭配伺服器端追蹤機制，確保每個 Token 只能被使用一次。

### 5.6 演算法選擇 (Algorithm Selection)

- **避免 `none` 演算法**：某些 JWT 函式庫支援 `alg: "none"`，這表示 Token 沒有簽名。惡意使用者可以利用此漏洞偽造 Token。伺服器端必須明確拒絕 `none` 演算法的 Token。
- \***\*使用強簽章演算法**：優先使用 HS256、RS256 等業界推薦的強簽章演算法。

## 6. 程式範例：使用 Node.js 實作 JWT

以下是一個使用 Node.js 搭配 `jsonwebtoken` 函式庫來生成和驗證 JWT 的簡單範例。

### 6.1 安裝函式庫

```bash
npm install jsonwebtoken
```

### 6.2 生成 JWT (Server-side)

```javascript
// server.js (部分程式碼)
const jwt = require("jsonwebtoken");

// 建議從環境變數中讀取密鑰，絕不硬編碼在程式碼中
if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not defined. Please set it in your environment variables."
  );
}
const JWT_SECRET = process.env.JWT_SECRET;

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "1h" } // 設定 Access Token 1 小時後過期
  );
}

// 模擬使用者登入
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  // 實際應用中應驗證帳號密碼
  if (username === "admin" && password === "password") {
    const user = { id: 1, username: "admin", role: "admin" };
    const accessToken = generateAccessToken(user);
    res.json({ accessToken: accessToken });
  } else {
    res.status(401).send("Invalid credentials");
  }
});
```

### 6.3 驗證 JWT (Server-side Middleware)

```javascript
// server.js (部分程式碼)
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (token == null) return res.sendStatus(401); // 如果沒有 Token，返回 401 Unauthorized

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403); // Token 無效或過期，返回 403 Forbidden
    req.user = user; // 將解析出的使用者資訊附加到請求物件上
    next(); // 繼續處理下一個 middleware 或路由
  });
}

// 保護的路由
app.get("/protected", authenticateToken, (req, res) => {
  res.json({
    message: `歡迎 ${req.user.username} (${req.user.role})，您已成功存取受保護資源！`,
  });
});
```

## 7. 總結：一張門票，無限可能

JWT 作為一種輕量級、無狀態的身份驗證和資訊交換機制，已經成為現代網路應用程式開發的基石。它解決了傳統 `Session` 機制在擴展性、跨域和行動應用支援上的痛點，為分散式系統和 API 安全提供了優雅的解決方案。

透過「演唱會門票」的比喻，我們理解了 JWT 的 `Header`、`Payload` 和 `Signature` 各自扮演的角色，以及它們如何共同確保資訊的完整性和來源的可靠性。然而，強大的工具也伴隨著使用的責任。正確地管理密鑰、設定合理的生命週期、使用 HTTPS 以及嚴格驗證聲明，是確保 JWT 安全的關鍵。

掌握 JWT，您就掌握了現代網路應用程式身份驗證的秘密。這張「門票」將帶領您的應用程式，安全、高效地穿梭於數位世界的每一個角落。

---

**參考資料**

- [1] jwt.io. (n.d.). _JSON Web Token Introduction_. Retrieved from [https://jwt.io/introduction](https://jwt.io/introduction)
- [2] Auth0 Docs. (n.d.). _JSON Web Tokens_. Retrieved from [https://auth0.com/docs/secure/tokens/json-web-tokens](https://auth0.com/docs/secure/tokens/json-web-tokens)
- [3] Scalekit. (2024, September 2). _Guide to Understanding JSON Web Tokens (JWT) for Devs_. Retrieved from [https://www.scalekit.com/blog/json-web-tokens-guide-for-developers](https://www.scalekit.com/blog/json-web-tokens-guide-for-developers)
- [4] FreeCodeCamp. (2025, July 7). _What Are JSON Web Tokens (JWT)?_. Retrieved from [https://www.freecodecamp.org/news/what-are-json-web-tokens-jwt/](https://www.freecodecamp.org/news/what-are-json-web-tokens-jwt/)
- [5] Curity. (2024, July 23). _JWT Security Best Practices: Checklist for APIs_. Retrieved from [https://curity.io/resources/learn/jwt-best-practices/](https://curity.io/resources/learn/jwt-best-practices/)
- [6] Vaadata. (2025, April 30). _JWT: Vulnerabilities, Attacks & Security Best Practices_. Retrieved from [https://www.vaadata.com/blog/jwt-json-web-token-vulnerabilities-common-attacks-and-security-best-practices/](https://www.vaadata.com/blog/jwt-json-web-token-vulnerabilities-common-attacks-and-security-best-practices/)
