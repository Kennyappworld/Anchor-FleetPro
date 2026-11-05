const net = require('net');

// The web app reaches the API through Vercel (/api rewrite), so the connecting
// address is Vercel's, shared by every user. Vercel puts the visitor's real
// address first in X-Forwarded-For (and overwrites anything the visitor sent),
// so rate limits key on that. A caller hitting the API directly can fake it,
// which only gives them their own bucket — the per-account login limit still
// applies to them.
module.exports = function clientIp(req) {
  const first = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return net.isIP(first) ? first : req.ip;
};
