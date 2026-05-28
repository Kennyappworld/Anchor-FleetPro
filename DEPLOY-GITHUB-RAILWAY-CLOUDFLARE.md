# FleetAnchor Pro — GitHub · Railway · Cloudflare Deployment Guide

## Architecture after deployment

```
Users → Cloudflare (DDoS / WAF / CDN)
           ├── yourdomain.com      → Cloudflare Pages (React frontend)
           └── api.yourdomain.com  → Cloudflare Worker → Railway (Node.js API)
                                                              └── Railway PostgreSQL
                                                              └── Railway Redis
```

---

## PART 1 — GitHub Setup

### 1.1 Create the repository

```bash
# On GitHub.com: New repository → fleetanchor-pro → Private → Create

cd /path/to/fleetanchor
git init
git add .
git commit -m "feat: initial FleetAnchor Pro codebase"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/fleetanchor-pro.git
git push -u origin main
```

### 1.2 Branch strategy

```bash
# Create develop branch for staging
git checkout -b develop
git push origin develop

# Feature branches: git checkout -b feat/your-feature
# PRs always merge to develop first, then develop → main triggers production deploy
```

### 1.3 Add GitHub Secrets

Go to: **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

Add each of these:

| Secret name | Where to get it |
|---|---|
| `RAILWAY_TOKEN` | Railway dashboard → Account → Tokens |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create Token (use "Edit Cloudflare Workers" template, add "Cloudflare Pages: Edit" permission) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right sidebar |
| `VITE_API_URL` | Your Railway backend URL, e.g. `https://fleetanchor-api.up.railway.app` |
| `VITE_PAYSTACK_PUBLIC_KEY` | Paystack dashboard → Settings → API Keys |

---

## PART 2 — Railway Setup (Backend + Database)

### 2.1 Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Choose **Empty Project**
3. Name it `fleetanchor-pro`

### 2.2 Add PostgreSQL database

In the Railway project:
1. Click **+ New** → **Database** → **PostgreSQL**
2. Railway auto-creates `DATABASE_URL` — it will be injected into your backend automatically

### 2.3 Add Redis

1. Click **+ New** → **Database** → **Redis**
2. Railway auto-creates `REDIS_URL` — injected automatically

### 2.4 Deploy the backend service

1. Click **+ New** → **GitHub Repo**
2. Select `fleetanchor-pro`
3. Set **Root Directory** to `backend`
4. Railway detects `nixpacks.toml` and builds correctly

### 2.5 Set backend environment variables

In Railway: **fleetanchor-api service → Variables → Raw Editor** — paste all of these:

```env
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://yourdomain.com

JWT_SECRET=<generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_REFRESH_SECRET=<generate different one>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

PAYSTACK_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY=pk_live_xxxxxxxxxxxxxxxxxxxx

SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=FleetAnchor Pro

AWS_ACCESS_KEY_ID=AKIAXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxx
AWS_S3_BUCKET=fleetanchor-backups-prod
AWS_REGION=eu-west-1

GPG_RECIPIENT_EMAIL=backups@yourdomain.com
GPG_PUBLIC_KEY_B64=<base64 encoded GPG public key>

SUPER_ADMIN_EMAIL=admin@yourdomain.com
SUPER_ADMIN_PASSWORD=<strong password — change after first login>

LOG_LEVEL=info
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
AUTH_RATE_LIMIT_MAX=10
```

> DATABASE_URL and REDIS_URL are injected automatically by Railway — do not add them manually.

### 2.6 Run database seed (first time only)

After the first successful deploy:

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login

# Link to your project
railway link  # select fleetanchor-pro → fleetanchor-api

# Run the seed
railway run node prisma/seed.js
```

It will print your Super Admin credentials. **Log in and change the password immediately.**

### 2.7 Set custom domain on Railway

Railway service → **Settings → Domains → Add Custom Domain**:
- Add `api.yourdomain.com`
- Railway gives you a CNAME target — add it in Cloudflare DNS (see Part 3)

---

## PART 3 — Cloudflare Setup

### 3.1 Add your domain to Cloudflare

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Add a Site** → enter `yourdomain.com`
2. Choose the **Free** plan (sufficient)
3. Cloudflare shows you 2 nameservers — update them at your domain registrar
4. Wait for propagation (5–30 minutes)

### 3.2 DNS records

In Cloudflare DNS, add:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | `www` | `yourdomain.com` | ✅ Proxied |
| CNAME | `api` | `<your-railway-cname>.railway.app` | ✅ Proxied |

The `@` / root record for `yourdomain.com` is handled by Cloudflare Pages (see 3.4).

### 3.3 SSL/TLS settings

Cloudflare dashboard → **SSL/TLS**:
- Mode: **Full (strict)**
- Edge Certificates → Always Use HTTPS: **ON**
- Minimum TLS Version: **TLS 1.2**
- Automatic HTTPS Rewrites: **ON**

### 3.4 Deploy frontend to Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages**
2. Connect to GitHub → select `fleetanchor-pro`
3. Configure build:

| Setting | Value |
|---------|-------|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `frontend` |
| Node.js version | `20` |

4. Add environment variables (Production):

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://api.yourdomain.com` |
| `VITE_PAYSTACK_PUBLIC_KEY` | `pk_live_xxxxxxxxxxxx` |
| `VITE_APP_NAME` | `FleetAnchor Pro` |

5. Deploy → Cloudflare Pages gives you a `*.pages.dev` URL first
6. Add custom domain: Pages project → **Custom domains** → `yourdomain.com` and `www.yourdomain.com`

### 3.5 Deploy Cloudflare Worker (API proxy + edge rate limiting)

```bash
# Install Wrangler CLI
npm install -g wrangler
wrangler login

# Navigate to the worker directory
cd cloudflare/

# Create KV namespace for rate limiting
wrangler kv:namespace create RATE_LIMIT_KV
# → Copy the "id" output into wrangler.toml under [[kv_namespaces]]

wrangler kv:namespace create RATE_LIMIT_KV --preview
# → Copy the "id" into preview_id in wrangler.toml

# Edit wrangler.toml: replace yourdomain.com and paste KV namespace IDs
nano wrangler.toml

# Set the worker secret
wrangler secret put WORKER_SECRET
# Enter a random strong string

# Deploy
wrangler deploy

# Verify
curl https://api.yourdomain.com/health
```

### 3.6 Cloudflare WAF Rules (Security → WAF)

Add these custom rules:

**Rule 1 — Block credential stuffing on login:**
```
(http.request.uri.path eq "/api/auth/login" and http.request.method eq "POST" and cf.threat_score gt 10)
→ Action: Block
```

**Rule 2 — Challenge suspicious countries (adjust to your needs):**
```
(ip.geoip.country in {"CN" "RU" "KP"} and not ip.geoip.country in {"NG" "GH" "KE" "ZA"})
→ Action: JS Challenge
```

**Rule 3 — Protect admin routes:**
```
(http.request.uri.path contains "/api/admin" and not http.request.headers["X-Worker-Secret"][*] eq "your-worker-secret")
→ Action: Block
```

### 3.7 Cloudflare Security Settings

- **Security → Bots → Bot Fight Mode**: ON
- **Security → DDoS**: HTTP DDoS Attack Protection: **High**
- **Speed → Optimization → Rocket Loader**: ON (speeds up JS)
- **Caching → Cache Rules**: Add rule for `/*.js` and `/*.css` with **Cache Everything** (TTL 1 year)

### 3.8 Configure Paystack Webhook

In Paystack dashboard → Settings → Webhooks:
- URL: `https://api.yourdomain.com/api/webhooks/paystack`
- Events: `charge.success`, `subscription.create`, `subscription.disable`, `invoice.payment_failed`

---

## PART 4 — Post-Deployment Verification

```bash
# 1. Health check
curl https://api.yourdomain.com/health

# 2. Login as super admin
curl -X POST https://api.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"your-password"}'

# 3. Verify audit chain
TOKEN="<jwt from login response>"
curl -H "Authorization: Bearer $TOKEN" https://api.yourdomain.com/api/audit/verify-chain

# 4. Check frontend loads
curl -I https://yourdomain.com

# 5. Test forgot password
curl -X POST https://api.yourdomain.com/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","accountType":"OEM_ADMIN"}'
```

---

## PART 5 — Ongoing: CI/CD Flow

Every push to `main` automatically:

1. **GitHub Actions** runs backend tests against a test PostgreSQL container
2. **GitHub Actions** builds the React frontend to verify no build errors
3. If both pass:
   - **Railway CLI** deploys the backend and runs `prisma migrate deploy`
   - **Cloudflare Pages Action** builds and publishes the frontend

```
git commit -m "fix: subscription renewal email"
git push origin main
# → CI runs (~3 min) → Railway deploys backend → Cloudflare Pages publishes frontend
# → Live in ~5 minutes total
```

---

## PART 6 — Costs (approximate)

| Service | Plan | Monthly cost |
|---------|------|-------------|
| Railway (Hobby) | Starter | ~$5–20 depending on usage |
| Railway PostgreSQL | Included | Usage-based |
| Railway Redis | Included | Usage-based |
| Cloudflare Pages | Free | $0 |
| Cloudflare Workers | Free (100k req/day) | $0–$5 |
| Cloudflare WAF | Free tier | $0 |
| SendGrid | Free (100 emails/day) | $0 |
| AWS S3 (backups) | ~$0.023/GB | ~$1 |
| **Total** | | **~$10–30/month** |

For production scale (1000+ vendors), upgrade Railway to Pro plan (~$20/mo flat + usage).

---

## Troubleshooting

**Railway deploy fails with Prisma error:**
```bash
railway run npx prisma generate
railway run npx prisma migrate deploy
```

**Cloudflare Pages shows old version:**
```bash
# Force a new deployment
git commit --allow-empty -m "chore: trigger redeploy"
git push origin main
```

**Worker rate limit too strict:**
Edit `RATE_LIMITS` in `cloudflare/worker.js` and `wrangler deploy` again.

**Paystack webhook not received:**
- Check Railway logs: `railway logs`
- Verify webhook URL in Paystack dashboard
- Ensure `PAYSTACK_SECRET_KEY` matches between your app and Paystack dashboard
