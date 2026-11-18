<?php

namespace Tests\Feature\Api;

use App\Models\Project;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProjectProgrammeTest extends TestCase
{
    use RefreshDatabase;

    public function test_inventory_exposes_programmes_and_preserves_unassigned_projects(): void
    {
        $assigned = Project::create([
            'name' => 'Research project', 'status' => 'pending', 'programme' => 'Horizon Europe',
        ]);
        $unassigned = Project::create(['name' => 'Legacy project', 'status' => 'completed']);

        $this->getJson('/api/projects')->assertOk()
            ->assertJsonPath('projects.0.id', $assigned->id)
            ->assertJsonPath('projects.0.programme', 'Horizon Europe')
            ->assertJsonPath('projects.1.id', $unassigned->id)
            ->assertJsonPath('projects.1.programme', null)
            ->assertJsonPath('stats.total', 2);

        $assigned->update(['status' => 'completed']);

        $this->getJson('/api/projects')->assertOk()
            ->assertJsonPath('projects.0.programme', 'Horizon Europe')
            ->assertJsonPath('projects.0.status', 'completed');
    }
}
