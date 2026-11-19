<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Project extends Model
{
    use HasFactory;

    // Same as h.i's projects-service
    public const STATUSES = ['planned', 'active', 'on_hold', 'completed', 'cancelled'];

    protected $fillable = [
        'name',
        'status',
        'programme',
        'external_id',
        'milestones',
        'deadline',
        'source_status',


    ];

    protected function casts(): array{
        return [
            'milestones' => 'array',
            'deadline' =>'date:Y-m-d'

        ];
}}
