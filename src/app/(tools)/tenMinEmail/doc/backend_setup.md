# Backend Setup - Ten-Minute Email (Cloudflare Workers + Upstash Redis)

This document contains the backend configuration and worker code discussed for the Ten-Minute Email tool.

## Infrastructure

- **Provider**: Cloudflare Workers
- **Database**: Upstash Redis (Serverless)
- **Email Service**: Mail.tm API

### Console Quick Access

- **Cloudflare Worker**: [temp-mail-api Settings](https://dash.cloudflare.com/64e2debb2477ccb034b9b595a1e99311/workers/services/view/temp-mail-api/production/settings)
- **Upstash Redis**: [Data Browser](https://console.upstash.com/redis/eaa2482c-a5d1-49ce-949a-50357b79870e/data-browser?teamid=0)

## Environment Variables (Cloudflare Worker)

Configure these in the Cloudflare Dashboard or `wrangler.toml`:

- `UPSTASH_REDIS_REST_URL`: Your Redis REST URL.
- `UPSTASH_REDIS_REST_TOKEN`: Your Redis REST token.

## Worker Code (Full Proxy Version)

```javascript
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const UPSTASH_URL = env.UPSTASH_REDIS_REST_URL;
    const UPSTASH_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;

    const runRedisCommand = async (command) => {
      const resp = await fetch(UPSTASH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${UPSTASH_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
      });
      return await resp.json();
    };

    // --- API Handlers ---

    // 1. Create Random Email
    if (url.pathname === "/api/create") {
      try {
        const domainsResp = await fetch("https://api.mail.tm/domains");
        const domains = await domainsResp.json();
        const domain = domains["hydra:member"][0].domain;
        const username = Math.random().toString(36).substring(2, 10);
        const password = Math.random().toString(36).substring(2, 12);
        const email = `${username}@${domain}`;

        const createAccountResp = await fetch("https://api.mail.tm/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: email, password: password }),
        });

        if (createAccountResp.status === 201) {
          // Store password in Redis with 10 mins TTL
          await runRedisCommand(["SET", `mail:${email}`, password, "EX", 600]);
          return new Response(
            JSON.stringify({
              success: true,
              email: email,
              expiresAt: Date.now() + 600000,
            }),
            { headers: CORS_HEADERS }
          );
        }
        throw new Error("Failed to create account");
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, message: e.message }),
          { status: 500, headers: CORS_HEADERS }
        );
      }
    }

    // 2. Fetch Inbox
    if (url.pathname === "/api/check") {
      const email = url.searchParams.get("email");
      if (!email)
        return new Response("Missing email", {
          status: 400,
          headers: CORS_HEADERS,
        });

      try {
        const passwordRes = await runRedisCommand(["GET", `mail:${email}`]);
        const password = passwordRes.result;
        if (!password)
          return new Response(
            JSON.stringify({ success: false, message: "Expired" }),
            { headers: CORS_HEADERS }
          );

        const tokenResp = await fetch("https://api.mail.tm/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: email, password: password }),
        });
        const { token } = await tokenResp.json();

        const msgsResp = await fetch("https://api.mail.tm/messages", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const msgs = await msgsResp.json();

        return new Response(
          JSON.stringify({
            success: true,
            inbox: msgs["hydra:member"],
          }),
          { headers: CORS_HEADERS }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, message: e.message }),
          { status: 500, headers: CORS_HEADERS }
        );
      }
    }

    // 3. Message Detail
    if (url.pathname === "/api/message-detail") {
      const email = url.searchParams.get("email");
      const msgId = url.searchParams.get("id");
      if (!email || !msgId)
        return new Response("Missing parameters", {
          status: 400,
          headers: CORS_HEADERS,
        });

      try {
        const passwordRes = await runRedisCommand(["GET", `mail:${email}`]);
        const password = passwordRes.result;
        if (!password)
          return new Response("Expired", {
            status: 401,
            headers: CORS_HEADERS,
          });

        const tokenResp = await fetch("https://api.mail.tm/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: email, password: password }),
        });
        const { token } = await tokenResp.json();

        const detailResp = await fetch(
          `https://api.mail.tm/messages/${msgId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const detail = await detailResp.json();

        return new Response(JSON.stringify({ success: true, ...detail }), {
          headers: CORS_HEADERS,
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, message: e.message }),
          { status: 500, headers: CORS_HEADERS }
        );
      }
    }

    // 4. Extend TTL
    if (url.pathname === "/api/extend") {
      const email = url.searchParams.get("email");
      if (!email)
        return new Response("Missing email", {
          status: 400,
          headers: CORS_HEADERS,
        });

      try {
        // Reset Redis TTL to another 10 mins (600s)
        await runRedisCommand(["EXPIRE", `mail:${email}`, 600]);
        return new Response(
          JSON.stringify({
            success: true,
            expiresAt: Date.now() + 600000,
          }),
          { headers: CORS_HEADERS }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, message: e.message }),
          { status: 500, headers: CORS_HEADERS }
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
```
