<?php

namespace App\Console\Commands;

use App\Models\Project;
use Illuminate\Console\Command;
use Junges\Kafka\Contracts\ConsumerMessage;
use Junges\Kafka\Facades\Kafka;

class ConsumeProjectEvents extends Command
{
    protected $signature = 'kafka:consume-projects';

    protected $description = 'Consume project status events from Kafka and keep the projects table in sync';

    public function handle(): int
    {
        $consumer = Kafka::consumer(['project-status-events'], 'laravel-projects-consumer', env('KAFKA_BROKERS', 'kafka:29092'))
            ->withAutoCommit()
            ->withHandler(function (ConsumerMessage $message) {
                $body = $message->getBody();
                $status = $body['status'] ?? null;

                if (! in_array($status, ['pending', 'in_progress', 'completed'], true)) {
                    $this->warn('Skipping invalid event: '.json_encode($body));
                    return;
                }

                if (isset($body['external_id'])) {
                    // Events from other systems are matched on their own id, never on ours
                    $project = Project::firstOrNew(['external_id' => (string) $body['external_id']]);
                    $created = ! $project->exists;

                    $project->fill([
                        'name' => $body['name'] ?? $project->name ?? 'Untitled Project',
                        'status' => $status,
                    ])->save();

                    $this->info(($created ? 'Created' : 'Updated')." project #{$project->id} (external {$project->external_id}) -> {$status}");
                } elseif (is_numeric($body['project_id'] ?? null)) {
                    // Events published by this app carry our own id; only existing projects are updated
                    Project::whereKey($body['project_id'])->update(['status' => $status]);
                    $this->info("Project #{$body['project_id']} -> {$status}");
                } else {
                    $this->warn('Skipping event without project_id or external_id: '.json_encode($body));
                }
            })
            ->build();

        $consumer->consume();

        return self::SUCCESS;
    }
}
