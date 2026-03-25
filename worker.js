/**
 * Shopline API Proxy
 * Proxies requests from GCP Cloud Functions (blocked by Shopline WAF)
 * through Cloudflare's edge network which Shopline accepts.
 *
 * Supports two modes:
 *  1. Token exchange (POST with { handle, code, appKey, timestamp, sign })
 *  2. Generic API proxy (POST with { url, method, headers, body })
 */

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Proxy-Secret",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Verify shared secret so only our Cloud Function can use this proxy
    const proxySecret = request.headers.get("X-Proxy-Secret");
    if (proxySecret !== env.PROXY_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    let targetUrl, targetMethod, targetHeaders, targetBody;

    if (body.url) {
      // Generic API proxy mode: { url, method, headers, body }
      targetUrl = body.url;
      targetMethod = body.method || "GET";
      targetHeaders = body.headers || {};
      targetBody = body.body ? JSON.stringify(body.body) : undefined;
    } else if (body.handle && body.code) {
      // Token exchange mode: { handle, code, appKey, timestamp, sign }
      const { handle, code, appKey, timestamp, sign } = body;
      if (!handle || !code || !appKey || !timestamp || !sign) {
        return new Response("Missing required fields for token exchange", { status: 400 });
      }
      targetUrl = `https://${handle}.myshopline.com/admin/oauth/token/create`;
      targetMethod = "POST";
      targetHeaders = {
        "Content-Type": "application/json",
        "appkey": appKey,
        "timestamp": timestamp,
        "sign": sign,
      };
      targetBody = JSON.stringify({ code });
    } else {
      return new Response("Invalid request: provide either 'url' or 'handle+code'", { status: 400 });
    }

    const shoplineResponse = await fetch(targetUrl, {
      method: targetMethod,
      headers: {
        "Content-Type": "application/json",
        ...targetHeaders,
      },
      body: targetMethod !== "GET" ? targetBody : undefined,
    });

    const responseText = await shoplineResponse.text();

    return new Response(responseText, {
      status: shoplineResponse.status,
      headers: {
        "Content-Type": shoplineResponse.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};
