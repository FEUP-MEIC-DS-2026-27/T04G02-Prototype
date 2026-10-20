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

then run :
```shell
docker compose up --build
```


Once the server is up and running, run this :
```shell
$key = docker compose exec -T app php artisan key:generate --show
(Get-Content .env) -replace '^APP_KEY=.*', "APP_KEY=$key" | Set-Content .env
```
(`.env` is not copied into the image, so running `php artisan key:generate` inside the container has no effect.)


To stop Docker, in an other terminal :
```shell
docker compose down
```
