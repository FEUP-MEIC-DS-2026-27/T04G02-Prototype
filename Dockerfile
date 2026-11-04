FROM php:8.3-fpm

# Install system dependencies, build tools, and required PHP extensions
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       nginx \
       libpq-dev \
       ca-certificates \
       zip \
       unzip \
       git \
       autoconf \
       build-essential \
       librdkafka-dev \
    && docker-php-ext-install pdo_pgsql \
    && pecl install rdkafka \
    && docker-php-ext-enable rdkafka \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

# Install Composer from its official image
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www

# Install PHP dependencies first so this layer is cached until composer.lock changes
COPY composer.json composer.lock ./
RUN composer install --no-dev --prefer-dist --no-progress --no-interaction --no-scripts --no-autoloader

# Copy the application code, then build the optimized autoloader and package manifest
COPY --chown=www-data:www-data . .
RUN composer dump-autoload --no-dev --optimize --no-scripts \
    && php artisan package:discover --ansi \
    && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

# Container configuration
COPY ./etc/php/php.ini /usr/local/etc/php/conf.d/php.ini
COPY ./etc/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint
COPY docker/serve.sh /usr/local/bin/serve
RUN chmod +x /usr/local/bin/entrypoint /usr/local/bin/serve

# Defaults for running from the image alone; compose overrides them
ENV APP_ENV=production \
    APP_DEBUG=false \
    APP_URL=http://localhost:8009 \
    LOG_CHANNEL=stderr \
    DB_CONNECTION=pgsql \
    DB_HOST=project-status-db \
    DB_PORT=5432 \
    DB_DATABASE=laravel \
    DB_USERNAME=laravel \
    DB_PASSWORD=secret \
    CACHE_STORE=file \
    SESSION_DRIVER=file \
    QUEUE_CONNECTION=sync \
    KAFKA_BROKERS=project-status-kafka:29092 \
    KAFKA_OFFSET_RESET=earliest \
    CORS_ORIGINS=http://localhost:3000,http://localhost:3003,http://localhost:3005 \
    RUN_MIGRATIONS=true

EXPOSE 8009

# The entrypoint prepares Laravel, then runs the command.
# Default: the API (php-fpm + nginx). Consumer: `php artisan kafka:consume-projects`.
ENTRYPOINT ["entrypoint"]
CMD ["serve"]
