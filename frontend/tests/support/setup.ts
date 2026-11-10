import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { FakeEventSource } from './fakeEventSource';

// jsdom has no EventSource; the dashboard opens one on mount.
globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;

afterEach(() => {
  cleanup();
  FakeEventSource.reset();
});
