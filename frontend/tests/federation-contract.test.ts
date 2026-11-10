// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import federation from '../module-federation.config';
import pkg from '../package.json';
import ProjectStatusTracker, { contractVersion } from '../src/ProjectStatusTracker';

/**
 * h.i's VA3 loads this app as the Module Federation remote `project_status` and
 * imports `./Dashboard`. If one of these assertions fails, h.i will break too:
 * change h.i (packages/config/src/federation.ts) in step, or don't make the change.
 */
describe('h.i federation contract', () => {
  it('exposes the dashboard under the name h.i imports', () => {
    expect(federation.name).toBe('project_status');
    expect(federation.filename).toBe('remoteEntry.js');
    expect(federation.manifest).toBe(true);
    expect(federation.exposes).toEqual({ './Dashboard': './src/ProjectStatusTracker.tsx' });
  });

  it('exports a component and the contract version h.i expects', () => {
    expect(typeof ProjectStatusTracker).toBe('function');
    expect(contractVersion).toBe(1);
  });

  it('shares React and the router as strict singletons', () => {
    const shared = federation.shared as Record<string, { singleton: boolean; strictVersion: boolean; requiredVersion: string }>;

    expect(Object.keys(shared).sort()).toEqual(['react', 'react-dom', 'react-router-dom']);
    for (const lib of Object.values(shared)) {
      expect(lib.singleton).toBe(true);
      expect(lib.strictVersion).toBe(true);
    }
    expect(shared.react.requiredVersion).toBe('18.3.1');
    expect(shared['react-dom'].requiredVersion).toBe('18.3.1');
    expect(shared['react-router-dom'].requiredVersion).toBe('7.9.6');
  });

  it('installs exactly the versions it tells h.i it shares', () => {
    const shared = federation.shared as Record<string, { requiredVersion: string }>;
    const deps = pkg.dependencies as Record<string, string>;

    for (const [name, { requiredVersion }] of Object.entries(shared)) {
      expect(deps[name], name).toBe(requiredVersion);
    }
  });

  // Checks the real build output. CI builds before testing; locally run `npm run build` first.
  const manifestPath = fileURLToPath(new URL('../dist/mf-manifest.json', import.meta.url));
  it.runIf(existsSync(manifestPath))('builds a manifest h.i can load', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

    expect(manifest.name).toBe('project_status');
    expect(manifest.metaData.remoteEntry.name).toBe('remoteEntry.js');
    expect(manifest.metaData.publicPath).toBe('auto');
    expect(manifest.exposes.map((e: { path: string }) => e.path)).toEqual(['./Dashboard']);
    for (const lib of manifest.shared.filter((s: { name: string }) => s.name.startsWith('react'))) {
      expect(lib.version, lib.name).toBe(lib.requiredVersion);
    }
  });
});
