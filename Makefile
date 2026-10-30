.PHONY: dev up stop restart logs setup

# Main entrypoint: runs full setup if needed, boots Docker, migrates/seeds, and starts Vite
dev: setup
	@echo "Stopping local PostgreSQL service..."
	-@sudo systemctl stop postgresql 2>/dev/null || true
	@echo "Starting Docker Compose stack..."
	docker compose up -d
	@echo "Running database migrations & seeders..."
	docker compose exec app php artisan migrate:fresh --seed
	@echo "Clearing Laravel caches..."
	docker compose exec app php artisan route:clear
	docker compose exec app php artisan config:clear
	@echo "Starting Vite dev server..."
	npm run dev

# Helper target to automate first-time environment setup
setup:
	@if [ ! -f .env ]; then \
		echo "Creating .env file from .env.example..."; \
		cp .env.example .env; \
	fi
	@if [ ! -d node_modules ]; then \
		echo "Installing Node dependencies..."; \
		npm install --legacy-peer-deps; \
	fi
	docker compose up -d app postgres
	@echo "Ensuring Application Key exists..."
	docker compose exec app php artisan key:generate --no-interaction

up:
	-@sudo systemctl stop postgresql 2>/dev/null || true
	docker compose up -d

stop:
	docker compose down

logs:
	docker compose logs -f app laravel-consumer sse-hub