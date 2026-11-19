<?php declare(strict_types=1);

/*
 | Real project data from h.i's projects-service (VA3).
 |
 | projects-service owns the projects. This app keeps a copy in its own database:
 |  - `php artisan projects:import` loads every project from its REST API
 |  - `php artisan kafka:consume-source-projects` follows its `projects` topic
 |
 | Both are off while PROJECTS_SOURCE_API_URL / PROJECTS_SOURCE_KAFKA_BROKERS are empty,
 | so the prototype still runs on its own with the sample projects.
 */
return [
    'api_url' => env('PROJECTS_SOURCE_API_URL'),

    'api_path' => env('PROJECTS_SOURCE_API_PATH', '/api/projects'),

    'timeout' => (int) env('PROJECTS_SOURCE_TIMEOUT', 10),

    'kafka_brokers' => env('PROJECTS_SOURCE_KAFKA_BROKERS'),

    'topic' => env('PROJECTS_SOURCE_TOPIC', 'projects'),

    'consumer_group' => env('PROJECTS_SOURCE_CONSUMER_GROUP', 'project-status-source-consumer'),

    /*
     | projects-service status => this app's status.
     |
     | The original status is always stored in `source_status`, so changing this map
     | (or adding statuses to the dashboard) never loses information.
     | `On Hold` and `Cancelled` have no equivalent yet: their mapping is provisional
     | until the team decides whether the dashboard gets its own statuses for them.
     | A status missing from this map is skipped with a warning.
     */
    'status_map' => [
        'Planned' => 'pending',
        'Active' => 'in_progress',
        'On Hold' => 'in_progress',
        'Completed' => 'completed',
        'Cancelled' => 'completed',
    ],
];
