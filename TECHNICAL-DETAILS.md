# FleetAnchor Pro — Technical Reference

**Version:** 1.0.0  
**Last Updated:** May 2026

---

## API Reference

### Base URL
```
Production: https://anchor-fleetpro-production.up.railway.app
Development: http://localhost:5000
```

### Authentication
All protected endpoints require:
```
Authorization: Bearer <jwt_access_token>
```

---

### Auth Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | None | Login with email + password |
| POST | `/api/auth/refresh` | None | Refresh access token |
| POST | `/api/auth/logout` | ✅ | Invalidate refresh token |
| POST | `/api/auth/forgot-password` | None | Send OTP to email |
| POST | `/api/auth/verify-otp` | None | Verify reset OTP |
| POST | `/api/auth/reset-password` | None | Set new password |
| POST | `/api/auth/2fa/setup` | ✅ | Generate TOTP QR code |
| POST | `/api/auth/2fa/verify` | ✅ | Verify and enable 2FA |
| POST | `/api/auth/2fa/disable` | ✅ | Disable 2FA |

**Login Request:**
```json
POST /api/auth/login
{
  "email": "admin@company.com",
  "password": "MyPassword123!",
  "totpCode": "123456"  // optional, only if 2FA enabled
}
```

**Login Response:**
```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "fullName": "...", "role": "SUPER_ADMIN" },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

---

### Job Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/jobs` | ✅ | List jobs (scoped by role) |
| GET | `/api/jobs/:id` | ✅ | Get single job with timeline |
| POST | `/api/jobs` | ✅ | Submit new job request |
| PATCH | `/api/jobs/:id/status` | ✅ | Update job status |
| POST | `/api/jobs/:id/estimate-response` | ✅ FLEET_MANAGER | Approve or query estimate |

**Job Status Flow:**
```
SUBMITTED → DIAGNOSED → ESTIMATE_SENT → APPROVED → REPAIR_STARTED 
→ COMPLETED → PAYMENT_CONFIRMED → CLOSED
(QUERIED can occur after ESTIMATE_SENT)
```

---

### Vehicle Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/vehicles` | ✅ | List vehicles (scoped) |
| GET | `/api/vehicles/search?q=VIN` | ✅ | Search by VIN or plate |
| GET | `/api/vehicles/:id` | ✅ | Get vehicle details |
| GET | `/api/vehicles/:id/history?hideCost=true` | ✅ | Full maintenance history |
| POST | `/api/vehicles` | ✅ MANAGER | Register new vehicle |
| PATCH | `/api/vehicles/:id` | ✅ MANAGER | Update vehicle |

---

### Estimate Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/estimates/:jobId` | ✅ | Get estimates for job |
| POST | `/api/estimates` | ✅ WORKSHOP | Create estimate |
| PATCH | `/api/estimates/:id` | ✅ WORKSHOP | Update estimate |

**Create Estimate:**
```json
POST /api/estimates
{
  "jobId": "uuid",
  "partsTotal": 285000,
  "labourTotal": 95000,
  "notes": "Includes original Mercedes coolant"
}
```

---

### Invoice Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/invoices` | ✅ | List invoices |
| GET | `/api/invoices/:id` | ✅ | Get invoice |
| GET | `/api/invoices/:id/pdf?hideCost=true` | ✅ | Download PDF |
| POST | `/api/invoices` | ✅ WORKSHOP | Generate invoice |
| POST | `/api/invoices/:id/confirm-payment` | ✅ WORKSHOP | Confirm payment |

---

### Vendor Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/vendors` | ✅ | List vendors |
| GET | `/api/vendors/:id` | ✅ | Get vendor |
| GET | `/api/vendors/:id/stats` | ✅ | Vendor statistics |
| POST | `/api/vendors` | ✅ OEM_ADMIN | Create vendor |
| PATCH | `/api/vendors/:id` | ✅ OEM_ADMIN | Update vendor |
| POST | `/api/vendors/:id/suspend` | ✅ OEM_ADMIN | Suspend vendor |
| POST | `/api/vendors/:id/reinstate` | ✅ OEM_ADMIN | Reinstate vendor |

---

### Analytics Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/analytics/dashboard` | ✅ WORKSHOP+ | KPI summary |
| GET | `/api/analytics/monthly-revenue` | ✅ OEM_ADMIN+ | 6-month revenue |
| GET | `/api/analytics/top-vehicles` | ✅ WORKSHOP+ | Top vehicles by jobs |

---

### Audit Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/audit` | ✅ OEM_ADMIN+ | Paginated audit logs |
| GET | `/api/audit/verify-chain` | ✅ SUPER_ADMIN | Verify hash chain |
| GET | `/api/audit/export?format=csv&hideCost=true` | ✅ OEM_ADMIN+ | Export audit log |

---

### Admin Endpoints (SUPER_ADMIN only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/overview` | Platform-wide statistics |
| GET | `/api/admin/tenants` | All tenants |
| POST | `/api/admin/tenants` | Create new tenant + OEM |
| GET | `/api/admin/activity` | Full activity log |
| POST | `/api/admin/tenants/:id/deactivate` | Deactivate tenant |

---

### Webhook Endpoint

```
POST /api/webhooks/paystack
```
Paystack sends signed events here. Verified via HMAC-SHA512.

**Handled events:**
- `charge.success` → activates subscription, confirms invoice payment
- `subscription.disable` → suspends vendor account
- `invoice.payment_failed` → triggers warning email

---

## Database Tables

### tenants
```sql
id, name, slug (unique), active, createdAt, updatedAt
```

### oem_companies
```sql
id, tenantId, name, contactEmail, contactPhone, address, logoUrl,
planTier (GROWTH/ENTERPRISE/WHITE_LABEL), paystackSubCode, active,
createdAt, updatedAt
```

### vendors
```sql
id, oemId, companyName, contactEmail, contactPhone, address,
status (ACTIVE/SUSPENDED/INACTIVE), suspendedAt, suspendedBy,
suspendReason, createdAt, updatedAt
```

### users
```sql
id, fullName, email (unique), passwordHash, role
(SUPER_ADMIN/OEM_ADMIN/WORKSHOP_STAFF/FLEET_MANAGER/
MAINTENANCE_SUPERVISOR/FIELD_AGENT),
vendorId?, totpSecret?, totpEnabled, resetToken?,
resetTokenHash?, resetExpires?, resetAttempts,
active, createdAt, updatedAt
```

### vehicles
```sql
id, vendorId, vin (unique), plateNumber, engineNumber,
make, model, year, status (ACTIVE/IN_MAINTENANCE/RETIRED),
createdAt, updatedAt
```

### job_requests
```sql
id, jobNumber (unique, auto-generated), vehicleId, createdById,
category, description, status (9 states), submittedAt,
diagnosedAt, estimateSentAt, approvedAt, repairStartedAt,
completedAt, paymentConfirmedAt, closedAt, createdAt, updatedAt
```

### estimates
```sql
id, jobId, partsTotal, labourTotal, totalCost, notes,
status (PENDING/APPROVED/REJECTED), sentAt, approvedAt,
createdAt, updatedAt
```

### invoices
```sql
id, invoiceNumber (unique), jobId, partsTotal, labourTotal,
totalAmount, paymentConfirmed, paystackRef?, issuedAt, paidAt,
createdAt, updatedAt
```

### subscriptions
```sql
id, vendorId, plan (GROWTH/ENTERPRISE), status (ACTIVE/EXPIRED/CANCELLED),
startDate, expiryDate, autoRenew, paystackSubCode?,
paystackEmailToken?, warningAt7Days, warningAt3Days,
cancelledAt, createdAt, updatedAt
```

### audit_logs
```sql
id, userId, action, entityType, entityId, metadata (JSON),
ipAddress, deviceFingerprint, prevHash, recordHash,
createdAt
-- NO updatedAt — immutable by design
-- PostgreSQL trigger prevents DELETE and UPDATE
```

---

## Error Response Format

All errors follow this structure:
```json
{
  "success": false,
  "error": "Human-readable message",
  "code": "ERROR_CODE",    // optional
  "details": []            // validation errors if applicable
}
```

**Common HTTP status codes:**
- `200` — Success
- `201` — Created
- `400` — Bad request / validation error
- `401` — Unauthenticated
- `403` — Forbidden (wrong role or plan limit)
- `404` — Not found
- `409` — Conflict (duplicate VIN, email, etc.)
- `429` — Rate limited
- `500` — Server error

---

## Frontend State Management

Uses **Zustand** persisted store (`authStore.js`):

```javascript
{
  user: { id, fullName, email, role, vendorId, tenantId },
  accessToken: "eyJ...",
  refreshToken: "eyJ...",
  isAuthenticated: boolean
}
```

**Helper methods:**
- `hasRole(role)` — check if user has specific role
- `isVendor()` — true for FLEET_MANAGER, MAINTENANCE_SUPERVISOR, FIELD_AGENT
- `isWorkshop()` — true for SUPER_ADMIN, OEM_ADMIN, WORKSHOP_STAFF
- `login(credentials)` — authenticate and store tokens
- `logout()` — clear store and redirect
- `refreshAuth()` — silently refresh access token

---

## Frontend Route Structure

```
/login                     — LoginPage
/forgot-password           — ForgotPasswordPage
/reset-password            — ResetPasswordPage

/dashboard                 — DashboardPage (WORKSHOP)
/jobs                      — JobsPage
/jobs/:id                  — JobDetailPage
/scanner                   — ScannerPage
/repairs                   — RepairsPage
/vehicles                  — VehiclesPage
/vendors                   — VendorsPage
/invoices                  — InvoicesPage
/analytics                 — AnalyticsPage
/subscriptions             — SubscriptionsPage
/settings                  — SettingsPage
/audit                     — AuditPage

/vendor/dashboard          — VendorDashboardPage
/vendor/jobs               — VendorJobsPage
/vendor/scanner            — VendorScannerPage
/vendor/vehicles           — VendorVehiclesPage
/vendor/history            — VendorHistoryPage
/vendor/invoices           — VendorInvoicesPage
/vendor/team               — VendorTeamPage
/vendor/subscription       — VendorSubscriptionPage
```

**Route guards:**
- `RequireAuth` — redirect to `/login` if not authenticated
- `RequireWorkshop` — redirect if not SUPER_ADMIN/OEM_ADMIN/WORKSHOP_STAFF
- `RequireVendor` — redirect if not vendor role
- `SmartRedirect` — routes to correct dashboard based on role

---

## Useful Commands

```bash
# Check API health
curl https://anchor-fleetpro-production.up.railway.app/health

# Generate secure JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Push file to GitHub (using token)
curl -X PUT https://api.github.com/repos/OWNER/REPO/contents/PATH \
  -H "Authorization: Bearer ghp_token" \
  -d '{"message":"update","content":"base64content","sha":"existing_sha"}'

# Verify audit chain
curl -H "Authorization: Bearer SUPER_ADMIN_TOKEN" \
  https://anchor-fleetpro-production.up.railway.app/api/audit/verify-chain
```
