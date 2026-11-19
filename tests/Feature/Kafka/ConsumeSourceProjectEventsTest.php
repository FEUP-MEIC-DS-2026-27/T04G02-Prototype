<?php

namespace Tests\Feature\Kafka;

use App\Models\Project;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Junges\Kafka\Facades\Kafka;
use Junges\Kafka\Message\ConsumedMessage;
use Junges\Kafka\Message\Message;
use Tests\TestCase;

/**
 * kafka:consume-source-projects follows projects-service's `projects` topic and
 * republishes each change on project-status-events for the SSE hub.
 */
class ConsumeSourceProjectEventsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['project_source.kafka_brokers' => 'post-events-kafka:9092']);
        Kafka::fake();
    }

    private function receive(?array ...$bodies): void
    {
        Kafka::shouldReceiveMessages(array_map(
            fn (?array $body) => new ConsumedMessage(
                topicName: 'projects',
                partition: 0,
                headers: [],
                body: $body,
                key: null,
                offset: 0,
                timestamp: 0,
            ),
            $bodies,
        ));

        $this->artisan('kafka:consume-source-projects')->assertSuccessful();
    }

    private function event(string $type, string $id, array $project = []): array
    {
        return [
            'schemaVersion' => 1,
            'type' => $type,
            'projectId' => $id,
            'project' => $type === 'deleted' ? null : array_merge([
                'id' => $id,
                'title' => "Project {$id}",
                'status' => 'Planned',
                'end' => '2026-12-31',
            ], $project),
        ];
    }

    public function test_created_then_updated_events_keep_one_project_in_sync(): void
    {
        $this->receive(
            $this->event('created', 'INE-1'),
            $this->event('updated', 'INE-1', ['status' => 'Cancelled', 'title' => 'Renamed']),
        );

        $this->assertDatabaseCount('projects', 1);
        $this->assertDatabaseHas('projects', [
            'external_id' => 'INE-1',
            'name' => 'Renamed',
            'status' => 'completed',
            'source_status' => 'Cancelled',
        ]);
    }

    public function test_a_deleted_event_removes_the_project(): void
    {
        Project::factory()->create(['external_id' => 'INE-1']);

        $this->receive($this->event('deleted', 'INE-1'));

        $this->assertDatabaseMissing('projects', ['external_id' => 'INE-1']);
    }

    public function test_each_change_is_republished_for_the_dashboard(): void
    {
        $this->receive($this->event('created', 'INE-1', ['status' => 'Active']));

        Kafka::assertPublishedOn('project-status-events', null, function (Message $message) {
            $body = $message->getBody();

            return $body['external_id'] === 'INE-1'
                && $body['status'] === 'in_progress'
                && $body['source_status'] === 'Active'
                && $body['source'] === 'projects-service';
        });
    }

    public function test_tombstones_and_invalid_events_are_ignored(): void
    {
        $existing = Project::factory()->create(['external_id' => 'INE-1', 'status' => 'pending']);

        $this->receive(
            null,
            $this->event('updated', 'INE-1', ['status' => 'Archived']),
            ['type' => 'updated', 'project' => ['status' => 'Active']],
            $this->event('renamed', 'INE-1'),
            $this->event('deleted', 'INE-404'),
        );

        $this->assertSame('pending', $existing->fresh()->status);
        $this->assertDatabaseCount('projects', 1);
        Kafka::assertNothingPublished();
    }

    public function test_it_fails_when_the_source_broker_is_not_configured(): void
    {
        config(['project_source.kafka_brokers' => null]);

        $this->artisan('kafka:consume-source-projects')->assertFailed();
    }

    public function test_the_own_consumer_skips_the_republished_events(): void
    {
        $project = Project::factory()->create(['external_id' => 'INE-1', 'status' => 'pending']);

        Kafka::shouldReceiveMessages([new ConsumedMessage(
            topicName: 'project-status-events',
            partition: 0,
            headers: [],
            body: ['external_id' => 'INE-1', 'status' => 'completed', 'source' => 'projects-service'],
            key: null,
            offset: 0,
            timestamp: 0,
        )]);

        $this->artisan('kafka:consume-projects')->assertSuccessful();

        $this->assertSame('pending', $project->fresh()->status);
    }
}
