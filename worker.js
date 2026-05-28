/**
 * FleetAnchor Pro — Cloudflare Worker
 * Edge-level security: rate limiting, auth header injection, CORS enforcement
 *
 * Deploy: wrangler publish
 * Route: api.yourdomain.com/* → this worker → Railway backend
 */

const BACKEND_URL = 'https://fleetanchor-api.up.railway.app';
const ALLOWED_ORIGINS = ['https://fleetanchor.com', 'https://www.fleetanchor.com'];
const WORKER_SECRET = ''; // set in wrangler.toml [vars] or Cloudflare dashboard

// Rate limit: 60 req/min per IP on API, 5 req/min on auth endpoints
const RATE_LIMITS = {
  '/api/auth/login': { max: 5, window: 60 },
  '/api/auth/forgot-password': { max: 3, window: 3600 },
  default: { max: 60, window: 60 },
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // ── CORS preflight ────────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return corsPreflightResponse(origin);
    }

    // ── Block non-allowed origins on cross-origin requests ────────────────────
    if (origin && !ALLOWED_ORIGINS.includes(origin) && !ALLOWED_ORIGINS.some(o => origin.endsWith(o.replace('https://', '')))) {
      return new Response('Forbidden', { status: 403 });
    }

    // ── Rate limiting via KV ──────────────────────────────────────────────────
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateLimitKey = getRateLimitConfig(url.pathname);
    const rateLimitResult = await checkRateLimit(env.RATE_LIMIT_KV, ip, url.pathname, rateLimitKey);

    if (!rateLimitResult.allowed) {
      return new Response(JSON.stringify({ success: false, error: 'Too many requests. Please slow down.' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimitResult.retryAfter),
          'X-RateLimit-Limit': String(rateLimitKey.max),
          'X-RateLimit-Remaining': '0',
          ...corsHeaders(origin),
        },
      });
    }

    // ── Block suspicious paths ────────────────────────────────────────────────
    const suspiciousPaths = ['/wp-admin', '/phpMyAdmin', '/.env', '/config.php', '/admin.php'];
    if (suspiciousPaths.some(p => url.pathname.includes(p))) {
      return new Response('Not Found', { status: 404 });
    }

    // ── Proxy to Railway backend ──────────────────────────────────────────────
    const backendUrl = `${BACKEND_URL}${url.pathname}${url.search}`;
    const proxyRequest = new Request(backendUrl, {
      method: request.method,
      headers: new Headers({
        ...Object.fromEntries(request.headers.entries()),
        'X-Forwarded-For': ip,
        'X-Real-IP': ip,
        'X-CF-Ray': request.headers.get('CF-Ray') || '',
        'X-Worker-Secret': WORKER_SECRET,
      }),
      body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
    });

    const response = await fetch(proxyRequest);

    // ── Add CORS and security headers to response ─────────────────────────────
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => newHeaders.set(k, v));
    newHeaders.set('X-Content-Type-Options', 'nosniff');
    newHeaders.set('X-Frame-Options', 'DENY');
    newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  },
};

function getRateLimitConfig(pathname) {
  for (const [path, config] of Object.entries(RATE_LIMITS)) {
    if (path !== 'default' && pathname.startsWith(path)) return config;
  }
  return RATE_LIMITS.default;
}

async function checkRateLimit(kv, ip, pathname, config) {
  if (!kv) return { allowed: true }; // KV not configured — allow

  const key = `rl:${ip}:${pathname.split('/').slice(0, 3).join('/')}`;
  const now = Math.floor(Date.now() / 1000);
  const windowKey = Math.floor(now / config.window);
  const fullKey = `${key}:${windowKey}`;

  try {
    const current = parseInt(await kv.get(fullKey) || '0');
    if (current >= config.max) {
      return { allowed: false, retryAfter: config.window - (now % config.window) };
    }
    await kv.put(fullKey, String(current + 1), { expirationTtl: config.window });
    return { allowed: true, remaining: config.max - current - 1 };
  } catch {
    return { allowed: true }; // fail open on KV error
  }
}

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Fingerprint',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

function corsPreflightResponse(origin) {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
