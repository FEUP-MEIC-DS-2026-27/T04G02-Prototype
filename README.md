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

Once the server is up and running, generate the app key into your `.env` and recreate the containers that read it (just once).

macOS / Linux:
```shell
KEY=$(docker compose exec -T app php artisan key:generate --show)
sed -i.bak "s|^APP_KEY=.*|APP_KEY=$KEY|" .env && rm .env.bak
docker compose up -d --force-recreate app laravel-consumer
```

Windows (PowerShell):
```powershell
$key = docker compose exec -T app php artisan key:generate --show
(Get-Content .env) -replace '^APP_KEY=.*', "APP_KEY=$key" | Set-Content .env
docker compose up -d --force-recreate app laravel-consumer
```
(`.env` is not copied into the image, so running `php artisan key:generate` inside the container has no effect. The `-i.bak` form of `sed` works on both macOS and Linux.)

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

## Kafka events

Events on the `project-status-events` topic are JSON objects with:

| Field         | Required | Meaning                                                                                   |
|---------------|----------|-------------------------------------------------------------------------------------------|
| `status`      | yes      | `pending`, `in_progress` or `completed`                                                   |
| `project_id`  | one of   | This app's own project id. Only updates an existing project, never creates one            |
| `external_id` | one of   | Another system's id. Creates the project if it doesn't exist yet, otherwise updates it    |
| `name`        | no       | Project name, used when the project is created (defaults to `Untitled Project`)           |
| `timestamp`   | no       | ISO 8601 time, shown in the dashboard's "Recent SSE Events"                               |

Status changes made from the dashboard publish `project_id` events. Other systems should publish `external_id` events, so their ids never collide with the database's auto-incrementing `id`.
Events with an invalid `status`, or with neither id, are skipped by `laravel-consumer` (it logs a warning).

### Simulating events from another system

`kafka:simulate-projects` uses `ProjectFactory` to publish events for fake projects, as if another system sent them:
```shell
docker compose exec app php artisan kafka:simulate-projects 5 --updates
```

| Argument / option | Default | Meaning                                                              |
|-------------------|---------|----------------------------------------------------------------------|
| `count`           | `10`    | Number of new projects to publish                                    |
| `--delay`         | `500`   | Milliseconds between events (`--delay=0` sends them all at once)     |
| `--updates`       | off     | Also send a second event with a different status for each project    |

The command only publishes events; `laravel-consumer` is what creates the projects. Each fake project gets an `external_id` starting with `sim-`. You should see:
- `Created project #N (external sim-…)` lines in `make logs`, followed by `Updated …` lines when `--updates` is used
- the new projects in the dashboard's table and chart, with their ids assigned by the database

To remove only the simulated projects:
```shell
docker compose exec app php artisan tinker --execute="App\Models\Project::where('external_id', 'like', 'sim-%')->delete();"
```
Or reset everything to the sample projects with `docker compose exec app php artisan migrate:fresh --seed`.

`ProjectFactory` uses Faker, which is a dev dependency (`require-dev`), so the command doesn't work in an image built with `composer install --no-dev`.

To send a single hand-written event instead, use Kafka's console producer (one JSON object per line):
```shell
docker compose exec -T kafka kafka-console-producer --bootstrap-server kafka:29092 --topic project-status-events <<'EOF'
{"external_id":"crm-1001","name":"CRM Import","status":"pending","timestamp":"2026-10-30T12:00:00Z"}
EOF
```
To watch the raw messages on the topic:
```shell
docker compose exec kafka kafka-console-consumer --bootstrap-server kafka:29092 --topic project-status-events
```

## Troubleshooting

**Blank page on `/`**: open the browser console / network tab.
- `app-*.js` fails to load: the frontend was not built (`npm run build`), or the image predates the nginx fix. Rebuild with `docker compose up -d --build`.
- Requests go to `localhost:5173`: a `public/hot` file was left behind by a stopped `npm run dev`. Start Vite again or delete `public/hot`.

**Chart shows all zeros**: the database is empty. Run `docker compose exec app php artisan migrate --seed`.

**"Recent SSE Events" never updates**: check that `sse-hub` and `kafka` are running (`docker compose ps`). Kafka can take a while to start, and the SSE hub retries until it can connect.

**`laravel-consumer` exits right away**: run `docker compose logs laravel-consumer`. If the command is missing, rebuild the image.

**Simulated events don't create projects right away**: after `laravel-consumer` (re)starts, Kafka can take up to ~45 seconds to hand it the topic again. Events sent in that time are processed once it reconnects. Restart it with `docker compose restart laravel-consumer` after changing its code; no rebuild is needed.

**`laravel-consumer` stops with `column "external_id" does not exist`**: the migration hasn't run yet. Run `docker compose exec app php artisan migrate`, then `docker compose restart laravel-consumer`.
