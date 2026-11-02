<?php

namespace Database\Seeders;

use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $users = collect([
            User::factory()->create([
                'name' => 'Test User',
                'email' => 'test@example.com',
            ]),
            User::factory()->create([
                'name' => 'Product Owner',
                'email' => 'owner@example.com',
            ]),
        ]);

        $this->call([
            ProjectSeeder::class,
        ]);

        $this->assignOwners($users);
    }

    /**
     * Give each project an owner, rotating through the users.
     */
    private function assignOwners(Collection $users): void
    {
        foreach (Project::query()->orderBy('id')->get() as $index => $project) {
            $project->update(['owner_id' => $users[$index % $users->count()]->id]);
        }
    }
}
