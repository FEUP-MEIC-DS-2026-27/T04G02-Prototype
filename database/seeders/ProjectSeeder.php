<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Project;

class ProjectSeeder extends Seeder
{
    public function run(): void
    {
        Project::truncate();

        $projects = [
            [
                'name' => 'E-Commerce Platform Redesign',
                'status' => 'completed',
                'deadline' => '2026-10-15',
                'milestones' => [
                    ['title' => 'UI/UX Wireframes', 'deadline' => '2026-09-15', 'status' => 'achieved'],
                    ['title' => 'Checkout Flow Implementation', 'deadline' => '2026-10-10', 'status' => 'achieved'],
                ],
            ],
            [
                'name' => 'Kafka Microservices Migration',
                'status' => 'in_progress',
                'deadline' => '2026-12-10',
                'milestones' => [
                    ['title' => 'Cluster Setup & Brokers', 'deadline' => '2026-11-01', 'status' => 'achieved'],
                    // Past date (before Nov 17, 2026) + not_achieved = great for testing "overdue" UI badges
                    ['title' => 'Consumer Services Cutover', 'deadline' => '2026-11-14', 'status' => 'not_achieved'],
                ],
            ],
            [
                'name' => 'Auth Service Refactor',
                'status' => 'completed',
                'deadline' => '2026-10-25',
                'milestones' => [
                    ['title' => 'OAuth2 Token Migration', 'deadline' => '2026-10-01', 'status' => 'achieved'],
                    ['title' => 'Security Audit', 'deadline' => '2026-10-20', 'status' => 'achieved'],
                ],
            ],
            [
                'name' => 'Mobile App API Integration',
                'status' => 'in_progress',
                'deadline' => '2026-12-15',
                'milestones' => [
                    ['title' => 'Push Notifications Endpoint', 'deadline' => '2026-11-10', 'status' => 'achieved'],
                    ['title' => 'Offline Sync Support', 'deadline' => '2026-12-12', 'status' => 'not_achieved'],
                ],
            ],
            [
                'name' => 'Analytics Dashboard V2',
                'status' => 'pending',
                'deadline' => '2026-12-22',
                'milestones' => [
                    ['title' => 'Data Aggregation Queries', 'deadline' => '2026-12-01', 'status' => 'not_achieved'],
                    ['title' => 'Chart Components Integration', 'deadline' => '2026-12-20', 'status' => 'not_achieved'],
                ],
            ],
            [
                'name' => 'Database Index Optimization',
                'status' => 'pending',
                'deadline' => '2026-11-30',
                'milestones' => [
                    ['title' => 'Slow Query Profiling', 'deadline' => '2026-11-28', 'status' => 'not_achieved'],
                ],
            ],
            [
                'name' => 'Payment Gateway Webhooks',
                'status' => 'in_progress',
                'deadline' => '2026-12-05',
                'milestones' => [
                    ['title' => 'Stripe Signature Verification', 'deadline' => '2026-11-12', 'status' => 'achieved'],
                    ['title' => 'Idempotency & Retry Queue', 'deadline' => '2026-12-03', 'status' => 'not_achieved'],
                ],
            ],
            [
                'name' => 'User Onboarding Flow',
                'status' => 'completed',
                'deadline' => '2026-10-02',
                'milestones' => [
                    ['title' => 'Interactive Tutorial Steps', 'deadline' => '2026-09-30', 'status' => 'achieved'],
                ],
            ],
        ];

        foreach ($projects as $project) {
            Project::create($project);
        }
    }
}