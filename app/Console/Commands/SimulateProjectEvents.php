<?php

namespace App\Console\Commands;

use App\Models\Project;
use Illuminate\Console\Command;
use Junges\Kafka\Facades\Kafka;
use Junges\Kafka\Message\Message;

class SimulateProjectEvents extends Command
{
    protected $signature = 'kafka:simulate-projects
                            {count=10 : Number of new projects to publish}
                            {--delay=500 : Milliseconds to wait between events}
                            {--updates : Also send a status change for each new project}';

    protected $description = 'Publish fake project events to Kafka, as if they came from another system';

    private const STATUSES = ['pending', 'in_progress', 'completed'];

    public function handle(): int
    {
        $count = (int) $this->argument('count');

        if ($count < 1) {
            $this->error('count must be at least 1');

            return self::INVALID;
        }

        // Will just make and not save, creating them is the consumer's job
        $projects = Project::factory()->count($count)->make();

        foreach ($projects as $project) {
            $this->publish($project->external_id, $project->name, $project->status);

            if ($this->option('updates')) {
                $newStatus = fake()->randomElement(array_values(array_diff(self::STATUSES, [$project->status])));
                $this->publish($project->external_id, $project->name, $newStatus);
            }
        }

        $this->info("Published events for {$count} simulated project(s).");

        return self::SUCCESS;
    }

    private function publish(string $externalId, string $name, string $status): void
    {
        Kafka::publish(env('KAFKA_BROKERS', 'kafka:29092'))
            ->onTopic('project-status-events')
            ->withMessage(new Message(body: [
                'external_id' => $externalId,
                'name' => $name,
                'status' => $status,
                'timestamp' => now()->toIso8601String(),
            ]))
            ->send();

        $this->line("→ {$externalId} ({$name}) {$status}");

        usleep((int) $this->option('delay') * 1000);
    }
}
