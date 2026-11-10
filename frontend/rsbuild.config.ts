import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import federation from './module-federation.config';

const port = 3005;

export default defineConfig({
  plugins: [pluginReact(), pluginModuleFederation(federation)],
  html: { title: 'Project Status' },
  server: {
    host: '0.0.0.0',
    port,
    strictPort: true,
    // The h.i shell and standalone VA3.
    cors: { origin: ['http://localhost:3000', 'http://localhost:3003'] },
  },
  dev: { assetPrefix: `http://localhost:${port}/` },
  // Resolve assets from wherever the manifest was loaded, not from the host's origin.
  output: { assetPrefix: 'auto' },
});
