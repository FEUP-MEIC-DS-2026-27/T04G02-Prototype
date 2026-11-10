<?php

namespace Tests\Feature\Api;

use App\Models\Project;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Junges\Kafka\Contracts\ProducerMessage;
use Junges\Kafka\Facades\Kafka;
use Tests\TestCase;

/**
 * POST /api/projects/{id}/status updates the database and publishes an event that
 * the SSE hub forwards to the dashboard. Kafka is faked, so no broker is needed.
 */
class UpdateProjectStatusTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Kafka::fake();
    }

    public function test_it_updates_the_status_and_returns_the_project(): void
    {
        $project = Project::factory()->create(['name' => 'Alpha', 'status' => 'pending']);

        $this->postJson("/api/projects/{$project->id}/status", ['status' => 'in_progress'])
            ->assertOk()
            ->assertJsonPath('message', 'Status updated and event published to Kafka')
            ->assertJsonPath('data.id', $project->id)
            ->assertJsonPath('data.status', 'in_progress');

        $this->assertDatabaseHas('projects', ['id' => $project->id, 'status' => 'in_progress']);
    }

    public function test_it_publishes_the_event_the_sse_hub_and_dashboard_expect(): void
    {
        $project = Project::factory()->create(['name' => 'Alpha', 'status' => 'pending']);

        $this->postJson("/api/projects/{$project->id}/status", ['status' => 'completed'])->assertOk();

        Kafka::assertPublishedOnTimes('project-status-events', 1);
        Kafka::assertPublishedOn('project-status-events', null, function (ProducerMessage $message) use ($project) {
            $body = $message->getBody();

            return $body['project_id'] === $project->id
                && $body['name'] === 'Alpha'
                && $body['status'] === 'completed'
                && is_string($body['timestamp']) && $body['timestamp'] !== '';
        });
    }

    public function test_the_update_is_visible_in_the_project_list(): void
    {
        $project = Project::factory()->create(['status' => 'pending']);

        $this->postJson("/api/projects/{$project->id}/status", ['status' => 'completed'])->assertOk();

        $this->getJson('/api/projects')
            ->assertJsonPath('projects.0.status', 'completed')
            ->assertJsonPath('stats.completed', 1)
            ->assertJsonPath('stats.pending', 0);
    }

    public function test_it_rejects_an_unknown_status_without_changing_anything(): void
    {
        $project = Project::factory()->create(['status' => 'pending']);

        $this->postJson("/api/projects/{$project->id}/status", ['status' => 'done'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');

        $this->assertDatabaseHas('projects', ['id' => $project->id, 'status' => 'pending']);
        Kafka::assertNothingPublished();
    }

    public function test_it_requires_a_status(): void
    {
        $project = Project::factory()->create();

        $this->postJson("/api/projects/{$project->id}/status", [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');

        Kafka::assertNothingPublished();
    }

    public function test_it_returns_404_for_a_missing_project(): void
    {
        $this->postJson('/api/projects/999/status', ['status' => 'completed'])
            ->assertNotFound();

        Kafka::assertNothingPublished();
    }
}
