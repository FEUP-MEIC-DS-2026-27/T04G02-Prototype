<?php

namespace App\Console\Commands;

use App\Services\ProjectSourceSync;
use Illuminate\Console\Command;
use Junges\Kafka\Contracts\ConsumerMessage;
use Junges\Kafka\Facades\Kafka;

class ConsumeSourceProjectEvents extends Command
{
    protected $signature = 'kafka:consume-source-projects';

    protected $description = "Follow h.i's projects-service topic and keep the projects table in sync";

    public function handle(ProjectSourceSync $sync): int
    {
        $brokers = config('project_source.kafka_brokers');

        if (! is_string($brokers) || $brokers === '') {
            $this->error('PROJECTS_SOURCE_KAFKA_BROKERS is not set, nothing to consume.');

            return self::FAILURE;
        }

        $consumer = Kafka::consumer([config('project_source.topic')], config('project_source.consumer_group'), $brokers)
            ->withAutoCommit()
            ->withHandler(fn (ConsumerMessage $message) => $this->handleEvent($sync, $message->getBody()))
            ->build();

        $consumer->consume();

        return self::SUCCESS;
    }

    // {"type": "created|updated|deleted", "projectId": ..., "project": {...}}; null bodies are tombstones
    private function handleEvent(ProjectSourceSync $sync, mixed $event): void
    {
        if (! is_array($event)) {
            return;
        }

        $type = $event['type'] ?? null;
        $externalId = $event['projectId'] ?? ($event['project']['id'] ?? null);

        if (! is_string($externalId) || $externalId === '') {
            $this->warn('Skipping event without projectId: '.json_encode($event));

            return;
        }

        if ($type === 'deleted') {
            if ($sync->delete($externalId)) {
                $sync->publish(null, $externalId, deleted: true);
                $this->info("Deleted project (external {$externalId})");
            }

            return;
        }

        if (! in_array($type, ['created', 'updated'], true) || ! is_array($event['project'] ?? null)) {
            $this->warn('Skipping unsupported event: '.json_encode($event));

            return;
        }

        $project = $sync->upsert($event['project']);

        if (! $project) {
            $this->warn('Skipping project with an unknown status: '.json_encode($event['project']));

            return;
        }

        $sync->publish($project, $externalId);
        $this->info(($project->wasRecentlyCreated ? 'Created' : 'Updated')
            ." project #{$project->id} (external {$externalId}) -> {$project->status} ({$project->source_status})");
    }
}
