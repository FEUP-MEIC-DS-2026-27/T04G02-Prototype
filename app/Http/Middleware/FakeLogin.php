<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class FakeLogin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (app()->environment('local')) {
            $user = User::where('email', 'owner@example.com')->first();

            if ($user === null) {
                return response()->json(['message' => 'The fake login user has not been seeded.'], 500);
            }
            Auth::setUser($user);
        }
        return $next($request);
    }
}
