# =============================================================================
# RoleTect Root Workspace Makefile
# Forwards stack commands to application/ and supports root-level workspace tasks
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

APP_DIR := application

# -----------------------------------------------------------------------------
# 1. HELP & DISCOVERY
# -----------------------------------------------------------------------------

.PHONY: help
help: ## Show this interactive help menu
	@echo -e "$(BOLD)$(CYAN)RoleTect Root Control Panel$(RESET)"
	@echo -e "Usage: $(YELLOW)make <target>$(RESET)\n"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_-]+:.*?## / {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# -----------------------------------------------------------------------------
# 2. CORE DOCKER & APPLICATION COMMANDS
# -----------------------------------------------------------------------------

.PHONY: up docker docker-up
up: ## Start containerized services without building images (Web Bun + DB + Redis + MinIO)
	@$(MAKE) -C $(APP_DIR) up

docker: up ## Alias for make up (start all containers)
docker-up: up ## Alias for make up (start all containers)

.PHONY: docker-down down stop docker-stop
docker-down: ## Stop & down containers (preserves persistent volumes and data)
	@$(MAKE) -C $(APP_DIR) docker-down

down: docker-down ## Alias for make docker-down
stop: docker-down ## Alias for make docker-down
docker-stop: docker-down ## Alias for make docker-down

.PHONY: docker-erase dokcer-erase wipe docker-delete docker-wipe dokcer-delete
docker-erase: ## Terminate ports, remove containers, unmount and delete volumes & networks (preserves images)
	@$(MAKE) -C $(APP_DIR) docker-erase

dokcer-erase: docker-erase ## Typo alias for make docker-erase
wipe: docker-erase ## Alias for make docker-erase
docker-delete: docker-erase ## Alias for make docker-erase
docker-wipe: docker-erase ## Alias for make docker-erase
dokcer-delete: docker-erase ## Typo alias for make docker-erase

.PHONY: down-port port-down ports-down kill-ports
down-port: ## Terminate all processes holding RoleTect ports (8080, 3000, 5432, 6379, 9000, 9001)
	@$(MAKE) -C $(APP_DIR) down-port

port-down: down-port ## Alias for make down-port
ports-down: down-port ## Alias for make down-port
kill-ports: down-port ## Alias for make down-port

.PHONY: dev
dev: ## 1. Spin Docker services, 2. Run local Axum API, 3. Run Next.js Web Frontend
	@$(MAKE) -C $(APP_DIR) dev

.PHONY: web
web: ## Start Next.js Web Frontend locally with Bun
	@$(MAKE) -C $(APP_DIR) web

.PHONY: api
api: ## Start Axum API locally in dev mode
	@$(MAKE) -C $(APP_DIR) api

.PHONY: web-up web-down api-up api-down
web-up: ## Start only Web frontend container in Docker
	@$(MAKE) -C $(APP_DIR) web-up

web-down: ## Stop and remove Web frontend container
	@$(MAKE) -C $(APP_DIR) web-down

api-up: ## Start only Axum API container in Docker
	@$(MAKE) -C $(APP_DIR) api-up

api-down: ## Stop and remove Axum API container
	@$(MAKE) -C $(APP_DIR) api-down

.PHONY: status health ps logs restart
status: ## Check live health and port connectivity of all services
	@$(MAKE) -C $(APP_DIR) status

health: status ## Alias for make status

ps: ## List running containers and health status
	@$(MAKE) -C $(APP_DIR) ps

logs: ## Follow live logs from all containers
	@$(MAKE) -C $(APP_DIR) logs

restart: ## Restart all containers
	@$(MAKE) -C $(APP_DIR) restart

.PHONY: db redis s3 db-psql db-reset redis-cli redis-flush
db: ## Start only PostgreSQL database container
	@$(MAKE) -C $(APP_DIR) db

redis: ## Start only Redis cache/pubsub container
	@$(MAKE) -C $(APP_DIR) redis

s3: ## Start MinIO S3 object storage container
	@$(MAKE) -C $(APP_DIR) s3

db-psql: ## Open an interactive psql shell inside database container
	@$(MAKE) -C $(APP_DIR) db-psql

db-reset: ## Wipe and recreate PostgreSQL volume
	@$(MAKE) -C $(APP_DIR) db-reset

redis-cli: ## Open an interactive redis-cli shell
	@$(MAKE) -C $(APP_DIR) redis-cli

redis-flush: ## Flush all keys from Redis
	@$(MAKE) -C $(APP_DIR) redis-flush

# -----------------------------------------------------------------------------
# 3. QUALITY ASSURANCE & TESTING
# -----------------------------------------------------------------------------

.PHONY: check lint fmt test
check: ## Run full static analysis, typechecks, and test suites
	@$(MAKE) -C $(APP_DIR) check

lint: ## Run linter and formatter verification
	@$(MAKE) -C $(APP_DIR) lint

fmt: ## Auto-format Rust and TypeScript source code
	@$(MAKE) -C $(APP_DIR) fmt

test: ## Execute all unit and integration test suites
	@$(MAKE) -C $(APP_DIR) test

# -----------------------------------------------------------------------------
# 4. DESKTOP TAURI APP (ROOT WORKSPACE)
# -----------------------------------------------------------------------------

.PHONY: desktop-dev desktop-build
desktop-dev: ## Run Tauri Desktop App in dev mode
	bun run tauri dev

desktop-build: ## Build release binary of Tauri Desktop App
	bun run tauri build
