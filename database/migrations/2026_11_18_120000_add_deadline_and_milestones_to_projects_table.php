<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `deadline` and `milestones` were added by editing the create_projects_table migration,
 * so databases created before that (older local volumes, h.i's project-status-db) never
 * got them. New databases already have them, so each column is only added when missing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            if (! Schema::hasColumn('projects', 'deadline')) {
                $table->date('deadline')->nullable();
            }
            if (! Schema::hasColumn('projects', 'milestones')) {
                $table->json('milestones')->nullable();
            }
        });
    }

    public function down(): void
    {
        // Nothing to undo: on new databases these columns belong to create_projects_table.
    }
};
