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
        {--without-samples : Delete the sample projects (no external_id) after a successful import}';

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

        if ($this->option('without-samples')) {
            $removed = Project::whereNull('external_id')->delete();
            $this->info("Removed {$removed} sample projects.");
        }

        $this->info("Imported {$imported} of ".count($projects)." projects from {$url}.");

        return self::SUCCESS;
    }
}
