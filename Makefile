.PHONY: up stop restart logs reset

# Build and start everything. Migrations and seeding run automatically in project-status-api.
up:
	docker compose up -d --build

stop:
	docker compose down

restart: stop up

logs:
	docker compose logs -f project-status-api project-status-consumer project-status-sse

# Drop all data (including the database volume) and start again with the sample projects
reset:
	docker compose down -v
	docker compose up -d --build
