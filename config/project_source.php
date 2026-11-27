<?php declare(strict_types=1);

// Real projects from h.i's projects-service. Empty URL/brokers = sample projects only.
return [
    'api_url' => env('PROJECTS_SOURCE_API_URL'),

    'api_path' => env('PROJECTS_SOURCE_API_PATH', '/api/projects'),

    'timeout' => (int) env('PROJECTS_SOURCE_TIMEOUT', 10),

    'kafka_brokers' => env('PROJECTS_SOURCE_KAFKA_BROKERS'),

    'topic' => env('PROJECTS_SOURCE_TOPIC', 'projects'),

    'consumer_group' => env('PROJECTS_SOURCE_CONSUMER_GROUP', 'project-status-source-consumer'),

    // Where a new consumer group starts. `latest`: the import catches up instead of replaying
    // the topic. Separate from KAFKA_OFFSET_RESET, which the image sets to `earliest` for
    // kafka:consume-projects.
    'offset_reset' => env('PROJECTS_SOURCE_OFFSET_RESET', 'latest'),

    // projects-service status => our status. Unknown statuses are skipped.
    'status_map' => [
        'Planned' => 'planned',
        'Active' => 'active',
        'On Hold' => 'on_hold',
        'Completed' => 'completed',
        'Cancelled' => 'cancelled',
    ],
];
