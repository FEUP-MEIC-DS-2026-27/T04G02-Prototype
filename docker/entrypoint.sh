#!/usr/bin/env bash
# Prepares Laravel from environment variables, then runs the container command:
#   serve                               -> API (default CMD)
#   php artisan kafka:consume-projects  -> Kafka consumer
set -euo pipefail

cd /var/www

# APP_KEY comes from the environment. Without one, generate a throwaway key so the
# image still starts on its own (fine here: the API is stateless and has no logins).
if [ -z "${APP_KEY:-}" ]; then
    echo "entrypoint: APP_KEY is not set, generating a temporary one" >&2
    export APP_KEY="base64:$(head -c 32 /dev/urandom | base64)"
fi

# Cache config from the current environment (DB_*, KAFKA_BROKERS, ...)
php artisan config:cache
php artisan route:cache

# Only the API runs migrations, so the consumer never races it
if [ "${1:-}" = "serve" ] && [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    php artisan migrate --force

    # Seed the sample projects only on an empty table (ProjectSeeder truncates)
    has_projects=$(php artisan tinker --execute='echo App\Models\Project::query()->exists() ? "yes" : "no";' | tail -n 1)
    if [ "$has_projects" = "no" ]; then
        php artisan db:seed --class=ProjectSeeder --force
    fi
fi

exec "$@"
