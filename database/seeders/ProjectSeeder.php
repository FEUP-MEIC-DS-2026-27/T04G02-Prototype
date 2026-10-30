<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Project;

class ProjectSeeder extends Seeder
{
    public function run(): void
    {
        Project::truncate(); // Reset table

        $projects = [
            ['name' => 'E-Commerce Platform Redesign', 'status' => 'completed'],
            ['name' => 'Kafka Microservices Migration', 'status' => 'in_progress'],
            ['name' => 'Auth Service Refactor', 'status' => 'completed'],
            ['name' => 'Mobile App API Integration', 'status' => 'in_progress'],
            ['name' => 'Analytics Dashboard V2', 'status' => 'pending'],
            ['name' => 'Database Index Optimization', 'status' => 'pending'],
            ['name' => 'Payment Gateway Webhooks', 'status' => 'in_progress'],
            ['name' => 'User Onboarding Flow', 'status' => 'completed'],
        ];

        foreach ($projects as $project) {
            Project::create($project);
        }
    }
}