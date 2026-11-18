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
            'programme' => fake()->randomElement(['Horizon Europe', 'Horizon 2020', 'Portugal 2030']),
            // Prefixed so simulated projects are easy to spot and clean up
            'external_id' => 'sim-' . fake()->uuid(),
            'deadline' => fake()->dateTimeBetween('+1 week', '+2 months')->format('Y-m-d'),

            'milestones' => collect(range(1, fake()->numberBetween(1, 3)))->map(fn () => [
                'title' => fake()->bs(),
                'deadline' => fake()->dateTimeBetween('now', '+2 months')->format('Y-m-d'),
                'status' => fake()->randomElement(['achieved', 'not_achieved']),
            ])->all(),
        ];
    }
}