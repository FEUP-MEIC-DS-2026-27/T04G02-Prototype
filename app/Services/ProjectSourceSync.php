<?php

namespace App\Services;

use App\Models\Project;
use Junges\Kafka\Facades\Kafka;
use Junges\Kafka\Message\Message;

// Keeps the projects table in sync with projects-service, matching on external_id
class ProjectSourceSync
{
    public function mapStatus(mixed $sourceStatus): ?string
    {
        if (! is_string($sourceStatus)) {
            return null;
        }

        return config('project_source.status_map')[$sourceStatus] ?? null;
    }

    // Returns null (and changes nothing) when there's no id or the status is unknown
    public function upsert(array $source): ?Project
    {
        $externalId = $source['id'] ?? null;
        $status = $this->mapStatus($source['status'] ?? null);

        if (! is_string($externalId) || $externalId === '' || $status === null) {
            return null;
        }

        $project = Project::firstOrNew(['external_id' => $externalId]);

        $project->fill([
            'name' => $this->text($source['title'] ?? null) ?? $project->name ?? 'Untitled Project',
            'status' => $status,
            'source_status' => $source['status'],
            'deadline' => $this->date($source['end'] ?? null) ?? $project->deadline,
        ])->save();

        return $project;
    }

    public function delete(string $externalId): bool
    {
        return Project::where('external_id', $externalId)->delete() > 0;
    }

    // Republish on our topic so the SSE hub refreshes the dashboard
    public function publish(?Project $project, string $externalId, bool $deleted = false): void
    {
        $message = new Message(
            body: array_filter([
                'project_id' => $project && ! $deleted ? (int) $project->id : null,
                'external_id' => $externalId,
                'name' => $project?->name,
                'status' => $deleted ? null : $project?->status,
                'source_status' => $deleted ? null : $project?->source_status,
                'deleted' => $deleted ?: null,
                'source' => 'projects-service',
                'timestamp' => now()->toIso8601String(),
            ], fn ($value) => $value !== null),
        );

        Kafka::publish(config('kafka.brokers'))
            ->withConfigOptions(['compression.codec' => 'none'])
            ->onTopic('project-status-events')
            ->withMessage($message)
            ->send();
    }

    private function text(mixed $value): ?string
    {
        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }

    private function date(mixed $value): ?string
    {
        return is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}/', $value)
            ? substr($value, 0, 10)
            : null;
    }
}
