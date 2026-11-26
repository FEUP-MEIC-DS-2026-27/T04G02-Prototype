<?php

namespace Tests\Feature\ProjectSource;

use App\Models\Project;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ImportSourceProjectsTest extends TestCase
{
    use RefreshDatabase;

    private const URL = 'http://projects-service:8080/api/projects';

    protected function setUp(): void
    {
        parent::setUp();

        config(['project_source.api_url' => 'http://projects-service:8080']);
    }

    private function sourceProject(array $overrides = []): array
    {
        return array_merge([
            'id' => 'INE-25-0001',
            'title' => 'Renewable Energy Integration - Porto #01',
            'status' => 'Active',
            'start' => '2025-01-01',
            'end' => '2025-03-09',
            'funding' => 40695.36,
        ], $overrides);
    }

    public function test_it_imports_the_projects_with_their_mapped_and_original_status(): void
    {
        Http::fake([self::URL => Http::response([
            $this->sourceProject(),
            $this->sourceProject(['id' => 'INE-25-0002', 'title' => 'Paused', 'status' => 'On Hold']),
            $this->sourceProject(['id' => 'INE-25-0003', 'title' => 'Planned one', 'status' => 'Planned']),
        ])]);

        $this->artisan('projects:import')->assertSuccessful();

        $this->assertDatabaseCount('projects', 3);
        $this->assertDatabaseHas('projects', [
            'external_id' => 'INE-25-0001',
            'name' => 'Renewable Energy Integration - Porto #01',
            'status' => 'active',
            'source_status' => 'Active',
        ]);
        $this->assertSame('2025-03-09', Project::where('external_id', 'INE-25-0001')->first()->deadline->format('Y-m-d'));
        $this->assertDatabaseHas('projects', ['external_id' => 'INE-25-0002', 'status' => 'on_hold', 'source_status' => 'On Hold']);
        $this->assertDatabaseHas('projects', ['external_id' => 'INE-25-0003', 'status' => 'planned']);
    }

    public function test_each_source_status_gets_its_own_status(): void
    {
        $statuses = ['Planned', 'Active', 'On Hold', 'Completed', 'Cancelled'];

        Http::fake([self::URL => Http::response(array_map(
            fn (string $status, int $i) => $this->sourceProject(['id' => "INE-{$i}", 'status' => $status]),
            $statuses,
            array_keys($statuses),
        ))]);

        $this->artisan('projects:import')->assertSuccessful();

        $this->assertSame(Project::STATUSES, Project::orderBy('external_id')->pluck('status')->all());
    }

    public function test_importing_again_updates_instead_of_duplicating(): void
    {
        Http::fakeSequence(self::URL)
            ->push([$this->sourceProject(['status' => 'Planned'])])
            ->push([$this->sourceProject(['status' => 'Completed', 'title' => 'Renamed'])]);

        $this->artisan('projects:import')->assertSuccessful();
        $this->artisan('projects:import')->assertSuccessful();

        $this->assertDatabaseCount('projects', 1);
        $this->assertDatabaseHas('projects', [
            'external_id' => 'INE-25-0001',
            'name' => 'Renamed',
            'status' => 'completed',
            'source_status' => 'Completed',
        ]);
    }

    public function test_projects_with_an_unknown_status_or_no_id_are_skipped(): void
    {
        Http::fake([self::URL => Http::response([
            $this->sourceProject(['status' => 'Archived']),
            $this->sourceProject(['id' => null]),
            $this->sourceProject(['id' => 'INE-25-0009']),
        ])]);

        $this->artisan('projects:import')->assertSuccessful();

        $this->assertDatabaseCount('projects', 1);
        $this->assertDatabaseHas('projects', ['external_id' => 'INE-25-0009']);
    }

    public function test_without_samples_removes_only_the_sample_projects(): void
    {
        $sample = Project::factory()->create(['external_id' => null]);
        $simulated = Project::factory()->create(['external_id' => 'sim-1']);
        Http::fake([self::URL => Http::response([$this->sourceProject()])]);

        $this->artisan('projects:import', ['--without-samples' => true])->assertSuccessful();

        $this->assertModelMissing($sample);
        $this->assertModelExists($simulated);
        $this->assertDatabaseHas('projects', ['external_id' => 'INE-25-0001']);
    }

    public function test_it_fails_and_keeps_the_samples_when_no_project_can_be_imported(): void
    {
        $sample = Project::factory()->create(['external_id' => null]);
        Http::fake([self::URL => Http::response([
            $this->sourceProject(['status' => 'Archived']),
            $this->sourceProject(['id' => null]),
        ])]);

        $this->artisan('projects:import', ['--without-samples' => true])->assertFailed();

        $this->assertModelExists($sample);
        $this->assertDatabaseCount('projects', 1);
    }

    public function test_an_empty_source_keeps_the_samples(): void
    {
        $sample = Project::factory()->create(['external_id' => null]);
        Http::fake([self::URL => Http::response([])]);

        $this->artisan('projects:import', ['--without-samples' => true])->assertSuccessful();

        $this->assertModelExists($sample);
    }

    public function test_a_failed_request_keeps_the_existing_projects(): void
    {
        $sample = Project::factory()->create(['external_id' => null]);
        Http::fake([self::URL => Http::response('down', 503)]);

        $this->artisan('projects:import', ['--without-samples' => true])->assertFailed();

        $this->assertModelExists($sample);
        $this->assertDatabaseCount('projects', 1);
    }

    public function test_it_fails_when_the_source_is_not_configured(): void
    {
        config(['project_source.api_url' => null]);
        Http::fake();

        $this->artisan('projects:import')->assertFailed();

        Http::assertNothingSent();
    }
}
