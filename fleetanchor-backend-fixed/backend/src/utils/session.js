// Refresh tokens for the web app live in an httpOnly cookie, so page scripts
// (and anything injected into them) can never read them. The web app talks to
// the API through its own domain (vercel.json rewrites /api → this server), so
// the cookie is first-party and can be SameSite=Strict.
//
// The driver app (React Native) has no cookie jar; it sends
// "X-Token-Transport: body" and keeps receiving the refresh token in the body.

const COOKIE = 'fa_rt';
const MAX_AGE = 7 * 24 * 60 * 60; // seconds — matches JWT_REFRESH_EXPIRES_IN default

const cookieBase = `Path=/api/auth; HttpOnly; Secure; SameSite=Strict`;

function setRefreshCookie(res, token) {
  res.append('Set-Cookie', `${COOKIE}=${token}; ${cookieBase}; Max-Age=${MAX_AGE}`);
}

function clearRefreshCookie(res) {
  res.append('Set-Cookie', `${COOKIE}=; ${cookieBase}; Max-Age=0`);
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

const wantsBodyTokens = (req) => String(req.get('x-token-transport') || '').toLowerCase() === 'body';

// The refresh token presented by this client: body (driver app, or a one-time
// hand-over from an older web session) or the cookie.
function readRefresh(req) {
  const b = req.body && typeof req.body.refreshToken === 'string' ? req.body.refreshToken : null;
  return b || readCookie(req, COOKIE);
}

// Puts the refresh token in the cookie and returns what may go in the JSON body.
function deliverTokens(req, res, { accessToken, refreshToken }) {
  setRefreshCookie(res, refreshToken);
  return wantsBodyTokens(req) ? { accessToken, refreshToken } : { accessToken };
}

module.exports = { COOKIE, setRefreshCookie, clearRefreshCookie, readCookie, readRefresh, deliverTokens, wantsBodyTokens };
