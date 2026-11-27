<?php

namespace Tests\Feature\Api;

use App\Models\Project;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Junges\Kafka\Contracts\ProducerMessage;
use Junges\Kafka\Facades\Kafka;
use Tests\TestCase;

/**
 * POST /api/projects/{id}/deadline updates the deadline and publishes an event.
 * Kafka is faked, so no broker is needed.
 */
class UpdateProjectDeadlineTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Kafka::fake();
    }

    public function test_it_updates_the_deadline_and_returns_the_project(): void
    {
        $project = Project::factory()->create(['deadline' => null]);

        $this->postJson("/api/projects/{$project->id}/deadline", ['deadline' => '2026-12-31'])
            ->assertOk()
            ->assertJsonPath('message', 'Deadline updated successfully')
            ->assertJsonPath('data.id', $project->id);

        $this->assertSame('2026-12-31', $project->fresh()->deadline->toDateString());
    }

    public function test_it_publishes_an_event_for_the_deadline_change(): void
    {
        $project = Project::factory()->create(['name' => 'Alpha']);

        $this->postJson("/api/projects/{$project->id}/deadline", ['deadline' => '2026-12-31'])
            ->assertOk();

        Kafka::assertPublishedOnTimes('project-status-events', 1);
        Kafka::assertPublishedOn('project-status-events', null, function (ProducerMessage $message) use ($project) {
            $body = $message->getBody();

            return $body['project_id'] === $project->id
                && $body['name'] === 'Alpha'
                && str_starts_with((string) $body['deadline'], '2026-12-31')
                && is_string($body['timestamp']) && $body['timestamp'] !== '';
        });
    }

    public function test_it_can_clear_the_deadline_with_null(): void
    {
        $project = Project::factory()->create(['deadline' => '2026-12-31']);

        $this->postJson("/api/projects/{$project->id}/deadline", ['deadline' => null])
            ->assertOk();

        $this->assertNull($project->fresh()->deadline);
    }

    public function test_it_rejects_a_deadline_in_the_wrong_format(): void
    {
        $project = Project::factory()->create(['deadline' => '2026-01-01']);

        $this->postJson("/api/projects/{$project->id}/deadline", ['deadline' => '31/12/2026'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('deadline');

        $this->assertSame('2026-01-01', $project->fresh()->deadline->toDateString());
        Kafka::assertNothingPublished();
    }

    public function test_it_rejects_a_non_date_value(): void
    {
        $project = Project::factory()->create();

        $this->postJson("/api/projects/{$project->id}/deadline", ['deadline' => 'tomorrow'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('deadline');

        Kafka::assertNothingPublished();
    }

    public function test_it_returns_404_for_a_missing_project(): void
    {
        $this->postJson('/api/projects/999/deadline', ['deadline' => '2026-12-31'])
            ->assertNotFound();

        Kafka::assertNothingPublished();
    }

    public function test_it_rejects_changing_the_deadline_of_a_project_from_projects_service(): void
    {
        $project = Project::factory()->create(['external_id' => 'INE-25-0001', 'status' => 'active', 'source_status' => 'Active', 'deadline' => null]);

        $this->postJson("/api/projects/{$project->id}/deadline", ['deadline' => '2026-12-31'])
            ->assertStatus(409)
            ->assertJsonPath('message', 'This project comes from projects-service, so its status and deadline can only be changed there.');

        $this->assertDatabaseHas('projects', ['id' => $project->id, 'deadline' => null]);
        Kafka::assertNothingPublished();
    }
}
