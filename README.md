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
- `project-status-api`: the default command (`serve`), php-fpm + nginx on port 8009
- `project-status-consumer`: `php artisan kafka:consume-projects`

Both read `DB_*` and `KAFKA_BROKERS` from the environment, and `docker/entrypoint.sh` caches the config from those values on start.
The image is built with `composer install --no-dev`.
The consumer group starts from the earliest offset the first time (`KAFKA_OFFSET_RESET=earliest`), so events published before the consumer is ready aren't skipped.

## Services

| Service                    | URL / port                          | Purpose                                               |
|----------------------------|-------------------------------------|-------------------------------------------------------|
| `project-status-frontend`  | http://localhost:3005               | Dashboard: remote for h.i's VA3, also standalone |
| `project-status-api`       | http://localhost:8011/api/projects  | Laravel API (nginx + php-fpm)                         |
| `project-status-sse`       | http://localhost:8012/events        | Reads Kafka and pushes events to the browser over SSE |
| `project-status-consumer`  | -                                   | Runs `php artisan kafka:consume-projects`             |
| `project-status-kafka`     | internal only (`project-status-kafka:29092`) | Topic `project-status-events`                |
| `project-status-zookeeper` | internal only                       | Used by Kafka                                         |
| `project-status-db`        | internal only                       | Postgres, data kept in the `project-status-db-data` volume |

The API and the SSE hub only accept the origins in `CORS_ORIGINS` (default: `localhost:3000`, `3003` and `3005`).

The `projects` table lives in our own database (`project-status-db`), not in VA3's `search-db`. This service backs its own micro-frontend, so it owns its data. Other systems reach it through Kafka events (see below), not through a shared database.

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

Publish events with Kafka's console producer, one JSON object per line. Use an `external_id` starting with `sim-` so the test projects are easy to clean up:
```shell
docker compose exec -T project-status-kafka kafka-console-producer --bootstrap-server project-status-kafka:29092 --topic project-status-events <<'EOF'
{"external_id":"sim-1","name":"CRM Import","status":"pending","timestamp":"2026-10-30T12:00:00Z"}
{"external_id":"sim-2","name":"Billing Sync","status":"in_progress"}
{"external_id":"sim-1","status":"completed"}
EOF
```
The producer only publishes events; `project-status-consumer` is what creates the projects. You should see:
- `Created project #N (external sim-1)` lines in `make logs`, followed by `Updated …` when the same `external_id` is sent again
- the new projects in `GET http://localhost:8011/api/projects`, with their ids assigned by the database

To watch the raw messages on the topic:
```shell
docker compose exec project-status-kafka kafka-console-consumer --bootstrap-server project-status-kafka:29092 --topic project-status-events
```

To remove only the simulated projects:
```shell
docker compose exec project-status-api php artisan tinker --execute="App\Models\Project::where('external_id', 'like', 'sim-%')->delete();"
```
Or reset everything to the sample projects with `make reset` (this also deletes the database volume).

> **`php artisan kafka:simulate-projects` doesn't work in the Docker image.** It builds fake projects with `ProjectFactory`, which needs Faker. Faker is a dev dependency, and the image is built with `composer install --no-dev` so test tools stay out of production. For the same reason, `migrate:fresh --seed` fails in the container, because `DatabaseSeeder` also uses a factory.

## Troubleshooting

**Chart shows all zeros**: the projects table is empty. Restart `project-status-api` to re-seed it, or run `make reset`.

**"Recent SSE Events" never updates**: check that `project-status-sse` and `project-status-kafka` are running (`docker compose ps`). Kafka can take a while to start, and the SSE hub retries until it can connect.

**`project-status-consumer` exits right away**: run `docker compose logs project-status-consumer`. If the command is missing, rebuild the image.

**Simulated events don't create projects right away**: after `project-status-consumer` (re)starts, Kafka can take up to ~45 seconds to hand it the topic again. Events sent in that time are processed once it reconnects. After changing its code, rebuild it with `docker compose up -d --build project-status-consumer` (the code is baked into the image).

**`project-status-consumer` stops with `column "external_id" does not exist`**: the migration hasn't run yet. Run `docker compose exec project-status-api php artisan migrate`, then `docker compose restart project-status-consumer`.
