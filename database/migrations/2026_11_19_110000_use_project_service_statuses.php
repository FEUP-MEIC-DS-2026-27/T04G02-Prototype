<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Switch to the 5 statuses used by projects-service
return new class extends Migration
{
    private const OLD = ['pending', 'in_progress', 'completed'];

    private const NEW = ['planned', 'active', 'on_hold', 'completed', 'cancelled'];

    public function up(): void
    {
        $this->dropStatusRule();

        // Nothing is imported yet (source_status was just added), so only the old names change
        DB::table('projects')->where('status', 'pending')->update(['status' => 'planned']);
        DB::table('projects')->where('status', 'in_progress')->update(['status' => 'active']);

        $this->addStatusRule(self::NEW, 'planned');
    }

    public function down(): void
    {
        $this->dropStatusRule();

        DB::table('projects')->where('status', 'planned')->update(['status' => 'pending']);
        DB::table('projects')->whereIn('status', ['active', 'on_hold'])->update(['status' => 'in_progress']);
        DB::table('projects')->where('status', 'cancelled')->update(['status' => 'completed']);

        $this->addStatusRule(self::OLD, 'pending');
    }

    // Postgres has a named check constraint; on SQLite (tests) ->change() rebuilds the table
    private function dropStatusRule(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check');
        } else {
            Schema::table('projects', fn (Blueprint $table) => $table->string('status')->change());
        }
    }

    private function addStatusRule(array $statuses, string $default): void
    {
        if (DB::getDriverName() === 'pgsql') {
            $list = implode(', ', array_map(fn (string $s) => "'{$s}'", $statuses));
            DB::statement("ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN ({$list}))");
            DB::statement("ALTER TABLE projects ALTER COLUMN status SET DEFAULT '{$default}'");
        } else {
            Schema::table('projects', fn (Blueprint $table) => $table->enum('status', $statuses)->default($default)->change());
        }
    }
};
