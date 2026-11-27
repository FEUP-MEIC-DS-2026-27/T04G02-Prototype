<?php

namespace App\Console\Commands;

use App\Models\Project;
use App\Services\ProjectSourceSync;
use Illuminate\Console\Command;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

class ImportSourceProjects extends Command
{
    protected $signature = 'projects:import
        {--without-samples : Delete the sample projects (no external_id) once at least one project is imported}';

    protected $description = "Import every project from h.i's projects-service into the projects table";

    public function handle(ProjectSourceSync $sync): int
    {
        $baseUrl = config('project_source.api_url');

        if (! is_string($baseUrl) || $baseUrl === '') {
            $this->error('PROJECTS_SOURCE_API_URL is not set, nothing to import.');

            return self::FAILURE;
        }

        $url = rtrim($baseUrl, '/').'/'.ltrim(config('project_source.api_path'), '/');

        try {
            $response = Http::acceptJson()
                ->timeout(config('project_source.timeout'))
                ->retry(3, 2000, throw: false)
                ->get($url);
        } catch (ConnectionException $e) {
            $this->error("Could not reach {$url}: {$e->getMessage()}");

            return self::FAILURE;
        }

        $projects = $response->json();

        if (! $response->successful() || ! is_array($projects) || ! array_is_list($projects)) {
            $this->error("Unexpected response from {$url} (HTTP {$response->status()}).");

            return self::FAILURE;
        }

        $imported = 0;

        foreach ($projects as $source) {
            if (is_array($source) && $sync->upsert($source)) {
                $imported++;
            } else {
                $this->warn('Skipping project: '.json_encode($source));
            }
        }

        // Every project was skipped: fail, so the samples stay and the error shows up
        if ($imported === 0 && count($projects) > 0) {
            $this->error('None of the '.count($projects)." projects from {$url} could be imported.");

            return self::FAILURE;
        }

        // Projects deleted in projects-service while the consumer wasn't running.
        // Only rows imported from it (source_status set), not other systems' projects.
        // A project that is still listed but was skipped (e.g. unknown status) is kept.
        if ($imported > 0) {
            $sourceIds = array_values(array_filter(
                array_map(fn ($source) => is_array($source) ? ($source['id'] ?? null) : null, $projects),
                fn ($id) => is_string($id) && $id !== '',
            ));
            $deleted = Project::whereNotNull('source_status')->whereNotIn('external_id', $sourceIds)->delete();

            if ($deleted > 0) {
                $this->info("Removed {$deleted} projects that are no longer in projects-service.");
            }
        }

        // Only replace the samples with real projects, never with an empty table
        if ($this->option('without-samples') && $imported > 0) {
            $removed = Project::whereNull('external_id')->delete();
            $this->info("Removed {$removed} sample projects.");
        }

        $this->info("Imported {$imported} of ".count($projects)." projects from {$url}.");

        return self::SUCCESS;
    }
}
