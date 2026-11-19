<?php

namespace Tests\Feature\Api;

use App\Models\Project;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Junges\Kafka\Contracts\ProducerMessage;
use Junges\Kafka\Facades\Kafka;
use Tests\TestCase;

/**
 * POST /api/projects/{id}/milestones replaces the milestones and publishes an event.
 * Kafka is faked, so no broker is needed.
 */
class UpdateProjectMilestonesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Kafka::fake();
    }

    private function milestones(): array
    {
        return [
            ['title' => 'Design', 'deadline' => '2026-12-01', 'status' => 'achieved'],
            ['title' => 'Launch', 'deadline' => null, 'status' => 'not_achieved'],
        ];
    }

    /** Same shape as milestones(), with who is responsible for each one. */
    private function milestonesWithAssignees(): array
    {
        return [
            ['title' => 'Design', 'deadline' => '2026-12-01', 'status' => 'achieved', 'assignee' => 'Ana Ribeiro'],
            ['title' => 'Launch', 'deadline' => null, 'status' => 'not_achieved', 'assignee' => 'Bruno Costa'],
            ['title' => 'Docs', 'deadline' => null, 'status' => 'not_achieved', 'assignee' => null],
        ];
    }

    public function test_it_updates_the_milestones_and_returns_the_project(): void
    {
        $project = Project::factory()->create();

        $this->postJson("/api/projects/{$project->id}/milestones", ['milestones' => $this->milestones()])
            ->assertOk()
            ->assertJsonPath('message', 'Milestones updated successfully')
            ->assertJsonPath('data.id', $project->id)
            ->assertJsonPath('data.milestones.0.title', 'Design')
            ->assertJsonPath('data.milestones.1.status', 'not_achieved');

        $this->assertSame($this->milestones(), $project->fresh()->milestones);
    }

    public function test_it_publishes_the_event_with_the_milestones(): void
    {
        $project = Project::factory()->create(['name' => 'Alpha']);

        $this->postJson("/api/projects/{$project->id}/milestones", ['milestones' => $this->milestones()])
            ->assertOk();

        Kafka::assertPublishedOnTimes('project-status-events', 1);
        Kafka::assertPublishedOn('project-status-events', null, function (ProducerMessage $message) use ($project) {
            $body = $message->getBody();

            return $body['project_id'] === $project->id
                && $body['name'] === 'Alpha'
                && $body['milestones'] === $this->milestones()
                && is_string($body['timestamp']) && $body['timestamp'] !== '';
        });
    }

    public function test_it_accepts_an_empty_array_and_clears_the_milestones(): void
    {
        $project = Project::factory()->create(['milestones' => $this->milestones()]);

        $this->postJson("/api/projects/{$project->id}/milestones", ['milestones' => []])
            ->assertOk();

        $this->assertEmpty($project->fresh()->milestones);
    }

    public function test_it_accepts_a_missing_milestones_field(): void
    {
        $project = Project::factory()->create(['milestones' => $this->milestones()]);

        $this->postJson("/api/projects/{$project->id}/milestones", [])
            ->assertOk();

        $this->assertEmpty($project->fresh()->milestones);
    }

    public function test_it_requires_a_title_and_status_on_each_milestone(): void
    {
        $project = Project::factory()->create();

        $this->postJson("/api/projects/{$project->id}/milestones", [
            'milestones' => [['deadline' => '2026-12-01']],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['milestones.0.title', 'milestones.0.status']);

        Kafka::assertNothingPublished();
    }

    public function test_it_rejects_an_unknown_milestone_status(): void
    {
        $project = Project::factory()->create();

        $this->postJson("/api/projects/{$project->id}/milestones", [
            'milestones' => [['title' => 'Design', 'status' => 'done']],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('milestones.0.status');

        Kafka::assertNothingPublished();
    }

    public function test_it_rejects_a_deadline_in_the_wrong_format(): void
    {
        $project = Project::factory()->create();

        $this->postJson("/api/projects/{$project->id}/milestones", [
            'milestones' => [['title' => 'Design', 'status' => 'achieved', 'deadline' => '01/12/2026']],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('milestones.0.deadline');

        Kafka::assertNothingPublished();
    }

    public function test_it_rejects_a_title_longer_than_255_characters(): void
    {
        $project = Project::factory()->create();

        $this->postJson("/api/projects/{$project->id}/milestones", [
            'milestones' => [['title' => str_repeat('a', 256), 'status' => 'achieved']],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('milestones.0.title');
    }

    public function test_it_stores_and_returns_the_assignee_of_each_milestone(): void
    {
        $project = Project::factory()->create();

        $this->postJson("/api/projects/{$project->id}/milestones", ['milestones' => $this->milestonesWithAssignees()])
            ->assertOk()
            ->assertJsonPath('data.milestones.0.assignee', 'Ana Ribeiro')
            ->assertJsonPath('data.milestones.1.assignee', 'Bruno Costa')
            ->assertJsonPath('data.milestones.2.assignee', null);

        $this->assertEquals($this->milestonesWithAssignees(), $project->fresh()->milestones);
    }

    public function test_it_publishes_the_assignees_in_the_event(): void
    {
        $project = Project::factory()->create(['name' => 'Alpha']);

        $this->postJson("/api/projects/{$project->id}/milestones", ['milestones' => $this->milestonesWithAssignees()])
            ->assertOk();

        Kafka::assertPublishedOnTimes('project-status-events', 1);
        Kafka::assertPublishedOn('project-status-events', null, function (ProducerMessage $message) use ($project) {
            $body = $message->getBody();

            return $body['project_id'] === $project->id
                && $body['milestones'] == $this->milestonesWithAssignees();
        });
    }

    public function test_it_keeps_the_assignees_when_the_same_list_is_sent_again_with_one_milestone_changed(): void
    {
        $project = Project::factory()->create(['milestones' => $this->milestonesWithAssignees()]);

        // What the dashboard does when a milestone is ticked: resend the whole list.
        $ticked = $this->milestonesWithAssignees();
        $ticked[1]['status'] = 'achieved';

        $this->postJson("/api/projects/{$project->id}/milestones", ['milestones' => $ticked])
            ->assertOk();

        $stored = $project->fresh()->milestones;
        $this->assertSame('achieved', $stored[1]['status']);
        $this->assertSame(
            ['Ana Ribeiro', 'Bruno Costa', null],
            array_column($stored, 'assignee'),
        );
    }

    public function test_the_assignee_is_optional(): void
    {
        $project = Project::factory()->create();

        $this->postJson("/api/projects/{$project->id}/milestones", ['milestones' => $this->milestones()])
            ->assertOk()
            ->assertJsonMissingPath('data.milestones.0.assignee');
    }

    public function test_it_rejects_an_assignee_longer_than_255_characters(): void
    {
        $project = Project::factory()->create();

        $this->postJson("/api/projects/{$project->id}/milestones", [
            'milestones' => [['title' => 'Design', 'status' => 'achieved', 'assignee' => str_repeat('a', 256)]],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('milestones.0.assignee');

        Kafka::assertNothingPublished();
    }

    public function test_it_rejects_an_assignee_that_is_not_a_string(): void
    {
        $project = Project::factory()->create();

        $this->postJson("/api/projects/{$project->id}/milestones", [
            'milestones' => [['title' => 'Design', 'status' => 'achieved', 'assignee' => ['Ana']]],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('milestones.0.assignee');

        Kafka::assertNothingPublished();
    }

    public function test_it_returns_404_for_a_missing_project(): void
    {
        $this->postJson('/api/projects/999/milestones', ['milestones' => []])
            ->assertNotFound();

        Kafka::assertNothingPublished();
    }
}