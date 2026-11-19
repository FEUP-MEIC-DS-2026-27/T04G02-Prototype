<?php

namespace App\Services;

use App\Models\Project;
use Junges\Kafka\Facades\Kafka;
use Junges\Kafka\Message\Message;

/**
 * Applies projects from h.i's projects-service to this app's `projects` table.
 *
 * A source project is matched on `external_id` (its id, e.g. `INE-25-0001`), so it
 * never collides with the ids of the sample projects.
 */
class ProjectSourceSync
{
    /**
     * This app's status for a projects-service status, or null when it has no mapping.
     */
    public function mapStatus(mixed $sourceStatus): ?string
    {
        if (! is_string($sourceStatus)) {
            return null;
        }

        return config('project_source.status_map')[$sourceStatus] ?? null;
    }

    /**
     * Creates or updates the project. Returns null when the payload can't be used
     * (no id, or a status without a mapping), leaving the table untouched.
     */
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

    /**
     * Deletes the project with this source id. Returns whether one existed.
     */
    public function delete(string $externalId): bool
    {
        return Project::where('external_id', $externalId)->delete() > 0;
    }

    /**
     * Publishes the change on this app's own topic, so the SSE hub pushes it to the
     * dashboard. Same shape as the events published by ProjectController.
     */
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
