// Security regression tests: boots the real API with an in-memory stand-in for
// Prisma and probes the access rules over HTTP. No database or network needed.
// Run with `npm test`.
const path = require('path');
const Module = require('module');
const http = require('http');
const BACKEND = path.resolve(__dirname, '..');

process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'a'.repeat(40);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(40);
process.env.PAYSTACK_SECRET_KEY = 'sk_test_x';
process.env.PORT = '0';
process.env.FRONTEND_URL = 'https://anchor-fleet-pro.vercel.app';

const calls = [];
const handlers = {};
const defaults = {
  findUnique: () => null, findFirst: () => null, findMany: () => [], count: () => 0,
  create: (a) => ({ id: 'new-id', ...(a && a.data) }), update: (a) => ({ id: 'upd', ...(a && a.data) }),
  upsert: (a) => ({ id: 'ups', ...(a && a.create) }), delete: () => ({}), deleteMany: () => ({ count: 0 }),
  updateMany: () => ({ count: 0 }), aggregate: () => ({ _sum: {} }), groupBy: () => [],
};
const fakePrisma = new Proxy({}, {
  get(_, model) {
    if (model === '$transaction') return async (ops) => Promise.all(ops);
    if (model === '$connect' || model === '$disconnect') return async () => {};
    return new Proxy({}, {
      get(__, op) {
        return async (args) => {
          calls.push({ model, op, args });
          const h = handlers[`${model}.${op}`];
          return h ? h(args) : (defaults[op] || (() => null))(args);
        };
      },
    });
  },
});

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.endsWith('config/prisma') || request.endsWith('config/prisma.js')) return fakePrisma;
  if (request === '@prisma/client') return { PrismaClient: function () { return fakePrisma; } };
  if (request === 'cron') return { CronJob: function () { return { start() {} }; } };
  return origLoad.apply(this, arguments);
};
process.chdir(BACKEND);
process.env.LOG_LEVEL = 'error';
const jwt = require(path.join(BACKEND, 'node_modules/jsonwebtoken'));
const realListen = require(path.join(BACKEND, 'node_modules/express')).application.listen;
let server;
require(path.join(BACKEND, 'node_modules/express')).application.listen = function (...a) {
  server = realListen.call(this, 0, '127.0.0.1');
  return server;
};
require(path.join(BACKEND, 'src/server.js'));

function req(method, url, { token, body, headers = {}, raw } = {}) {
  return new Promise((resolve, reject) => {
    const data = raw !== undefined ? raw : body ? JSON.stringify(body) : undefined;
    const r = http.request({ host: '127.0.0.1', port: server.address().port, method, path: url,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } }, (res) => {
      let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => {
        let j = null; try { j = JSON.parse(s); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: j, text: s });
      });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

const users = {
  fm: { id: '80efc419-b337-402c-b920-2b468cbace55', email: 'fm@x.ng', role: 'FLEET_MANAGER', vendorId: 'b9bac702-7547-4b55-a552-f0c9116e1535', oemId: null, active: true },
  agent: { id: '0aeb3743-7d0e-4f87-a2ec-539a4a02332c', email: 'agent@x.ng', role: 'FIELD_AGENT', vendorId: 'b9bac702-7547-4b55-a552-f0c9116e1535', oemId: null, active: true },
  oem: { id: '14ee44fc-276d-4de2-b4f3-830b059a2b02', email: 'oem@x.ng', role: 'OEM_ADMIN', vendorId: null, oemId: '9ed0b322-6468-4af5-bfc1-5c3a93170379', active: true },
};
const tok = (u, extra = {}) => jwt.sign({ userId: u.id, role: u.role, ...extra }, process.env.JWT_SECRET, { expiresIn: '5m' });
handlers['user.findUnique'] = (a) => Object.values(users).find((u) => u.id === a.where.id || u.email === a.where.email) || null;

const results = [];
const check = (name, ok, detail) => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  → ' + detail}`);

(async () => {
  await new Promise((r) => setTimeout(r, 300));

  let r = await req('GET', '/health');
  check('server boots', r.status === 200, r.status);

  r = await req('GET', '/api/platform/settings', { headers: { Origin: 'https://evil.example' } });
  check('CORS refuses unknown site', !r.headers['access-control-allow-origin'], r.headers['access-control-allow-origin']);
  r = await req('GET', '/api/platform/settings', { headers: { Origin: 'https://anchor-fleet-pro.vercel.app' } });
  check('CORS allows the web app', r.headers['access-control-allow-origin'] === 'https://anchor-fleet-pro.vercel.app', r.headers['access-control-allow-origin']);

  r = await req('POST', '/api/setup/run', { body: { secret: 'x' } });
  check('setup route is gone', r.status === 404, r.status);

  r = await req('PATCH', `/api/users/${users.agent.id}`, { token: tok(users.agent), body: { role: 'SUPER_ADMIN' } });
  check('cannot promote yourself to SUPER_ADMIN', r.status === 403, `${r.status} ${r.text}`);

  handlers['user.findFirst'] = (a) => (a.where.id === users.fm.id ? users.fm : null);
  r = await req('PATCH', `/api/users/${users.fm.id}`, { token: tok(users.agent), body: { role: 'FIELD_AGENT' } });
  check('field agent cannot change a manager', r.status === 403, `${r.status} ${r.text}`);
  delete handlers['user.findFirst'];

  r = await req('GET', '/api/jobs', { token: tok(users.fm, { purpose: 'password_reset' }) });
  check('reset token cannot be used to sign in', r.status === 401, r.status);

  calls.length = 0;
  r = await req('GET', '/api/vehicles', { token: tok(users.oem) });
  const vq = calls.find((c) => c.model === 'vehicle' && c.op === 'findMany');
  check('OEM admin vehicle list is scoped to their OEM', r.status === 200 && JSON.stringify(vq.args.where).includes(users.oem.oemId), JSON.stringify(vq && vq.args.where));

  calls.length = 0;
  r = await req('GET', `/api/jobs/7e0a6833-12ae-4e56-a598-46356e8c9d16`, { token: tok(users.fm) });
  const jq = calls.find((c) => c.model === 'jobRequest');
  check('job lookup is scoped to the fleet', r.status === 404 && JSON.stringify(jq.args.where).includes(users.fm.vendorId), `${r.status} ${JSON.stringify(jq && jq.args.where)}`);

  r = await req('PATCH', `/api/jobs/7e0a6833-12ae-4e56-a598-46356e8c9d16/status`, { token: tok(users.fm), body: { status: 'PAYMENT_CONFIRMED' } });
  check('invalid job status rejected up front', r.status === 422 || r.status === 400, r.status);

  r = await req('POST', '/api/webhooks/paystack', { raw: '{"event":"charge.success"}', headers: { 'x-paystack-signature': 'bad' } });
  check('webhook with bad signature rejected (no crash)', r.status === 401, `${r.status} ${r.text}`);

  const crypto = require('crypto');
  const payload = JSON.stringify({ event: 'charge.success', data: { reference: 'R1', status: 'success', amount: 100, currency: 'NGN', metadata: { vendorId: users.fm.vendorId, plan: 'ENTERPRISE' }, customer: { email: 'fm@x.ng' } } });
  const sig = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(payload).digest('hex');
  calls.length = 0;
  r = await req('POST', '/api/webhooks/paystack', { raw: payload, headers: { 'x-paystack-signature': sig } });
  await new Promise((res) => setTimeout(res, 200));
  check('underpaid payment does not activate a plan', r.status === 200 && !calls.some((c) => c.model === 'subscription' && c.op === 'create'), JSON.stringify(calls.map((c) => c.model + '.' + c.op)));

  r = await req('GET', '/api/subscriptions/verify', { token: tok(users.fm) });
  check('/subscriptions/verify is reachable (needs reference)', r.status === 422 || r.status === 400, `${r.status} ${r.text}`);

  r = await req('POST', '/api/auth/forgot-password', { body: { email: 'fm@x.ng', accountType: 'vendor' } });
  check('forgot-password works (no crash)', r.status === 200, `${r.status} ${r.text}`);

  calls.length = 0;
  r = await req('POST', '/api/drivers/signup', { body: { fullName: 'Tester', phone: '+2348012345678', vehicleScan: 'ABC' } });
  check('driver signup needs a full plate/VIN', r.status === 422 || r.status === 400, r.status);
  r = await req('POST', '/api/drivers/signup', { body: { fullName: 'Tester', phone: '+2348012345678', vehicleScan: 'LAG123XY' } });
  const dq = calls.find((c) => c.model === 'vehicle' && c.op === 'findFirst');
  check('driver signup matches plates exactly', r.status === 404 && !JSON.stringify(dq.args.where).includes('contains'), JSON.stringify(dq && dq.args.where));

  r = await req('POST', '/api/auth/2fa/disable', { token: tok(users.fm), body: {} });
  check('2FA cannot be switched off with just a session', r.status === 400, r.status);

  r = await req('GET', '/api/auth/approve-reset/abc?action=approve');
  check('reset approval no longer happens on a GET', r.status === 404, r.status);

  r = await req('POST', '/api/auth/me', { token: tok(users.fm) });
  check('/auth/me works', r.status === 200, `${r.status} ${r.text}`);

  console.log(results.join('\n'));
  const failed = results.filter((x) => x.startsWith('FAIL'));
  server.close();
  console.log(`${results.length - failed.length}/${results.length} security checks passed`);
  process.exit(failed.length ? 1 : 0); // exit explicitly: background timers would keep the process alive
})().catch((e) => { console.error(e); process.exit(1); });
