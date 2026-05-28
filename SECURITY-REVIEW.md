# FleetAnchor Pro — Security Review & Risk Assessment

**Review Date:** May 2026  
**Classification:** Internal — Confidential  
**Reviewed by:** Platform Security Team

---

## 1. Security Architecture Overview

FleetAnchor Pro implements 8 layers of defence-in-depth:

```
Internet → Cloudflare (Layer 1) → Nginx/Vercel (Layer 2) → Express API
  → JWT Auth (Layer 3) → RBAC (Layer 4) → Input Validation (Layer 5)
  → Audit Logging (Layer 6) → Encrypted DB (Layer 7) → Backups (Layer 8)
```

---

## 2. Authentication Security

### Implemented ✅
- **bcrypt password hashing** (cost factor 12) — brute force resistant
- **JWT RS256 tokens** — asymmetric signing, 15-minute access token TTL
- **Refresh token rotation** — single-use, 7-day expiry
- **TOTP 2FA** (otplib) — time-based one-time passwords
- **Rate limiting on auth endpoints** — 3 attempts/hour for password reset, 10/hour for login
- **Session invalidation on password reset** — all tokens revoked
- **Anti-enumeration on forgot-password** — same response whether email exists or not

### Risks to Monitor ⚠️
| Risk | Severity | Mitigation |
|---|---|---|
| JWT secret compromise | CRITICAL | Rotate `JWT_SECRET` immediately; all tokens invalidated |
| Refresh token theft | HIGH | HttpOnly cookies recommended over localStorage |
| 2FA bypass via account recovery | MEDIUM | Enforce 2FA for admin roles |
| Weak passwords set by users | MEDIUM | Enforce password policy (12+ chars, mixed case, symbols) |

---

## 3. Multi-Tenant Isolation

### Implemented ✅
- Every database query filtered by `tenantId` at controller level
- PostgreSQL Row-Level Security policies on critical tables
- SUPER_ADMIN sees all tenants; OEM_ADMIN sees only own tenant
- Field agents cannot access cost data regardless of role

### Risks to Monitor ⚠️
| Risk | Severity | Mitigation |
|---|---|---|
| Missing tenant filter on new endpoints | HIGH | Code review checklist — every new route must call `scopeToTenant` middleware |
| Direct DB access bypassing RLS | HIGH | Application role has limited privileges; no superuser in app |
| Vendor sees another vendor's vehicles | MEDIUM | Unit tests must cover cross-tenant queries |

---

## 4. Input Validation & Injection Prevention

### Implemented ✅
- `express-validator` on all POST/PATCH endpoints
- Prisma ORM — parameterised queries by default (no raw SQL injection risk)
- `helmet.js` — 15 security headers including CSP, HSTS, X-Frame-Options
- CORS whitelist — only `FRONTEND_URL` allowed
- Request body size limit — 10MB max

### Risks to Monitor ⚠️
| Risk | Severity | Mitigation |
|---|---|---|
| XSS via stored content | MEDIUM | Sanitise all user-supplied text before rendering; use DOMPurify on frontend |
| File upload abuse | LOW | No file uploads currently; if added, validate MIME type + scan |
| Mass assignment | LOW | All controllers use explicit field allowlists for updates |

---

## 5. API Security

### Implemented ✅
- Global rate limit: 100 requests/15 minutes per IP
- Auth-specific rate limit: 10 requests/hour
- Paystack webhook HMAC signature verification
- All routes require valid JWT except `/health`, `/auth/login`, `/auth/forgot-password`

### Risks to Monitor ⚠️
| Risk | Severity | Mitigation |
|---|---|---|
| API key exposure in logs | HIGH | Never log Authorization headers; confirmed in logger config |
| Webhook replay attacks | MEDIUM | Paystack timestamp validation — reject events older than 5 minutes |
| Brute force on VIN scanner | LOW | VIN search is authenticated; rate limiting applies |

---

## 6. Audit Trail Security

### Implemented ✅
- **Hash-chained records** — SHA-256 `prevHash` links each log entry to the previous
- **PostgreSQL trigger** — blocks any DELETE or UPDATE on `audit_logs` table at DB level
- Every action logs: userId, IP address, device fingerprint, timestamp, entity affected
- Chain integrity verification endpoint: `GET /api/audit/verify-chain` (SUPER_ADMIN only)
- Exportable by SUPER_ADMIN with optional cost column hiding

### Risks to Monitor ⚠️
| Risk | Severity | Mitigation |
|---|---|---|
| DBA direct DB access bypasses trigger | HIGH | Restrict production DB access; use Railway's access controls |
| Chain broken by DB restore | MEDIUM | Document: after any restore, run chain verification |
| Audit log storage growth | LOW | Implement 90-day archive policy to cold storage |

---

## 7. Data Encryption

### Implemented ✅
- **TLS 1.2/1.3 in transit** — Cloudflare + Railway enforce HTTPS
- **HSTS header** — max-age 31536000, includeSubDomains, preload
- **PostgreSQL encryption at rest** — Railway managed PostgreSQL enables encryption
- **Backup encryption** — GPG public-key encryption before S3 upload
- **Secrets in environment variables** — never in code or logs

### Risks to Monitor ⚠️
| Risk | Severity | Mitigation |
|---|---|---|
| GPG private key loss | CRITICAL | Store private key in offline secure location; test restore quarterly |
| Environment variable exposure | HIGH | Never commit `.env` files; use Railway secrets management |
| S3 bucket public access | HIGH | Confirm S3 bucket has Block Public Access enabled |

---

## 8. Infrastructure Security

### Implemented ✅
- Cloudflare DDoS protection (Layer 3/4/7)
- Cloudflare WAF with OWASP managed ruleset
- Bot Fight Mode enabled
- Rate limiting at Cloudflare edge (auth: 2 req/min, API: 10 req/min)
- Suspicious path blocking (`/.env`, `/wp-admin`, `/phpMyAdmin`)

### Risks to Monitor ⚠️
| Risk | Severity | Mitigation |
|---|---|---|
| Railway direct access bypassing Cloudflare | MEDIUM | Add `X-Worker-Secret` header check in backend |
| Cloudflare API token compromise | HIGH | Rotate token; use scoped tokens per service |
| DDoS on Railway origin | MEDIUM | Enable Railway's built-in DDoS protection; orange-cloud all DNS |

---

## 9. Subscription & Payment Security

### Implemented ✅
- Paystack handles all card data — PCI DSS compliant by delegation
- Webhook signature verification (HMAC-SHA512)
- Subscription status enforced server-side — frontend cannot bypass
- Auto-suspension on payment failure via webhook

### Risks to Monitor ⚠️
| Risk | Severity | Mitigation |
|---|---|---|
| Test keys in production | CRITICAL | Confirm `sk_live_` not `sk_test_` in production Railway vars |
| Subscription bypass via token manipulation | HIGH | Status always checked server-side in middleware |
| Duplicate webhook processing | LOW | Add idempotency check on webhook handler |

---

## 10. Backup & Recovery

### Implemented ✅
- Weekly automated `pg_dump` every Sunday 02:00 WAT
- GPG encrypted before upload
- 90-day S3 retention
- Restore procedure documented

### Recovery Targets
| Metric | Target |
|---|---|
| Recovery Point Objective (RPO) | 7 days (weekly backup) |
| Recovery Time Objective (RTO) | 4 hours |

### Risks to Monitor ⚠️
| Risk | Severity | Mitigation |
|---|---|---|
| Backup never tested | HIGH | Run restore drill every quarter |
| S3 costs | LOW | Monitor; 90-day lifecycle policy moves to Glacier after 30 days |
| Single region backup | MEDIUM | Enable S3 cross-region replication for critical data |

---

## 11. Immediate Actions Required (Pre-Production)

These MUST be completed before going live with real customer data:

- [ ] **Change all default passwords** — super admin, seed accounts
- [ ] **Confirm Paystack live keys** — not test keys in production
- [ ] **Test backup restore** — verify GPG decryption and pg_restore work
- [ ] **Set up uptime monitoring** — Uptime Kuma or BetterUptime on `/health`
- [ ] **Enable Cloudflare email notifications** — for security events
- [ ] **Generate fresh JWT secrets** — do not use placeholder values
- [ ] **Configure SendGrid domain authentication** — SPF, DKIM, DMARC
- [ ] **Restrict Railway DB access** — no shared credentials with dev environment
- [ ] **Enable 2FA on all platform accounts** — Railway, Vercel, GitHub, Cloudflare, Paystack

---

## 12. Compliance Considerations (NDPA — Nigeria Data Protection Act)

| Requirement | Status | Notes |
|---|---|---|
| Data minimisation | ✅ | Only necessary fields collected |
| Consent for data collection | ⚠️ | Add privacy policy and T&C acceptance on signup |
| Right to erasure | ⚠️ | Soft delete implemented; hard delete procedure needed |
| Data breach notification | ⚠️ | Define internal breach response procedure |
| Data residency | ⚠️ | Consider Nigeria-region hosting for compliance |
| Audit trail | ✅ | Immutable hash-chained logs |

---

*Review this document quarterly and after any significant architectural change.*
