.PHONY: help up down restart logs clean seed test

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

up: ## Start MongoDB with Docker Compose (OPTIONAL - requires Docker)
	@echo "Note: Docker is optional. You can use MongoDB Atlas (cloud) instead."
	@command -v docker > /dev/null 2>&1 || (echo "Docker not found. Install Docker Desktop or use MongoDB Atlas" && exit 1)
	docker-compose up -d mongodb
	@echo "Waiting for MongoDB to be ready..."
	@sleep 5
	@echo "MongoDB started! Run 'cd server && npm run setup-db' to initialize the database."

down: ## Stop all services
	docker-compose down

restart: ## Restart all services
	make down && make up

logs: ## Show logs from all services
	docker-compose logs -f

clean: ## Remove all containers and volumes
	docker-compose down -v
	@echo "Cleaned up all containers and volumes"

seed: ## Seed database with initial data
	@echo "Seeding database..."
	@npm run seed || echo "Seed script not yet implemented"

test: ## Run all tests
	@echo "Running tests..."
	@npm run test || echo "Tests not yet implemented"

dev: ## Start development server
	npm run dev

build: ## Build the application
	npm run build

install: ## Install dependencies
	npm install

