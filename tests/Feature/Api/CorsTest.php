<?php

namespace Tests\Feature\Api;

use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The dashboard runs inside the h.i shell (port 3000) and VA3 (port 3003) and calls
 * this API from the browser, so those origins must keep passing the CORS check.
 */
class CorsTest extends TestCase
{
    public static function allowedOrigins(): array
    {
        return [
            'h.i shell' => ['http://localhost:3000'],
            'VA3 app' => ['http://localhost:3003'],
            'standalone dashboard' => ['http://localhost:3005'],
        ];
    }

    #[DataProvider('allowedOrigins')]
    public function test_preflight_from_a_known_origin_is_allowed(string $origin): void
    {
        $this->call('OPTIONS', '/api/projects/1/status', [], [], [], [
            'HTTP_ORIGIN' => $origin,
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
            'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'content-type',
        ])->assertHeader('Access-Control-Allow-Origin', $origin);
    }

    public function test_an_unknown_origin_is_not_allowed(): void
    {
        $this->call('OPTIONS', '/api/projects', [], [], [], [
            'HTTP_ORIGIN' => 'http://evil.example',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
        ])->assertHeaderMissing('Access-Control-Allow-Origin');
    }
}
