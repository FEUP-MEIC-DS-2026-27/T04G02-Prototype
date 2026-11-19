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
                'programme' => 'Horizon Europe',
                'deadline' => '2026-10-15',
                'milestones' => [
                    ['title' => 'UI/UX Wireframes', 'deadline' => '2026-09-15', 'status' => 'achieved', 'assignee' => 'Ana Ribeiro'],
                    ['title' => 'Checkout Flow Implementation', 'deadline' => '2026-10-10', 'status' => 'achieved', 'assignee' => 'Bruno Costa'],
                ],
            ],
            [
                'name' => 'Kafka Microservices Migration',
                'status' => 'in_progress',
                'programme' => 'Portugal 2030',
                'deadline' => '2026-12-10',
                'milestones' => [
                    ['title' => 'Cluster Setup & Brokers', 'deadline' => '2026-11-01', 'status' => 'achieved', 'assignee' => 'Carla Mendes'],
                    // Past date (before Nov 17, 2026) + not_achieved = great for testing "overdue" UI badges
                    ['title' => 'Consumer Services Cutover', 'deadline' => '2026-11-14', 'status' => 'not_achieved', 'assignee' => 'Rui Almeida'],
                ],
            ],
            [
                'name' => 'Auth Service Refactor',
                'status' => 'completed',
                'programme' => 'Horizon 2020',
                'deadline' => '2026-10-25',
                'milestones' => [
                    ['title' => 'OAuth2 Token Migration', 'deadline' => '2026-10-01', 'status' => 'achieved', 'assignee' => 'Bruno Costa'],
                    ['title' => 'Security Audit', 'deadline' => '2026-10-20', 'status' => 'achieved', 'assignee' => 'Carla Mendes'],
                ],
            ],
            [
                'name' => 'Mobile App API Integration',
                'status' => 'in_progress',
                'programme' => 'Horizon Europe',
                'deadline' => '2026-12-15',
                'milestones' => [
                    ['title' => 'Push Notifications Endpoint', 'deadline' => '2026-11-10', 'status' => 'achieved', 'assignee' => 'Ana Ribeiro'],
                    ['title' => 'Offline Sync Support', 'deadline' => '2026-12-12', 'status' => 'not_achieved', 'assignee' => 'Rui Almeida'],
                ],
            ],
            [
                'name' => 'Analytics Dashboard V2',
                'status' => 'pending',
                'programme' => 'Portugal 2030',
                'deadline' => '2026-12-22',
                'milestones' => [
                    ['title' => 'Data Aggregation Queries', 'deadline' => '2026-12-01', 'status' => 'not_achieved', 'assignee' => 'Carla Mendes'],
                    ['title' => 'Chart Components Integration', 'deadline' => '2026-12-20', 'status' => 'not_achieved', 'assignee' => 'Ana Ribeiro'],
                ],
            ],
            [
                'name' => 'Database Index Optimization',
                'status' => 'pending',
                'programme' => 'Horizon 2020',
                'deadline' => '2026-11-30',
                'milestones' => [
                    ['title' => 'Slow Query Profiling', 'deadline' => '2026-11-28', 'status' => 'not_achieved', 'assignee' => 'Rui Almeida'],
                ],
            ],
            [
                'name' => 'Payment Gateway Webhooks',
                'status' => 'in_progress',
                'programme' => 'Horizon Europe',
                'deadline' => '2026-12-05',
                'milestones' => [
                    ['title' => 'Stripe Signature Verification', 'deadline' => '2026-11-12', 'status' => 'achieved', 'assignee' => 'Bruno Costa'],
                    ['title' => 'Idempotency & Retry Queue', 'deadline' => '2026-12-03', 'status' => 'not_achieved', 'assignee' => 'Carla Mendes'],
                ],
            ],
            [
                'name' => 'User Onboarding Flow',
                'status' => 'completed',
                'programme' => 'Portugal 2030',
                'deadline' => '2026-10-02',
                'milestones' => [
                    ['title' => 'Interactive Tutorial Steps', 'deadline' => '2026-09-30', 'status' => 'achieved', 'assignee' => 'Ana Ribeiro'],
                ],
            ],
        ];

        foreach ($projects as $project) {
            Project::create($project);
        }
    }
}
