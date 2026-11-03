<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ProjectController;
use App\Http\Middleware\FakeLogin;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::middleware(FakeLogin::class)->group(function () {
    Route::get('/projects', [ProjectController::class, 'index']);
    Route::post('/projects/{id}/status', [ProjectController::class, 'updateStatus']);
});