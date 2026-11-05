#!/usr/bin/env bash
# API role: php-fpm in the background, nginx in the foreground (keeps the container alive)
set -euo pipefail

php-fpm -D
exec nginx -g "daemon off;"
