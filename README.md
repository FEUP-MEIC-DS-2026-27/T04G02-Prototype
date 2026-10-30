# T04G02-Prototype
This is the repo for a prototype created by T04G02

Display interactive graphs to explore projects by status.

## Idea of architecture :
```
+-----------------------------------------------------------------------+
|                          FRONTEND (Micro-frontends)                   |
|                                                                       |
|  +-------------------------+          +----------------------------+  |
|  | Project Filter          |          | Chart Micro-frontend       |  |
|  | (Status Select)         |          | (React + ECharts/Recharts) |  |
|  +------------+------------+          +-------------+--------------+  |
|               |                                     |                 |
|               | Frontend EventBus                   | SSE/EventSource |
|               | (mitt/tiny-emitter)                 | (or WebSocket)  |
|               +------------------+                  |                 |
+----------------------------------|------------------|-----------------+
                                   |                  |
                                   v                  v
+-----------------------------------------------------------------------+
|                        MICRO-BACKEND (Laravel API)                    |
|                                                                       |
|  +------------------+    +------------------+    +-----------------+  |
|  | Controller       |--->| Model / Eloquent |--->| Database        |  |
|  | (REST + SSE)     |    | (Project)        |    | (MySQL/PG)      |  |
|  +--------+---------+    +------------------+    +-----------------+  |
|           |                                                           |
|           | Publishes Events (Laravel Events)                         |
|           v                                                           |
|  +------------------+                                                 |
|  | Kafka Producer   |                                                 |
|  | (Topic: projects)|                                                 |
|  +--------+---------+                                                 |
+-----------|-----------------------------------------------------------+
            |
            v
+-----------------------------------------------------------------------+
|                            MESSAGE BROKER                             |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |                              KAFKA                              |  |
|  |                    (Topic: project-status-events)               |  |
|  +----------------+------------------------------+-----------------+  |
+-------------------|------------------------------|--------------------+
                    |                              |
                    v                              v
+--------------------------------------+ +------------------------------+
|   LARAVEL KAFKA CONSUMER             | |   SSE HUB / PUSH SERVICE     |
|   (Background worker updating DB)    | |   (Reads Kafka, pushes to    |
|   *Optional if DB is the source of   | |    connected React clients)  |
|    truth and Kafka is just for logs* | |                              |
+--------------------------------------+ +------------------------------+

```

## Installing 

In a fresh install, you must run :
```shell
cp .env.example .env
```
then build the image and install the PHP dependencies in the shared project volume:
```shell
docker compose build app
docker compose run --rm --no-deps --entrypoint composer app install --optimize-autoloader --prefer-dist --no-progress --no-interaction --no-scripts
docker compose up -d
```

Once the server is up and running, generate the app key into your `.env` and recreate the container (just once):
```shell
$key = docker compose exec -T app php artisan key:generate --show
(Get-Content .env) -replace '^APP_KEY=.*', "APP_KEY=$key" | Set-Content .env
```

OR

```shell
$key = docker compose exec -T app php artisan key:generate --show
(Get-Content .env) -replace '^APP_KEY=.*', "APP_KEY=$key" | Set-Content .env
docker compose up -d --force-recreate app
```
(`.env` is not copied into the image, so running `php artisan key:generate` inside the container has no effect.)
On macOS, use `sed -i ''` instead of `sed -i`.

Create the tables and seed the sample projects:
```shell
docker compose exec app php artisan migrate --seed
```

Build the frontend (the dashboard is a React app bundled by Vite; without this step `/` is a blank page):
```shell
docker compose exec app npm install
docker compose exec app npm run build
```
For development with hot reload, run `npm install && npm run dev` on your machine instead and keep it running.
Don't mix the two: `node_modules` is shared with the container through the volume, so install from the same place you build or run Vite.

The dashboard is at http://localhost:8000.

### After pulling changes
`Dockerfile`, `etc/nginx/default.conf` and `etc/php/php.ini` are baked into the image, so rebuild when any of them changes:
```shell
docker compose up -d --build
```
Re-run `npm run build` (or restart `npm run dev`) when `resources/js` or `package.json` changes, and `php artisan migrate` when there are new migrations.

## Services

| Service            | URL / port              | Purpose                                                 |
|--------------------|-------------------------|---------------------------------------------------------|
| `app`              | http://localhost:8000   | Laravel API + dashboard (nginx + php-fpm)               |
| `sse-hub`          | http://localhost:3001   | Reads Kafka and pushes events to the browser over SSE   |
| `laravel-consumer` | -                       | Runs `php artisan kafka:consume-projects`               |
| `kafka`            | localhost:9092          | Topic `project-status-events`                           |
| `postgres`         | localhost:5432          | Database                                                |
| Vite (`npm run dev`) | http://localhost:5173 | Only while developing with hot reload                   |

`make logs` follows the logs of `app`, `laravel-consumer` and `sse-hub`.

## Troubleshooting

**Blank page on `/`**: open the browser console / network tab.
- `app-*.js` fails to load: the frontend was not built (`npm run build`), or the image predates the nginx fix. Rebuild with `docker compose up -d --build`.
- Requests go to `localhost:5173`: a `public/hot` file was left behind by a stopped `npm run dev`. Start Vite again or delete `public/hot`.

**Chart shows all zeros**: the database is empty. Run `docker compose exec app php artisan migrate --seed`.

**"Recent SSE Events" never updates**: check that `sse-hub` and `kafka` are running (`docker compose ps`). Kafka can take a while to start, and the SSE hub retries until it can connect.

**`laravel-consumer` exits right away**: run `docker compose logs laravel-consumer`. If the command is missing, rebuild the image.
