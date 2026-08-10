interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  ALLOWED_ORIGINS?: string;
}

interface ExchangeBody {
  code?: string;
  redirectUri?: string;
}

interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

const defaultOrigins = [
  "https://jinyong-jeong.github.io",
  "http://localhost:4321",
  "http://127.0.0.1:4321"
];

function json(data: unknown, status: number, origin?: string) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff"
  });

  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Vary", "Origin");
  }

  return new Response(JSON.stringify(data), { status, headers });
}

function allowedOrigins(env: Env) {
  return (env.ALLOWED_ORIGINS?.split(",") ?? defaultOrigins)
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function getAllowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get("Origin")?.replace(/\/+$/, "");
  return origin && allowedOrigins(env).includes(origin) ? origin : undefined;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = getAllowedOrigin(request, env);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true }, 200);
    }

    if (request.method === "OPTIONS") {
      if (!origin) return json({ error: "origin_not_allowed" }, 403);
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin"
        }
      });
    }

    if (request.method !== "POST" || url.pathname !== "/oauth/exchange") {
      return json({ error: "not_found" }, 404, origin);
    }

    if (!origin) return json({ error: "origin_not_allowed" }, 403);
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return json({ error: "server_not_configured" }, 503, origin);
    }

    let body: ExchangeBody;
    try {
      body = (await request.json()) as ExchangeBody;
    } catch {
      return json({ error: "invalid_json" }, 400, origin);
    }

    const code = body.code?.trim();
    if (!code || code.length > 512) {
      return json({ error: "invalid_code" }, 400, origin);
    }

    const expectedRedirectUri = `${origin}/admin/`;
    if (body.redirectUri !== expectedRedirectUri) {
      return json({ error: "invalid_redirect_uri" }, 400, origin);
    }

    const githubResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "jinyong-blog-admin-auth"
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: expectedRedirectUri
        })
      }
    );
    const result = (await githubResponse.json()) as GitHubTokenResponse;

    if (!githubResponse.ok || !result.access_token) {
      return json(
        {
          error: result.error ?? "github_exchange_failed",
          error_description:
            result.error_description ?? "GitHub가 로그인 요청을 거부했습니다."
        },
        400,
        origin
      );
    }

    return json(
      {
        access_token: result.access_token,
        token_type: result.token_type ?? "bearer",
        scope: result.scope ?? ""
      },
      200,
      origin
    );
  }
} satisfies ExportedHandler<Env>;
