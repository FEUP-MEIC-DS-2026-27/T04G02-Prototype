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
                'stats' => ['total' => 0, 'pending' => 0, 'in_progress' => 0, 'completed' => 0],
            ]);
    }

    public function test_it_returns_projects_ordered_by_id_with_the_fields_the_dashboard_uses(): void
    {
        $second = Project::factory()->create(['name' => 'Beta', 'status' => 'completed']);
        $first = Project::factory()->create(['name' => 'Alpha', 'status' => 'pending']);

        $this->getJson('/api/projects')
            ->assertOk()
            ->assertJsonStructure([
                'projects' => [['id', 'name', 'status', 'external_id', 'created_at', 'updated_at']],
                'stats' => ['total', 'pending', 'in_progress', 'completed'],
            ])
            ->assertJsonPath('projects.0.id', $second->id)
            ->assertJsonPath('projects.0.name', 'Beta')
            ->assertJsonPath('projects.1.id', $first->id)
            ->assertJsonPath('projects.1.status', 'pending');
    }

    public function test_stats_count_projects_per_status(): void
    {
        Project::factory()->count(3)->create(['status' => 'pending']);
        Project::factory()->count(2)->create(['status' => 'in_progress']);
        Project::factory()->create(['status' => 'completed']);

        $this->getJson('/api/projects')
            ->assertOk()
            ->assertJsonCount(6, 'projects')
            ->assertJsonPath('stats', ['total' => 6, 'pending' => 3, 'in_progress' => 2, 'completed' => 1]);
    }
}
