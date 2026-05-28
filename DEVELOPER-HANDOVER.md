# FleetAnchor Pro — Developer Handover Note

**Project:** FleetAnchor Pro — Fleet Maintenance Management SaaS  
**Handover Date:** May 2026  
**Prepared by:** Development Team  
**Recipient:** Incoming Developer / Technical Lead

---

## 1. Project Overview

FleetAnchor Pro is a multi-tenant SaaS platform for OEM workshops to manage fleet vehicle maintenance. Vendors register fleets, submit job complaints, approve estimates, track repairs, confirm payments, and download invoices — all through a role-gated web app.

**Live URLs (after deployment):**
- Frontend: `https://anchor-fleet-pro.vercel.app` (Vercel)
- Backend API: `https://anchor-fleetpro-production.up.railway.app` (Railway)
- GitHub: `https://github.com/Kennyappworld/Anchor-FleetPro`

---

## 2. Repository Structure

```
Anchor-FleetPro/
├── fleetanchor-backend-fixed/
│   └── backend/                  ← Node.js API (Railway deploys this)
│       ├── src/
│       │   ├── controllers/      ← Business logic (8 controllers)
│       │   ├── routes/           ← Express routes (12 route files)
│       │   ├── middleware/       ← Auth, validation, error handling
│       │   ├── services/         ← Audit, email, cron jobs
│       │   ├── config/           ← Logger (Winston)
│       │   └── utils/            ← ID generators
│       ├── prisma/
│       │   ├── schema.prisma     ← Database schema (11 tables)
│       │   └── seed.js           ← Initial data seeder
│       ├── Dockerfile            ← Docker build (Railway uses this)
│       ├── railway.toml          ← Railway config
│       ├── nixpacks.toml         ← Nixpacks build config
│       └── package.json
│
├── fleetanchor-frontend/
│   └── frontend/                 ← React 18 + Vite (Vercel deploys this)
│       ├── src/
│       │   ├── pages/
│       │   │   ├── auth/         ← Login, ForgotPassword, ResetPassword
│       │   │   ├── dashboard/    ← Admin pages (10 pages)
│       │   │   └── vendor/       ← Vendor portal pages (8 pages)
│       │   ├── components/shared/ ← AdminLayout, VendorLayout
│       │   ├── context/          ← Zustand auth store
│       │   ├── services/         ← Axios API service layer
│       │   └── styles/           ← Global CSS
│       ├── public/
│       │   ├── _headers          ← Cloudflare security headers
│       │   └── _redirects        ← SPA routing rules
│       └── package.json
│
├── cloudflare/
│   ├── worker.js                 ← Edge rate limiting worker
│   └── wrangler.toml             ← Cloudflare Worker config
│
└── deploy/
    ├── docker-compose.yml        ← Self-hosted deployment
    ├── nginx.conf                ← Nginx reverse proxy config
    └── init.sql                  ← PostgreSQL initialization
```

---

## 3. Technology Stack

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20.x | Runtime |
| Express | 4.18 | HTTP framework |
| Prisma | 5.10 | ORM + migrations |
| PostgreSQL | 16 | Primary database |
| JWT (RS256) | 9.0 | Authentication |
| bcryptjs | 2.4 | Password hashing |
| otplib | 12.0 | 2FA TOTP |
| Winston | 3.12 | Logging |
| nodemailer | 6.9 | Email (SendGrid) |
| node-cron | 3.1 | Scheduled jobs |
| helmet | 7.1 | Security headers |
| express-rate-limit | 7.2 | Rate limiting |

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 18.2 | UI framework |
| Vite | 5.1 | Build tool |
| Tailwind CSS | 3.4 | Styling |
| Zustand | 4.5 | State management |
| React Router | 6.22 | Client routing |
| Axios | 1.6 | HTTP client |
| Recharts | 2.12 | Charts |
| react-hot-toast | 2.4 | Notifications |
| jsPDF | 2.5 | PDF generation |

### Infrastructure
| Service | Purpose |
|---|---|
| Railway | Backend hosting + PostgreSQL + Redis |
| Vercel | Frontend hosting (CDN) |
| Cloudflare | DDoS, WAF, edge caching |
| SendGrid | Transactional email |
| Paystack | Payment processing |
| AWS S3 | Encrypted weekly backups |

---

## 4. Database Schema Summary

**11 tables:**

```
tenants → oem_companies → vendors → users
                                 → vehicles → job_requests → estimates
                                                           → invoices
                                          → subscriptions
users → audit_logs (hash-chained, immutable)
```

**Key design decisions:**
- Multi-tenant via `tenantId` on every query — never cross-tenant data leakage
- `audit_logs` has a PostgreSQL trigger preventing DELETE/UPDATE
- Hash-chained audit records (SHA-256 `prevHash` + `recordHash`)
- Soft deletes on users (email obfuscated, `active=false`)
- Subscription enforcement via cron + Paystack webhooks

---

## 5. Authentication Flow

```
POST /api/auth/login
  → validate credentials
  → check 2FA if enabled (TOTP)
  → return JWT (15min) + refresh token (7d)

POST /api/auth/refresh
  → validate refresh token
  → issue new JWT

POST /api/auth/forgot-password
  → rate-limit (3/hour per email)
  → generate 6-digit OTP (15min expiry)
  → send via SendGrid
  → store hashed OTP in DB

POST /api/auth/verify-otp + /reset-password
  → validate OTP
  → update password hash
  → invalidate ALL refresh tokens for that user
```

---

## 6. Role Hierarchy & Permissions

```
SUPER_ADMIN
  └── OEM_ADMIN
        └── WORKSHOP_STAFF
        └── FLEET_MANAGER (vendor)
              └── MAINTENANCE_SUPERVISOR (vendor)
              └── FIELD_AGENT (vendor, no cost visibility)
```

Growth plan vendors: max 2 users  
Enterprise plan vendors: unlimited users  
Field agents: can scan VINs, cannot see costs, cannot export

---

## 7. Critical Environment Variables

These MUST be set before the app works:

```env
# Database (Railway auto-injects)
DATABASE_URL=postgresql://...

# Auth (generate with crypto.randomBytes(64).toString('hex'))
JWT_SECRET=64_char_hex
JWT_REFRESH_SECRET=different_64_char_hex

# Payments
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_PUBLIC_KEY=pk_live_...

# Email
SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=noreply@yourdomain.com

# Backups
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=fleetanchor-backups

# App
FRONTEND_URL=https://yourdomain.com
NODE_ENV=production
```

---

## 8. Deployment Configuration (Current)

**Railway (Backend):**
- Builder: **Dockerfile** ← IMPORTANT, not Railpack
- Root Directory: `fleetanchor-backend-fixed/backend`
- Dockerfile path: `/fleetanchor-backend-fixed/backend/Dockerfile`
- Custom Build Command: `npx prisma generate`
- PostgreSQL plugin: connected (auto-injects DATABASE_URL)

**Vercel (Frontend):**
- Root Directory: `fleetanchor-frontend/frontend`
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

**Known Issue Resolved:**
Railway's Railpack builder was running `npm ci` which failed without `package-lock.json`. Fixed by switching to Dockerfile builder which runs `npm install` directly.

---

## 9. First-Time Setup After Deployment

```bash
# 1. Run database migrations (Railway does this automatically via Dockerfile CMD)
npx prisma migrate deploy

# 2. Seed initial data (run once manually via Railway CLI)
railway run node prisma/seed.js

# 3. Login with seeded credentials
# Email: admin@fleetanchor.com (or SUPER_ADMIN_EMAIL env var)
# Password: Admin@FleetAnchor2026! (or SUPER_ADMIN_PASSWORD env var)
# CHANGE IMMEDIATELY after first login
```

---

## 10. Cron Jobs (Auto-Running)

| Job | Schedule | Purpose |
|---|---|---|
| Subscription checker | Daily 01:00 WAT | Email warnings at 7d, 3d; suspend on expiry |
| Weekly backup | Sunday 02:00 WAT | pg_dump → GPG encrypt → S3 upload |

---

## 11. Paystack Webhook Setup

After deployment, configure in Paystack dashboard:
- URL: `https://your-railway-url/api/webhooks/paystack`
- Events: `charge.success`, `subscription.disable`, `invoice.payment_failed`
- The webhook verifies HMAC signature using `PAYSTACK_SECRET_KEY`

---

## 12. Known Technical Debt

1. **Puppeteer removed** from production — PDF generation currently uses a simplified HTML approach. For production-quality PDFs, re-add puppeteer with headless Chromium or switch to `pdfmake` library.

2. **No Redis yet** — rate limiting uses in-memory store. For production scale, add Redis plugin on Railway and connect `REDIS_URL`.

3. **package-lock.json absent** — npm install is used instead of npm ci. For reproducible builds, generate and commit a proper lock file.

4. **Email templates** are plain text — upgrade to HTML templates using `@sendgrid/mail` template IDs for better deliverability.

5. **2FA is optional** — consider making it mandatory for SUPER_ADMIN and OEM_ADMIN roles.

---

## 13. Security Contacts

- Platform owner access: `SUPER_ADMIN_EMAIL` in Railway variables
- Paystack dashboard: paystack.com (business account)
- SendGrid: app.sendgrid.com
- Railway: railway.app (Kennyappworld account)
- Vercel: vercel.com (kennyappworld account)
- GitHub: github.com/Kennyappworld

---

## 14. Support Escalation Path

1. Check Railway build logs for backend errors
2. Check Vercel deployment logs for frontend errors
3. Check Railway PostgreSQL → Database → Data tab for data issues
4. Verify all environment variables are set correctly
5. Run `GET /health` to verify backend is alive
6. Run `GET /api/audit/verify-chain` (with SUPER_ADMIN token) to verify audit integrity

---

*This document should be updated after every major deployment or architectural change.*
