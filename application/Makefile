# =============================================================================
# RoleTect VPS Application — Real-Time Development & Production Makefile
# Direct commands: make dev, make api, make web, make docker, make db, make redis, make s3
# =============================================================================

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Colors
CYAN   := \033[36m
GREEN  := \033[32m
YELLOW := \033[33m
RED    := \033[31m
BOLD   := \033[1m
RESET  := \033[0m

COMPOSE_FILE := docker-compose.yml
API_DIR      := api
WEB_DIR      := web-frontend
BACKUP_DIR   := backups

# Load environment if .env exists
ifneq (,$(wildcard .env))
    include .env
    export
endif

# -----------------------------------------------------------------------------
# 1. HELP & DISCOVERY
# -----------------------------------------------------------------------------

.PHONY: help
help: ## Show this interactive help menu
	@echo -e "$(BOLD)$(CYAN)RoleTect Application Real-Time Control Panel$(RESET)"
	@echo -e "Usage: $(YELLOW)make <target>$(RESET)\n"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# -----------------------------------------------------------------------------
# 2. INSTANT REAL-TIME DEVELOPMENT
# -----------------------------------------------------------------------------

.PHONY: dev
dev: db redis s3 ## Start backing services in Docker + run API & Web in real-time
	@echo -e "$(CYAN)Starting backing services (PostgreSQL, Redis, MinIO)...$(RESET)"
	@echo -e "$(GREEN)Backing services active!$(RESET)"
	@echo -e "$(CYAN)Launch API in one terminal: $(YELLOW)make api$(CYAN)$(RESET)"
	@echo -e "$(CYAN)Launch Web in another terminal: $(YELLOW)make web$(CYAN)$(RESET)"

.PHONY: api
api: db redis s3 ## Start Axum API locally in dev mode
	@echo -e "$(CYAN)Starting Axum API server in dev mode...$(RESET)"
	@mkdir -p $(API_DIR)/data
	cd $(API_DIR) && ROLETECT_DATA_DIR=$${ROLETECT_DATA_DIR:-./data} \
		ROLETECT_API_TOKEN=$${ROLETECT_API_TOKEN:-roletect_vps_master_token_2026} \
		DATABASE_URL=$${DATABASE_URL:-postgres://roletect:roletect_secret_password@localhost:5432/roletect} \
		DB_DRIVER=$${DB_DRIVER:-postgres} \
		cargo run

.PHONY: web
web: ## Start Next.js Web Frontend locally with Bun
	@echo -e "$(CYAN)Starting Next.js Web Frontend with Bun...$(RESET)"
	cd $(WEB_DIR) && bun run dev

# -----------------------------------------------------------------------------
# 3. DOCKER ORCHESTRATION (Fast Real-Time Containers)
# -----------------------------------------------------------------------------

.PHONY: docker
docker: up ## Alias for make up (start all containers)

.PHONY: up
up: ## Start all containerized services (Web Bun container + DB + Redis + MinIO)
	@echo -e "$(CYAN)Starting container stack...$(RESET)"
	docker compose -f $(COMPOSE_FILE) up -d --remove-orphans
	@echo -e "$(GREEN)All services running!$(RESET)"
	@echo -e "  $(BOLD)Web Frontend:$(RESET) http://localhost:3000"
	@echo -e "  $(BOLD)MinIO Console:$(RESET) http://localhost:9001 (user: minioadmin / pass: minioadmin)"
	@echo -e "  $(BOLD)PostgreSQL:$(RESET)    localhost:5432"
	@echo -e "  $(BOLD)Redis:$(RESET)         localhost:6379"

.PHONY: down
down: ## Stop and remove all containers and network resources (preserves volumes)
	@echo -e "$(YELLOW)Stopping all containers...$(RESET)"
	docker compose -f $(COMPOSE_FILE) down --remove-orphans

.PHONY: stop
stop: down ## Alias for make down

.PHONY: wipe docker-delete docker-wipe dokcer-delete
wipe: ## Completely wipe all Docker containers, networks, and persistent data volumes
	@echo -e "$(RED)$(BOLD)Wiping all RoleTect containers, networks, and persistent data volumes...$(RESET)"
	docker compose -f $(COMPOSE_FILE) down -v --remove-orphans
	@echo -e "$(GREEN)All RoleTect containers, networks, and persistent volumes wiped clean.$(RESET)"

docker-delete: wipe ## Alias for make wipe (complete container, network & volume wipe)
docker-wipe: wipe ## Alias for make wipe (complete container, network & volume wipe)
dokcer-delete: wipe ## Convenience typo alias for make docker-delete

.PHONY: restart
restart: ## Restart all containers
	@echo -e "$(CYAN)Restarting containers...$(RESET)"
	docker compose -f $(COMPOSE_FILE) restart

.PHONY: ps
ps: ## List running containers and health status
	docker compose -f $(COMPOSE_FILE) ps

.PHONY: logs
logs: ## Follow live logs from all containers
	docker compose -f $(COMPOSE_FILE) logs -f

# -----------------------------------------------------------------------------
# 4. SINGLE SERVICE CONTROLS
# -----------------------------------------------------------------------------

.PHONY: db
db: ## Start only PostgreSQL database container
	@echo -e "$(CYAN)Starting PostgreSQL container...$(RESET)"
	docker compose -f $(COMPOSE_FILE) up -d postgres

.PHONY: db-psql
db-psql: ## Open an interactive psql shell inside the database container
	docker compose -f $(COMPOSE_FILE) exec postgres psql -U ${PG_USER:-roletect} -d ${PG_DB:-roletect}

.PHONY: db-reset
db-reset: ## Wipe and recreate PostgreSQL volume for a fresh database
	@echo -e "$(RED)Wiping PostgreSQL volume...$(RESET)"
	docker compose -f $(COMPOSE_FILE) stop postgres
	docker compose -f $(COMPOSE_FILE) rm -f -v postgres
	docker volume rm -f roletect_postgres_data || true
	docker compose -f $(COMPOSE_FILE) up -d postgres
	@echo -e "$(GREEN)Fresh PostgreSQL container ready.$(RESET)"

.PHONY: redis
redis: ## Start only Redis cache/pubsub container
	@echo -e "$(CYAN)Starting Redis container...$(RESET)"
	docker compose -f $(COMPOSE_FILE) up -d redis

.PHONY: redis-cli
redis-cli: ## Open an interactive redis-cli shell
	docker compose -f $(COMPOSE_FILE) exec redis redis-cli

.PHONY: redis-flush
redis-flush: ## Flush all keys from Redis
	docker compose -f $(COMPOSE_FILE) exec redis redis-cli FLUSHALL

.PHONY: s3
s3: ## Start MinIO S3 object storage container and auto-provision backup bucket
	@echo -e "$(CYAN)Starting MinIO S3 container & auto-provisioner...$(RESET)"
	docker compose -f $(COMPOSE_FILE) up -d minio minio-init
	@echo -e "$(GREEN)MinIO S3 API: http://localhost:9000 | Console: http://localhost:9001$(RESET)"

# -----------------------------------------------------------------------------
# 5. QUALITY ASSURANCE, LINTING & TESTING
# -----------------------------------------------------------------------------

.PHONY: check
check: lint test ## Run full static analysis, typechecks, and test suites

.PHONY: lint
lint: lint-api lint-web ## Run linter and formatter verification across API and Web

.PHONY: lint-api
lint-api: ## Run cargo clippy & fmt check on the API codebase
	@echo -e "$(CYAN)Running Rust clippy & fmt check...$(RESET)"
	cd $(API_DIR) && cargo fmt --check
	cd $(API_DIR) && cargo clippy --all-targets -- -D warnings

.PHONY: lint-web
lint-web: ## Run biome check & tsc typecheck on the Web codebase
	@echo -e "$(CYAN)Running Biome & TypeScript noEmit checks...$(RESET)"
	cd $(WEB_DIR) && bun run lint
	cd $(WEB_DIR) && bun x tsc --noEmit

.PHONY: fmt
fmt: ## Auto-format Rust and TypeScript source code
	@echo -e "$(CYAN)Auto-formatting codebases...$(RESET)"
	cd $(API_DIR) && cargo fmt
	cd $(WEB_DIR) && bun run format

.PHONY: test
test: test-api test-web ## Execute all unit and integration test suites

.PHONY: test-api
test-api: ## Run Cargo tests on the API
	@echo -e "$(CYAN)Running Cargo tests...$(RESET)"
	cd $(API_DIR) && cargo test

.PHONY: test-web
test-web: ## Run Bun tests on the Web frontend
	@echo -e "$(CYAN)Running Web tests...$(RESET)"
	cd $(WEB_DIR) && bun test

# -----------------------------------------------------------------------------
# 6. CROSS-BACKUP (S3 / DESKTOP / VPS INTEROP)
# -----------------------------------------------------------------------------

.PHONY: backup-export
backup-export: ## Export full database snapshot from running API to local file
	@mkdir -p $(BACKUP_DIR)
	@echo -e "$(CYAN)Exporting database snapshot from http://localhost:8080...$(RESET)"
	@curl -s -H "Authorization: Bearer ${ROLETECT_API_TOKEN:-roletect_vps_master_token_2026}" \
		http://localhost:8080/api/data/export -o $(BACKUP_DIR)/roletect_backup_$$(date +%Y%m%d_%H%M%S).json
	@echo -e "$(GREEN)Backup saved to $(BACKUP_DIR)/$(RESET)"

.PHONY: backup-verify
backup-verify: ## Validate cross-backup format and integrity against canonical desktop schema
	@echo -e "$(CYAN)Verifying backup schema compliance...$(RESET)"
	@cd $(API_DIR) && cargo test test_cross_backup_compatibility

# -----------------------------------------------------------------------------
# 7. CLEANUP
# -----------------------------------------------------------------------------

.PHONY: clean
clean: ## Remove build artifacts and temporary caches
	@echo -e "$(YELLOW)Cleaning artifacts...$(RESET)"
	cd $(API_DIR) && cargo clean
	cd $(WEB_DIR) && rm -rf .next node_modules
