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

# Set the working directory for the application code
WORKDIR /var/www

# Install PHP dependencies inside the container
COPY composer.json composer.lock ./
RUN composer install --optimize-autoloader --prefer-dist --no-progress --no-interaction --no-scripts

# Copy application source into the image (owned by www-data)
COPY --chown=www-data:www-data . .

# Copy container configuration and entrypoint
COPY ./etc/php/php.ini /usr/local/etc/php/conf.d/php.ini
COPY ./etc/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY docker_run.sh /docker_run.sh

# Ensure entrypoint script is executable
RUN chmod +x /docker_run.sh

# Expose HTTP port
EXPOSE 80

# Entrypoint: run php-fpm in background + nginx in foreground
CMD ["/docker_run.sh"]