# FleetAnchor Pro

Fleet maintenance management: workshops, fleet owners, drivers and payments in one platform.

| Part | Folder | Hosted on |
| --- | --- | --- |
| API (Node + Express + Prisma + PostgreSQL) | `fleetanchor-backend-fixed/backend` | Render (`render.yaml`) |
| Web app (React + Vite) | `fleetanchor-frontend/frontend` | Vercel |
| Driver mobile app | `fleetanchor-mobile` | — |

## Running locally

```bash
# API
cd fleetanchor-backend-fixed/backend
cp .env.example .env          # fill in DATABASE_URL and the two JWT secrets
npm ci && npm run build
npm run db:sync               # creates/updates tables; refuses changes that would delete data
npm run seed                  # first time only — needs SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD
npm start

# Web app
cd fleetanchor-frontend/frontend
cp .env.example .env.local    # point VITE_API_URL at your API
npm ci && npm run dev
```

## Deploying

- Merging to `main` deploys the web app (Vercel) and the API (Render, `autoDeploy`).
- The API will not start unless `JWT_SECRET` and `JWT_REFRESH_SECRET` are set, 32+ characters and different.
- `FRONTEND_URL` must be the web app's address; browsers on any other site are refused (add extras in `CORS_ORIGINS`).
- Database changes go through `npm run db:sync`, which stops the deploy rather than delete data. If it stops, plan the data migration before deploying again.
- Every setting is listed in `fleetanchor-backend-fixed/backend/.env.example`.

## Checks

Every pull request runs `.github/workflows/ci.yml`: schema validation, an undefined-name check, a check that every database query matches the schema, the security test suite (`npm test`), and a web app build.
