<?php

namespace Database\Factories;

use App\Models\Project;
use Illuminate\Database\Eloquent\Factories\Factory;

class ProjectFactory extends Factory
{
    protected $model = Project::class;

    public function definition(): array
    {
        return [
            'name' => fake()->catchPhrase(),
            'status' => fake()->randomElement(['pending', 'in_progress', 'completed']),
            // Prefixed so simulated projects are easy to spot and clean up
            'external_id' => 'sim-'.fake()->uuid(),
        ];
    }
}
