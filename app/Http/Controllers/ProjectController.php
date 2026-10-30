<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\Request;
use Junges\Kafka\Facades\Kafka;
use Junges\Kafka\Message\Message;

class ProjectController extends Controller
{
    public function index()
    {
        return response()->json([
            'projects' => Project::orderBy('id', 'asc')->get(),
            'stats' => [
                'total'       => Project::count(),
                'pending'     => Project::where('status', 'pending')->count(),
                'in_progress' => Project::where('status', 'in_progress')->count(),
                'completed'   => Project::where('status', 'completed')->count(),
            ]
        ]);
    }

    public function updateStatus(Request $request, $id)
    {
        $validated = $request->validate([
            'status' => 'required|string|in:pending,in_progress,completed'
        ]);

        $project = Project::findOrFail($id);
        $project->update(['status' => $validated['status']]);

        $message = new Message(
            body: [
                'project_id' => (int)$project->id,
                'name'       => $project->name,
                'status'     => $project->status,
                'timestamp'  => now()->toIso8601String(),
            ]
        );

        Kafka::publish(env('KAFKA_BROKERS', 'kafka:29092'))
            ->onTopic('project-status-events')
            ->withMessage($message)
            ->send();

        return response()->json([
            'message' => 'Status updated and event published to Kafka',
            'data'    => $project
        ]);
    }
}