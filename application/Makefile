# =============================================================================
# RoleTect VPS Application — Unified Orchestration Makefile
# FAANG-Grade System Management: Multi-Service Docker, DB, Redis, S3, Dev & QA
# =============================================================================

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Colors for terminal styling
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
	@echo -e "$(BOLD)$(CYAN)RoleTect Enterprise Architecture Control Panel$(RESET)"
	@echo -e "Usage: $(YELLOW)make <target>$(RESET)\n"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# -----------------------------------------------------------------------------
# 2. FULL-STACK DOCKER LIFECYCLE
# -----------------------------------------------------------------------------

.PHONY: up
up: ## Start the entire containerized application stack (API, Web, Postgres, Redis, MinIO)
	@echo -e "$(CYAN)Starting full application stack...$(RESET)"
	docker compose -f $(COMPOSE_FILE) up -d --remove-orphans
	@echo -e "$(GREEN)Stack is up! API: http://localhost:8080 | Web: http://localhost:3000 | MinIO: http://localhost:9001$(RESET)"

.PHONY: down
down: ## Stop and remove all containers, networks, and orphan resources
	@echo -e "$(YELLOW)Stopping application stack...$(RESET)"
	docker compose -f $(COMPOSE_FILE) down --remove-orphans

.PHONY: restart
restart: ## Restart all containers
	@echo -e "$(CYAN)Restarting all services...$(RESET)"
	docker compose -f $(COMPOSE_FILE) restart

.PHONY: build
build: ## Build all container images without cache
	@echo -e "$(CYAN)Building container images...$(RESET)"
	docker compose -f $(COMPOSE_FILE) build --no-cache

.PHONY: ps
ps: ## List running services and their health statuses
	docker compose -f $(COMPOSE_FILE) ps

.PHONY: logs
logs: ## Stream live logs from all containers
	docker compose -f $(COMPOSE_FILE) logs -f

.PHONY: logs-api
logs-api: ## Stream live logs from the Axum API backend
	docker compose -f $(COMPOSE_FILE) logs -f api

.PHONY: logs-web
logs-web: ## Stream live logs from the Next.js frontend
	docker compose -f $(COMPOSE_FILE) logs -f web

# -----------------------------------------------------------------------------
# 3. INDIVIDUAL SERVICE CONTROLS (DB, REDIS, S3)
# -----------------------------------------------------------------------------

.PHONY: db-up
db-up: ## Start only the PostgreSQL database container
	@echo -e "$(CYAN)Starting PostgreSQL...$(RESET)"
	docker compose -f $(COMPOSE_FILE) up -d postgres

.PHONY: db-psql
db-psql: ## Open an interactive psql shell inside the database container
	docker compose -f $(COMPOSE_FILE) exec postgres psql -U ${PG_USER:-roletect} -d ${PG_DB:-roletect}

.PHONY: db-reset
db-reset: ## Wipe and recreate PostgreSQL volume for a fresh start
	@echo -e "$(RED)Wiping PostgreSQL volume...$(RESET)"
	docker compose -f $(COMPOSE_FILE) stop postgres
	docker compose -f $(COMPOSE_FILE) rm -f -v postgres
	docker volume rm -f roletect_postgres_data || true
	docker compose -f $(COMPOSE_FILE) up -d postgres
	@echo -e "$(GREEN)Fresh PostgreSQL container ready.$(RESET)"

.PHONY: redis-up
redis-up: ## Start only the Redis cache/pubsub container
	@echo -e "$(CYAN)Starting Redis...$(RESET)"
	docker compose -f $(COMPOSE_FILE) up -d redis

.PHONY: redis-cli
redis-cli: ## Open an interactive redis-cli shell
	docker compose -f $(COMPOSE_FILE) exec redis redis-cli

.PHONY: redis-flush
redis-flush: ## Flush all keys from Redis
	docker compose -f $(COMPOSE_FILE) exec redis redis-cli FLUSHALL

.PHONY: s3-up
s3-up: ## Start MinIO S3 object storage and auto-provision the backup bucket
	@echo -e "$(CYAN)Starting MinIO S3 Storage & Provisioner...$(RESET)"
	docker compose -f $(COMPOSE_FILE) up -d minio minio-init
	@echo -e "$(GREEN)MinIO S3 API: http://localhost:9000 | Console: http://localhost:9001 (user: minioadmin / pass: minioadmin)$(RESET)"

# -----------------------------------------------------------------------------
# 4. LOCAL NATIVE DEVELOPMENT
# -----------------------------------------------------------------------------

.PHONY: dev-deps
dev-deps: db-up redis-up s3-up ## Start local backing infrastructure (Postgres, Redis, MinIO) for native dev

.PHONY: dev-api
dev-api: ## Run Axum API locally using Cargo
	@echo -e "$(CYAN)Starting Axum API locally...$(RESET)"
	cd $(API_DIR) && cargo run

.PHONY: dev-web
dev-web: ## Run Next.js Web Frontend locally using Bun
	@echo -e "$(CYAN)Starting Next.js Frontend locally...$(RESET)"
	cd $(WEB_DIR) && bun run dev

# -----------------------------------------------------------------------------
# 5. QUALITY ASSURANCE, LINTING & TESTING
# -----------------------------------------------------------------------------

.PHONY: check
check: lint test ## Run comprehensive static analysis, typechecks, and unit test suites

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
backup-verify: ## Validate exported backup format and integrity against canonical schema
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
