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

## Running

From a fresh clone, with no other setup:
```shell
docker compose up -d --build
```
The API container runs the migrations on start and seeds the sample projects when the table is empty. The consumer waits for the API to be healthy, so the tables always exist before it starts.
`make up`, `make stop`, `make logs` and `make reset` (drops the database volume) wrap the usual commands.

A `.env` file is optional: `compose.yaml` has defaults for everything, and `.env.example` lists what you can override.
Without an `APP_KEY`, the container generates a temporary one on each start. That's fine because the API has no sessions or logins. To pin one, run `docker compose run --rm --no-deps project-status-api php artisan key:generate --show` and put the result in `.env`.

The code is baked into the image (there is no source volume), so rebuild after any change: `docker compose up -d --build`.

### One image, two roles

The root `Dockerfile` builds a single image used by two services:
- `project-status-api`: the default command (`serve`), php-fpm + nginx on port 8007
- `project-status-consumer`: `php artisan kafka:consume-projects`

Both read `DB_*` and `KAFKA_BROKERS` from the environment, and `docker/entrypoint.sh` caches the config from those values on start.
The image is built with `composer install --no-dev`.

## Services

| Service                    | URL / port                          | Purpose                                               |
|----------------------------|-------------------------------------|-------------------------------------------------------|
| `project-status-api`       | http://localhost:8007/api/projects  | Laravel API (nginx + php-fpm)                         |
| `project-status-sse`       | http://localhost:8008/events        | Reads Kafka and pushes events to the browser over SSE |
| `project-status-consumer`  | -                                   | Runs `php artisan kafka:consume-projects`             |
| `project-status-kafka`     | internal only (`project-status-kafka:29092`) | Topic `project-status-events`                |
| `project-status-zookeeper` | internal only                       | Used by Kafka                                         |
| `project-status-db`        | internal only                       | Postgres, data kept in the `project-status-db-data` volume |

The SSE hub only accepts the origins in `CORS_ORIGINS` (default: `localhost:3000`, `3003` and `3005`).

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
Events with an invalid `status`, or with neither id, are skipped by `project-status-consumer` (it logs a warning).

### Simulating events from another system

`kafka:simulate-projects` uses `ProjectFactory` to publish events for fake projects, as if another system sent them:
```shell
docker compose exec project-status-api php artisan kafka:simulate-projects 5 --updates
```

| Argument / option | Default | Meaning                                                              |
|-------------------|---------|----------------------------------------------------------------------|
| `count`           | `10`    | Number of new projects to publish                                    |
| `--delay`         | `500`   | Milliseconds between events (`--delay=0` sends them all at once)     |
| `--updates`       | off     | Also send a second event with a different status for each project    |

The command only publishes events; `project-status-consumer` is what creates the projects. Each fake project gets an `external_id` starting with `sim-`. You should see:
- `Created project #N (external sim-…)` lines in `make logs`, followed by `Updated …` lines when `--updates` is used
- the new projects in the dashboard's table and chart, with their ids assigned by the database

To remove only the simulated projects:
```shell
docker compose exec project-status-api php artisan tinker --execute="App\Models\Project::where('external_id', 'like', 'sim-%')->delete();"
```
Or reset everything to the sample projects with `docker compose exec project-status-api php artisan migrate:fresh --seed`.

`ProjectFactory` uses Faker, which is a dev dependency (`require-dev`), so the command doesn't work in an image built with `composer install --no-dev`.

To send a single hand-written event instead, use Kafka's console producer (one JSON object per line):
```shell
docker compose exec -T project-status-kafka kafka-console-producer --bootstrap-server project-status-kafka:29092 --topic project-status-events <<'EOF'
{"external_id":"crm-1001","name":"CRM Import","status":"pending","timestamp":"2026-10-30T12:00:00Z"}
EOF
```
To watch the raw messages on the topic:
```shell
docker compose exec project-status-kafka kafka-console-consumer --bootstrap-server project-status-kafka:29092 --topic project-status-events
```

## Troubleshooting

**Blank page on `/`**: expected. The image no longer builds the Vite/Blade dashboard; it is moving to the `frontend/` Module Federation app.

**Chart shows all zeros**: the projects table is empty. Restart `project-status-api` to re-seed it, or run `make reset`.

**"Recent SSE Events" never updates**: check that `project-status-sse` and `project-status-kafka` are running (`docker compose ps`). Kafka can take a while to start, and the SSE hub retries until it can connect.

**`project-status-consumer` exits right away**: run `docker compose logs project-status-consumer`. If the command is missing, rebuild the image.

**Simulated events don't create projects right away**: after `project-status-consumer` (re)starts, Kafka can take up to ~45 seconds to hand it the topic again. Events sent in that time are processed once it reconnects. Restart it with `docker compose restart project-status-consumer` after changing its code; no rebuild is needed.

**`project-status-consumer` stops with `column "external_id" does not exist`**: the migration hasn't run yet. Run `docker compose exec project-status-api php artisan migrate`, then `docker compose restart project-status-consumer`.
