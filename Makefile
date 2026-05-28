.PHONY: dev build up down logs migrate seed shell-db shell-api backup verify-audit

# ─── Development ──────────────────────────────────────────────────────────────
dev:
	cd backend && npm run dev &
	cd frontend && npm run dev

# ─── Production ───────────────────────────────────────────────────────────────
build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

# ─── Database ─────────────────────────────────────────────────────────────────
migrate:
	docker exec fleetanchor_api npx prisma migrate deploy

migrate-dev:
	cd backend && npx prisma migrate dev

seed:
	docker exec fleetanchor_api node prisma/seed.js

shell-db:
	docker exec -it fleetanchor_db psql -U fleetanchor -d fleetanchor_db

shell-api:
	docker exec -it fleetanchor_api sh

# ─── Deploy (pull + rebuild + migrate) ────────────────────────────────────────
deploy:
	git pull
	docker compose build backend frontend
	docker compose up -d
	docker exec fleetanchor_api npx prisma migrate deploy
	@echo "✅ Deployment complete"

# ─── Security ─────────────────────────────────────────────────────────────────
backup:
	docker exec fleetanchor_api node -e "require('./src/services/cronService').runBackupNow().then(()=>process.exit(0))"

verify-audit:
	@echo "Verifying audit chain integrity..."
	curl -s -H "Authorization: Bearer $(SUPER_ADMIN_TOKEN)" https://$(DOMAIN)/api/audit/verify-chain | python3 -m json.tool

# ─── Install ──────────────────────────────────────────────────────────────────
install:
	cd backend && npm install
	cd frontend && npm install
	cd backend && npx prisma generate
