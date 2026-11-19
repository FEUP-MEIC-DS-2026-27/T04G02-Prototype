<?php

namespace Tests\Feature\Api;

use App\Models\Project;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * GET /api/projects is what the dashboard (and so h.i's VA3 page) reads on load
 * and after every live event. These tests pin the response shape it relies on.
 */
class ListProjectsTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_returns_an_empty_list_and_zeroed_stats_when_there_are_no_projects(): void
    {
        $this->getJson('/api/projects')
            ->assertOk()
            ->assertExactJson([
                'projects' => [],
                'stats' => ['total' => 0, 'planned' => 0, 'active' => 0, 'on_hold' => 0, 'completed' => 0, 'cancelled' => 0],
            ]);
    }

    public function test_it_returns_projects_ordered_by_id_with_the_fields_the_dashboard_uses(): void
    {
        $second = Project::factory()->create(['name' => 'Beta', 'status' => 'completed']);
        $first = Project::factory()->create(['name' => 'Alpha', 'status' => 'planned']);

        $this->getJson('/api/projects')
            ->assertOk()
            ->assertJsonStructure([
                'projects' => [['id', 'name', 'status', 'external_id', 'created_at', 'updated_at']],
                'stats' => ['total', 'planned', 'active', 'on_hold', 'completed', 'cancelled'],
            ])
            ->assertJsonPath('projects.0.id', $second->id)
            ->assertJsonPath('projects.0.name', 'Beta')
            ->assertJsonPath('projects.1.id', $first->id)
            ->assertJsonPath('projects.1.status', 'planned');
    }

    public function test_it_returns_the_milestones_with_who_is_responsible_for_each(): void
    {
        Project::factory()->create([
            'milestones' => [
                ['title' => 'Design', 'deadline' => '2026-12-01', 'status' => 'achieved', 'assignee' => 'Ana Ribeiro'],
                ['title' => 'Launch', 'deadline' => null, 'status' => 'not_achieved', 'assignee' => 'Bruno Costa'],
            ],
        ]);

        $this->getJson('/api/projects')
            ->assertOk()
            ->assertJsonPath('projects.0.milestones.0.title', 'Design')
            ->assertJsonPath('projects.0.milestones.0.assignee', 'Ana Ribeiro')
            ->assertJsonPath('projects.0.milestones.1.assignee', 'Bruno Costa');
    }

    public function test_stats_count_projects_per_status(): void
    {
        Project::factory()->count(3)->create(['status' => 'planned']);
        Project::factory()->count(2)->create(['status' => 'active']);
        Project::factory()->create(['status' => 'completed']);
        Project::factory()->create(['status' => 'cancelled']);

        $this->getJson('/api/projects')
            ->assertOk()
            ->assertJsonCount(7, 'projects')
            ->assertJsonPath('stats', [
                'total' => 7, 'planned' => 3, 'active' => 2, 'on_hold' => 0, 'completed' => 1, 'cancelled' => 1,
            ]);
    }
}
