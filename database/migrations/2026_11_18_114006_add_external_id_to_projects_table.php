<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // This migration used to be 2026_10_30_202258_add_external_id_to_projects_table.
        // Databases that ran it under that name already have the column.
        if (Schema::hasColumn('projects', 'external_id')) {
            return;
        }

        Schema::table('projects', function (Blueprint $table) {
            $table->string('external_id')->nullable()->unique()->after('id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropUnique(['external_id']);
            $table->dropColumn('external_id');
        });
    }
};
