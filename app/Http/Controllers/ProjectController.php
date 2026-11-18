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
            ],
            
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

        Kafka::publish(config('kafka.brokers'))
            ->onTopic('project-status-events')
            ->withMessage($message)
            ->send();

        return response()->json([
            'message' => 'Status updated and event published to Kafka',
            'data'    => $project
        ]);
    }

    public function updateMilestones(Request $request, $id)
    {
        $validated = $request->validate([
    'milestones'            => 'nullable|array', // Allows [], null, or omitted
    'milestones.*.title'    => 'required|string|max:255',
    'milestones.*.deadline' => 'nullable|date_format:Y-m-d', // Allows null or 'YYYY-MM-DD'
    'milestones.*.status'   => 'required|string|in:achieved,not_achieved',
]);

        $project = Project::findOrFail($id);
        $project->update(['milestones' => $validated['milestones']]);

        // Opcional: publica evento no Kafka tal como no updateStatus
        $message = new Message(
            body: [
                'project_id' => (int) $project->id,
                'name'       => $project->name,
                'milestones' => $project->milestones,
                'timestamp'  => now()->toIso8601String(),
            ]
        );

        Kafka::publish(config('kafka.brokers'))
            ->onTopic('project-status-events')
            ->withMessage($message)
            ->send();

        return response()->json([
            'message' => 'Milestones updated successfully',
            'data'    => $project,
        ]);
    }
    public function updateDeadline(Request $request, $id)
    {
        $validated = $request->validate([
            'deadline' => 'nullable|date_format:Y-m-d',
        ]);

        $project = Project::findOrFail($id);
        $project->update(['deadline' => $validated['deadline']]);
        Kafka::publish(config('kafka.brokers'))
            ->onTopic('project-status-events')
            ->withMessage($message)
            ->send();
        return response()->json([
            'message' => 'Deadline updated successfully',
            'data'    => $project,
        ]);
    }
}