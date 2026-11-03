<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Junges\Kafka\Facades\Kafka;
use Junges\Kafka\Message\Message;

class ProjectController extends Controller
{
    public function index()
    {
        $user = request()->user();
        $projects = Project::with('owner:id,name')->orderBy('id', 'asc')->get();

        return response()->json([
            'projects' => $projects->map(function (Project $project) use ($user) {
                $project->can_update = $user !== null && $project->owner_id === $user->id;
                return $project;
            }),
            'stats' => $this->getStats($projects),
            'my_stats' => $user ? $this->getStats($projects->where('owner_id', $user->id)) : $this->emptyStats(),
            // 'current_user' => $user ? ['id' => $user->id, 'name' => $user->name] : null,
        ]);
    }

    private function getStats(Collection $projects): array
    {
        return [
            'total'       => $projects->count(),
            'pending'     => $projects->where('status', 'pending')->count(),
            'in_progress' => $projects->where('status', 'in_progress')->count(),
            'completed'   => $projects->where('status', 'completed')->count(),
        ];
    }

    private function emptyStats(): array
    {
        return ['total' => 0, 'pending' => 0, 'in_progress' => 0, 'completed' => 0];
    }

    public function updateStatus(Request $request, $id)
    {
        $validated = $request->validate([
            'status' => 'required|string|in:pending,in_progress,completed'
        ]);

        $project = Project::findOrFail($id);
        abort_unless($request->user() && $project->owner_id === $request->user()->id, 403);
        $project->update(['status' => $validated['status']]);

        $message = new Message(
            body: [
                'project_id'  => (int)$project->id,
                'external_id' => $project->external_id,
                'name'        => $project->name,
                'status'      => $project->status,
                'timestamp'   => now()->toIso8601String(),
            ]
        );

        Kafka::publish(env('KAFKA_BROKERS', 'kafka:29092'))
            ->onTopic('project-status-events')
            ->withMessage($message)
            ->send();

        return response()->json([
            'message' => 'Status updated and event published to Kafka',
            'data' => $project,
        ]);
    }
}
