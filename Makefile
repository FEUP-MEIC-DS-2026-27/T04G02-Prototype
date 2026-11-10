.PHONY: up stop restart logs reset test

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

# Run the backend tests in a throwaway container from the API image (needs no local PHP).
# Dev dependencies go into a named volume, so neither the running API nor its database is touched.
test:
	docker compose run --rm --no-deps --build \
		-v "$(CURDIR)":/app -v project-status-test-vendor:/app/vendor -w /app \
		--entrypoint sh project-status-api \
		-c 'composer install --no-interaction --no-progress --quiet && php artisan config:clear --quiet && php artisan test'
