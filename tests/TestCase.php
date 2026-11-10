<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Refuses to run before RefreshDatabase gets a chance to wipe anything, unless the
     * tests are on the throwaway in-memory SQLite database from phpunit.xml. This
     * protects the real Postgres data if the tests are started with a cached config
     * (e.g. inside the running project-status-api container).
     */
    protected function setUpTraits()
    {
        $connection = config('database.default');
        $database = config("database.connections.{$connection}.database");

        if ($connection !== 'sqlite' || $database !== ':memory:') {
            throw new \RuntimeException(
                "Tests must run on the in-memory SQLite database, but the app is configured for '{$connection}' ({$database}). "
                .'Run them with `make test`, or run `php artisan config:clear` first.'
            );
        }

        return parent::setUpTraits();
    }
}
