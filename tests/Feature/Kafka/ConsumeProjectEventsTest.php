<?php

namespace Tests\Feature\Kafka;

use App\Models\Project;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Junges\Kafka\Facades\Kafka;
use Junges\Kafka\Message\ConsumedMessage;
use Tests\TestCase;

/**
 * kafka:consume-projects keeps the projects table in sync with events from this
 * app and from other systems. The fake consumer feeds it the queued messages once.
 */
class ConsumeProjectEventsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Kafka::fake();
    }

    private function receive(array ...$bodies): void
    {
        Kafka::shouldReceiveMessages(array_map(
            fn (array $body) => new ConsumedMessage(
                topicName: 'project-status-events',
                partition: 0,
                headers: [],
                body: $body,
                key: null,
                offset: 0,
                timestamp: 0,
            ),
            $bodies,
        ));

        $this->artisan('kafka:consume-projects')->assertSuccessful();
    }

    public function test_an_event_from_this_app_updates_the_project_by_id(): void
    {
        $project = Project::factory()->create(['status' => 'pending']);

        $this->receive(['project_id' => $project->id, 'status' => 'in_progress']);

        $this->assertSame('in_progress', $project->fresh()->status);
    }

    public function test_an_event_for_an_unknown_id_does_not_create_a_project(): void
    {
        $this->receive(['project_id' => 999, 'status' => 'completed']);

        $this->assertDatabaseCount('projects', 0);
    }

    public function test_an_external_event_creates_the_project_once_then_updates_it(): void
    {
        $this->receive(
            ['external_id' => 'ext-1', 'name' => 'From another team', 'status' => 'pending'],
            ['external_id' => 'ext-1', 'status' => 'completed'],
        );

        $this->assertDatabaseCount('projects', 1);
        $this->assertDatabaseHas('projects', [
            'external_id' => 'ext-1',
            'name' => 'From another team',
            'status' => 'completed',
        ]);
    }

    public function test_an_external_id_never_matches_one_of_our_ids(): void
    {
        $ours = Project::factory()->create(['status' => 'pending', 'external_id' => null]);

        $this->receive(['external_id' => (string) $ours->id, 'project_id' => $ours->id, 'status' => 'completed']);

        $this->assertSame('pending', $ours->fresh()->status);
        $this->assertDatabaseHas('projects', ['external_id' => (string) $ours->id, 'status' => 'completed']);
    }

    public function test_invalid_events_are_skipped(): void
    {
        $project = Project::factory()->create(['status' => 'pending']);

        $this->receive(
            ['project_id' => $project->id, 'status' => 'archived'],
            ['project_id' => $project->id],
            ['status' => 'completed'],
        );

        $this->assertSame('pending', $project->fresh()->status);
        $this->assertDatabaseCount('projects', 1);
    }
}
