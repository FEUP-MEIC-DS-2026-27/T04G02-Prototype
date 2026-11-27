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
`make up`, `make stop`, `make logs`, `make reset` (drops the database volume) and `make test` (see [Testing](#testing)) wrap the usual commands.

Running next to h.i: h.i only publishes its shell (port 80), so this stack can use 8340 and 8341. If something else already uses them (for example your own `compose.override.yaml` in h.i), start this one on other host ports with `API_HOST_PORT=8350 SSE_HOST_PORT=8351 docker compose up -d --build` (or set them in `.env`). The dashboard is built to call those ports.

A `.env` file is optional: `compose.yaml` has defaults for everything, and `.env.example` lists what you can override.
Without an `APP_KEY`, the container generates a temporary one on each start. That's fine because the API has no sessions or logins. To pin one, run `docker compose run --rm --no-deps project-status-api php artisan key:generate --show` and put the result in `.env`.

The code is baked into the image (there is no source volume), so rebuild after any change: `docker compose up -d --build`.

### One image, two roles

The root `Dockerfile` builds a single image used by two services:
- `project-status-api`: the default command (`serve`), php-fpm + nginx on port 8340
- `project-status-consumer`: `php artisan kafka:consume-projects`

Both read `DB_*` and `KAFKA_BROKERS` from the environment, and `docker/entrypoint.sh` caches the config from those values on start.
The image is built with `composer install --no-dev`.
The consumer group starts from the earliest offset the first time (`KAFKA_OFFSET_RESET=earliest`), so events published before the consumer is ready aren't skipped.

## Services

| Service                    | URL / port                          | Purpose                                               |
|----------------------------|-------------------------------------|-------------------------------------------------------|
| `project-status-frontend`  | http://localhost:3005               | Dashboard: remote for h.i's VA3, also standalone |
| `project-status-api`       | http://localhost:8340/api/projects  | Laravel API (nginx + php-fpm)                         |
| `project-status-sse`       | http://localhost:8341/events        | Reads Kafka and pushes events to the browser over SSE |
| `project-status-consumer`  | -                                   | Runs `php artisan kafka:consume-projects`             |
| `project-status-kafka`     | internal only (`project-status-kafka:29092`) | Topic `project-status-events`                |
| `project-status-zookeeper` | internal only                       | Used by Kafka                                         |
| `project-status-db`        | internal only                       | Postgres, data kept in the `project-status-db-data` volume |

### Dashboard props

h.i's VA3 loads the dashboard as the federated module `project_status/Dashboard`. All props are optional:

| Prop      | Default (standalone)              | Inside h.i (through the gateway) |
|-----------|-----------------------------------|----------------------------------|
| `apiUrl`  | `http://localhost:8340`           | `''` (same origin)               |
| `apiPath` | `/api/projects`                   | `/api/project-status`            |
| `sseUrl`  | `http://localhost:8341/events`    | `/api/project-status/events`     |

Adding an optional prop is compatible. Bump `contractVersion` only when a change would break a host that still passes the old props.

The API and the SSE hub only accept the origins in `CORS_ORIGINS` (default: `localhost:3000`, `3003` and `3005`).

The `projects` table lives in our own database (`project-status-db`), not in VA3's `search-db`. This service backs its own micro-frontend, so it owns its data. Other systems reach it through Kafka events (see below), not through a shared database.

## Kafka events

Events on the `project-status-events` topic are JSON objects with:

| Field         | Required | Meaning                                                                                   |
|---------------|----------|-------------------------------------------------------------------------------------------|
| `status`      | yes      | `planned`, `active`, `on_hold`, `completed` or `cancelled` (see [Statuses](#statuses))    |
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
{"external_id":"sim-1","name":"CRM Import","status":"planned","timestamp":"2026-10-30T12:00:00Z"}
{"external_id":"sim-2","name":"Billing Sync","status":"active"}
{"external_id":"sim-1","status":"completed"}
EOF
```
The producer only publishes events; `project-status-consumer` is what creates the projects. You should see:
- `Created project #N (external sim-1)` lines in `make logs`, followed by `Updated …` when the same `external_id` is sent again
- the new projects in `GET http://localhost:8340/api/projects`, with their ids assigned by the database

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

## Real project data from h.i

The sample projects are only used when nothing else is configured. With h.i running, the projects come from VA3's `projects-service`, which owns them.

### Before you start

This stack replaces h.i's own project status services, so run only the h.i services it reads from. In h.i's `federation-value-areas` folder:

```shell
# What this stack reads: the projects API and the broker with the `projects` topic
docker compose up -d projects-service post-events-service
# h.i's copy of this stack uses the same ports (8340, 8341) and service names
docker compose stop $(docker compose config --services | grep '^project-status-')
```

Then, from this repository:

```shell
docker compose -f compose.yaml -f compose.hi.yaml up -d --build
```

Most missing pieces fail quietly, so check these if the dashboard shows the wrong data:
- h.i never started (no `federation-value-areas_default` network): `up` stops with `network federation-value-areas_default not found`.
- `projects-service` isn't running: the import fails (see `docker compose -f compose.yaml -f compose.hi.yaml logs project-status-api`) and the dashboard keeps the projects it already had, or the sample projects. Once it is up, run `docker compose -f compose.yaml -f compose.hi.yaml restart project-status-api`.
- `post-events-service` isn't running: `project-status-source-consumer` keeps restarting and the dashboard doesn't update live.
- h.i's `project-status-*` services are running: both stacks then have a `project-status-api` on h.i's network, so h.i's gateway may send VA3's requests to this stack's API instead of its own. h.i doesn't publish their ports, so nothing reports a clash.

`compose.hi.yaml` joins h.i's Docker network and:
- has `project-status-api` run `php artisan projects:import --without-samples` on start: it loads every project from `GET /api/projects` and removes the sample projects (only those without an `external_id`) once at least one project was imported. It also removes the projects it imported before that are no longer in projects-service (deleted while the consumer wasn't running); projects from other systems are kept. If the request fails, or none of the projects can be imported (unknown status or no id), the command fails and the API still starts with what the table already has.
- adds `project-status-source-consumer` (`php artisan kafka:consume-source-projects`), which follows the `projects` topic on h.i's `post-events-kafka` (`created`, `updated` and `deleted` events) and republishes each change on `project-status-events`, so the dashboard updates live. On start it runs the same import first, then reads only new messages (`PROJECTS_SOURCE_OFFSET_RESET=latest`; the image's `KAFKA_OFFSET_RESET=earliest` is for `project-status-consumer`), so changes made while it wasn't running come from the API rather than from replaying the topic.

Source projects are matched on `external_id` (their id, e.g. `INE-25-0001`). Their `title` becomes `name` and their `end` date becomes `deadline`. projects-service owns their status and deadline: the dashboard shows "Set in projects-service" instead of the status select, and `POST /api/projects/{id}/status` and `/deadline` answer 409 for them, since the next sync would overwrite the change. Their milestones can still be edited.

| Variable                         | Default    | Meaning                                                   |
|----------------------------------|------------|-----------------------------------------------------------|
| `PROJECTS_SOURCE_API_URL`        | (empty)    | projects-service base URL. Empty = no import              |
| `PROJECTS_SOURCE_KAFKA_BROKERS`  | (empty)    | Broker with the `projects` topic. Empty = consumer exits  |
| `PROJECTS_SOURCE_TOPIC`          | `projects` | Topic to follow                                           |
| `PROJECTS_SOURCE_OFFSET_RESET`   | `latest`   | Where a new consumer group starts on that topic           |

### Statuses

The dashboard uses the same five statuses as projects-service (`Project::STATUSES`). `config/project_source.php` maps their names, and the original one is also stored in `source_status`:

| projects-service | `status`    | Dashboard        |
|------------------|-------------|------------------|
| Planned          | `planned`   | grey             |
| Active           | `active`    | blue             |
| On Hold          | `on_hold`   | yellow           |
| Completed        | `completed` | green            |
| Cancelled        | `cancelled` | red              |

A status missing from the map is skipped with a warning.

The old `pending` and `in_progress` statuses were renamed (migration `2026_11_19_110000_use_project_service_statuses`) and the API now rejects them with a 422. h.i's tests that mock this API must use the new names.

### Known limitations

- In h.i's development stack, `post-events-service` generates simulated changes on the topic only; the projects-service API keeps the original data. Restarting `project-status-api` re-imports that original data, and the dashboard catches up as new events arrive.
- projects-service owns the status, so a status changed from the dashboard is overwritten by the next event for that project.

## Testing

### Backend (Laravel)

```shell
make test
```
This runs the PHPUnit suite in a throwaway container built from the API image, so you don't need PHP installed and the rest of the stack doesn't need to be running. The dev dependencies (PHPUnit, Faker, …) are installed into the `project-status-test-vendor` volume, not into the image.

The tests always use an in-memory SQLite database and fake Kafka, so they never touch `project-status-db` or `project-status-kafka`.

> **Don't use `docker compose exec project-status-api php artisan test`.** The running API container has no dev dependencies, and its config is cached for Postgres. The tests refuse to start when they aren't on the in-memory SQLite database, so your data stays safe, but they won't run there.

Without Docker (PHP 8.3 with the `rdkafka` extension):
```shell
composer install
cp .env.example .env
php artisan key:generate
php artisan test
```
To run one file or test: `php artisan test --filter=UpdateProjectStatusTest`.

| Folder                  | What it covers                                                               |
|-------------------------|------------------------------------------------------------------------------|
| `tests/Feature/Api`     | `GET /api/projects` (stats for the five statuses), `POST /api/projects/{id}/status` (incl. the Kafka event it publishes, rejecting the old statuses), CORS for the h.i origins |
| `tests/Feature/Kafka`   | `kafka:consume-projects`: updates by `project_id`, create/update by `external_id`, skipped events. `kafka:consume-source-projects`: created/updated/deleted events from projects-service, tombstones, republishing, the import before consuming |
| `tests/Feature/ProjectSource` | `projects:import`: status mapping, re-imports, removing the samples and deleted projects, failed requests (HTTP faked) |

### Frontend (dashboard)

```shell
cd frontend
npm ci
npm run typecheck
npm run build   # optional, enables the build-output check below
npm test        # or `npm run test:watch` while developing
```

| File                                       | What it covers                                                     |
|--------------------------------------------|--------------------------------------------------------------------|
| `tests/ProjectStatusTracker.test.tsx`      | The dashboard against a fake API and SSE hub: loading, status changes, errors, live events, reconnecting, closing the connection on unmount |
| `tests/ProjectStatusTracker.filters.test.tsx` | Funding programme and project filters (same cases as h.i's browser test), and the `apiPath` prop used behind the h.i gateway |
| `tests/ProjectStatusTracker.deadlineFilter.test.tsx` | Deadline range filter: which projects, totals, chart and live events it keeps, reversed ranges, clearing |
| `tests/DateField.test.tsx` | The calendar of the deadline filter: choosing and clearing a date, keyboard, closing, month arithmetic |
| `tests/federation-contract.test.ts`        | What h.i's VA3 relies on: remote name `project_status`, the `./Dashboard` expose, shared React/router versions, `contractVersion`, and `dist/mf-manifest.json` (only after `npm run build`) |

If a federation contract test fails, h.i will break too. Change `packages/config/src/federation.ts` in h.i at the same time, or don't make the change.

### CI

`.github/workflows/tests.yml` runs both suites on every push and pull request. The frontend job type-checks, builds, then runs the tests, so the build-output check always runs there.

## Troubleshooting

**Chart shows all zeros**: the projects table is empty. Restart `project-status-api` to re-seed it, or run `make reset`.

**"Recent SSE Events" never updates**: check that `project-status-sse` and `project-status-kafka` are running (`docker compose ps`). Kafka can take a while to start, and the SSE hub retries until it can connect.

**`php artisan test` says the tests must run on the in-memory SQLite database**: the config is cached (for example inside the API container). Use `make test`, or run `php artisan config:clear` before testing locally.

**`project-status-consumer` exits right away**: run `docker compose logs project-status-consumer`. If the command is missing, rebuild the image.

**Simulated events don't create projects right away**: after `project-status-consumer` (re)starts, Kafka can take up to ~45 seconds to hand it the topic again. Events sent in that time are processed once it reconnects. After changing its code, rebuild it with `docker compose up -d --build project-status-consumer` (the code is baked into the image).

**`project-status-consumer` stops with `column "external_id" does not exist`**: the migration hasn't run yet. Run `docker compose exec project-status-api php artisan migrate`, then `docker compose restart project-status-consumer`.
