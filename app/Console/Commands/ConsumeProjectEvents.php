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

                // The DB is the source of truth; this only re-applies the event idempotently
                Project::whereKey($body['project_id'] ?? null)->update(['status' => $body['status'] ?? 'pending']);

                $this->info("Project #{$body['project_id']} -> {$body['status']}");
            })
            ->build();

        $consumer->consume();

        return self::SUCCESS;
    }
}
