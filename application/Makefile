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
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_-]+:.*?## / {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# -----------------------------------------------------------------------------
# 2. INSTANT REAL-TIME DEVELOPMENT
# -----------------------------------------------------------------------------

.PHONY: dev
dev: ## 1. Spin Docker services, 2. Run local Axum API, 3. Run Next.js Web Frontend
	@echo -e "$(CYAN)Step 1: Starting backing Docker services (PostgreSQL, Redis, MinIO)...$(RESET)"
	docker compose -f $(COMPOSE_FILE) up -d postgres redis minio minio-init
	@echo -e "$(GREEN)Backing services active!$(RESET)"
	@echo -e "$(CYAN)Step 2 & 3: Launching Axum API & Next.js Web Frontend concurrently...$(RESET)"
	@mkdir -p $(API_DIR)/data
	@trap 'echo -e "\n$(YELLOW)Shutting down API & Web...$(RESET)"; kill 0' EXIT INT TERM; \
	(cd $(API_DIR) && ROLETECT_DATA_DIR=$${ROLETECT_DATA_DIR:-./data} \
		ROLETECT_API_TOKEN=$${ROLETECT_API_TOKEN:-roletect_vps_master_token_2026} \
		DATABASE_URL=$${DATABASE_URL:-postgres://roletect:roletect_secret_password@localhost:5432/roletect} \
		DB_DRIVER=$${DB_DRIVER:-postgres} \
		cargo run) & \
	(cd $(WEB_DIR) && bun run dev)

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

.PHONY: docker docker-up
docker: up ## Alias for make up (start all containers)
docker-up: up ## Alias for make up (start all containers)

.PHONY: up
up: ## Start containerized services without building images (Web Bun + DB + Redis + MinIO)
	@echo -e "$(CYAN)Spinning RoleTect container stack (no Rust image build)...$(RESET)"
	docker compose -f $(COMPOSE_FILE) up -d --remove-orphans
	@echo -e "$(GREEN)All RoleTect services running!$(RESET)"
	@echo -e "  $(BOLD)Web Frontend:$(RESET)  http://localhost:3000"
	@echo -e "  $(BOLD)MinIO Console:$(RESET) http://localhost:9001 (user: minioadmin / pass: minioadmin)"
	@echo -e "  $(BOLD)PostgreSQL:$(RESET)    localhost:5432"
	@echo -e "  $(BOLD)Redis:$(RESET)         localhost:6379"

.PHONY: docker-down down stop docker-stop
docker-down: ## Stop & down containers (preserves persistent volumes and data)
	@echo -e "$(YELLOW)Stopping & downing all RoleTect containers (volumes preserved)...$(RESET)"
	docker compose -f $(COMPOSE_FILE) down --remove-orphans

down: docker-down ## Alias for make docker-down
stop: docker-down ## Alias for make docker-down
docker-stop: docker-down ## Alias for make docker-down

.PHONY: docker-erase dokcer-erase wipe docker-delete docker-wipe dokcer-delete
docker-erase: down-port ## Terminate ports, remove containers, unmount and delete volumes & networks (preserves images)
	@echo -e "$(RED)$(BOLD)Erasing all RoleTect containers, unmounting and removing persistent volumes & networks...$(RESET)"
	docker compose -f $(COMPOSE_FILE) down -v --remove-orphans
	@docker volume rm -f roletect_postgres_data roletect_redis_data roletect_minio_data roletect_api_data 2>/dev/null || true
	@echo -e "$(GREEN)All RoleTect containers, volumes, and networks removed clean (Docker images preserved).$(RESET)"

dokcer-erase: docker-erase ## Typo alias for make docker-erase
wipe: docker-erase ## Alias for make docker-erase
docker-delete: docker-erase ## Alias for make docker-erase
docker-wipe: docker-erase ## Alias for make docker-erase
dokcer-delete: docker-erase ## Typo alias for make docker-erase

.PHONY: down-port port-down ports-down kill-ports
down-port: ## Terminate all processes & Docker containers holding RoleTect ports (8080, 3000, 5432, 6379, 9000, 9001)
	@echo -e "$(YELLOW)Releasing all RoleTect ports (8080, 3000, 5432, 6379, 9000, 9001)...$(RESET)"
	@for port in 8080 3000 5432 6379 9000 9001; do \
		containers=$$(docker ps -q --filter "publish=$$port" 2>/dev/null); \
		if [ -n "$$containers" ]; then \
			names=$$(docker ps --filter "publish=$$port" --format '{{.Names}}' | tr '\n' ' '); \
			echo -e "  $(YELLOW)Stopping Docker container(s) on port $$port: $$names$(RESET)"; \
			docker stop $$containers >/dev/null 2>&1 || true; \
		fi; \
		fuser -k $$port/tcp >/dev/null 2>&1 || true; \
		if [ -z "$$(docker ps -q --filter "publish=$$port" 2>/dev/null)" ] && ! ss -tulpn 2>/dev/null | grep -q ":$$port "; then \
			echo -e "  $(GREEN)Port $$port/tcp is free$(RESET)"; \
		else \
			echo -e "  $(GREEN)Port $$port/tcp released$(RESET)"; \
		fi; \
	done
	@echo -e "$(GREEN)All RoleTect ports cleared and available.$(RESET)"

port-down: down-port ## Alias for make down-port
ports-down: down-port ## Alias for make down-port
kill-ports: down-port ## Alias for make down-port

.PHONY: restart
restart: ## Restart all containers
	@echo -e "$(CYAN)Restarting containers...$(RESET)"
	docker compose -f $(COMPOSE_FILE) restart

.PHONY: ps
ps: ## List running containers and health status
	docker compose -f $(COMPOSE_FILE) ps

.PHONY: status health
status: ## Check live health and port connectivity of all services
	@echo -e "\n$(BOLD)$(CYAN)=== RoleTect Stack Health Check ===$(RESET)\n"
	@printf "  %-22s" "API (Axum :8080):"
	@if curl -s -f http://localhost:8080/health >/dev/null 2>&1; then \
		echo -e "$(GREEN)[ONLINE] (200 OK)$(RESET)"; \
	else \
		echo -e "$(RED)[OFFLINE]$(RESET)"; \
	fi
	@printf "  %-22s" "Web (Next.js :3000):"
	@if curl -s -f http://localhost:3000/health >/dev/null 2>&1; then \
		echo -e "$(GREEN)[ONLINE] (200 OK)$(RESET)"; \
	else \
		echo -e "$(RED)[OFFLINE]$(RESET)"; \
	fi
	@printf "  %-22s" "PostgreSQL (:5432):"
	@if docker compose -f $(COMPOSE_FILE) exec -T postgres pg_isready -U roletect -d roletect >/dev/null 2>&1; then \
		echo -e "$(GREEN)[ONLINE] (Ready)$(RESET)"; \
	else \
		echo -e "$(RED)[OFFLINE]$(RESET)"; \
	fi
	@printf "  %-22s" "Redis (:6379):"
	@if docker compose -f $(COMPOSE_FILE) exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then \
		echo -e "$(GREEN)[ONLINE] (PONG)$(RESET)"; \
	else \
		echo -e "$(RED)[OFFLINE]$(RESET)"; \
	fi
	@printf "  %-22s" "MinIO S3 (:9000):"
	@if curl -s -f http://localhost:9000/minio/health/live >/dev/null 2>&1; then \
		echo -e "$(GREEN)[ONLINE] (200 OK)$(RESET)"; \
	else \
		echo -e "$(RED)[OFFLINE]$(RESET)"; \
	fi
	@echo ""
	@docker compose -f $(COMPOSE_FILE) ps

health: status ## Alias for make status

.PHONY: logs
logs: ## Follow live logs from all containers
	docker compose -f $(COMPOSE_FILE) logs -f

# -----------------------------------------------------------------------------
# 4. SINGLE SERVICE CONTROLS
# -----------------------------------------------------------------------------

.PHONY: api-up
api-up: ## Start only Axum API container in Docker
	@echo -e "$(CYAN)Starting Axum API container...$(RESET)"
	docker compose -f $(COMPOSE_FILE) up -d api

.PHONY: api-down
api-down: ## Stop and remove Axum API container
	@echo -e "$(YELLOW)Stopping Axum API container...$(RESET)"
	docker compose -f $(COMPOSE_FILE) stop api
	docker compose -f $(COMPOSE_FILE) rm -f api

.PHONY: web-up
web-up: ## Start only Web frontend container in Docker
	@echo -e "$(CYAN)Starting Web frontend container...$(RESET)"
	docker compose -f $(COMPOSE_FILE) up -d web

.PHONY: web-down web-stop
web-down: ## Stop and remove Web frontend container
	@echo -e "$(YELLOW)Stopping Web frontend container...$(RESET)"
	docker compose -f $(COMPOSE_FILE) stop web
	docker compose -f $(COMPOSE_FILE) rm -f web

web-stop: web-down ## Alias for make web-down

.PHONY: kill-web
kill-web: ## Kill any local Bun dev process running on port 3000
	@echo -e "$(YELLOW)Killing local processes on port 3000...$(RESET)"
	@fuser -k 3000/tcp 2>/dev/null || true

.PHONY: kill-api api-stop
kill-api: ## Kill any local Axum API process running on port 8080
	@echo -e "$(YELLOW)Killing local API processes on port 8080...$(RESET)"
	@fuser -k 8080/tcp 2>/dev/null || true

api-stop: kill-api ## Alias for make kill-api

.PHONY: db
db: ## Start only PostgreSQL database container
	@echo -e "$(CYAN)Starting PostgreSQL container...$(RESET)"
	docker compose -f $(COMPOSE_FILE) up -d postgres

.PHONY: db-down db-stop
db-down: ## Stop PostgreSQL database container
	@echo -e "$(YELLOW)Stopping PostgreSQL container...$(RESET)"
	docker compose -f $(COMPOSE_FILE) stop postgres

db-stop: db-down ## Alias for make db-down

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

.PHONY: redis-down redis-stop
redis-down: ## Stop Redis container
	@echo -e "$(YELLOW)Stopping Redis container...$(RESET)"
	docker compose -f $(COMPOSE_FILE) stop redis

redis-stop: redis-down ## Alias for make redis-down

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

.PHONY: s3-down s3-stop
s3-down: ## Stop MinIO S3 containers
	@echo -e "$(YELLOW)Stopping MinIO S3 containers...$(RESET)"
	docker compose -f $(COMPOSE_FILE) stop minio minio-init

s3-stop: s3-down ## Alias for make s3-down

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
