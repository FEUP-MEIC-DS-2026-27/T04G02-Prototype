import { createModuleFederationConfig } from '@module-federation/rsbuild-plugin';

export default createModuleFederationConfig({
  name: 'project_status',
  filename: 'remoteEntry.js',
  manifest: true,
  exposes: { './Dashboard': './src/ProjectStatusTracker.tsx' },
  shareStrategy: 'loaded-first',
  // Must match packages/config/src/federation.ts in h.i exactly.
  shared: {
    react: { singleton: true, strictVersion: true, requiredVersion: '18.3.1' },
    'react-dom': { singleton: true, strictVersion: true, requiredVersion: '18.3.1' },
    'react-router-dom': { singleton: true, strictVersion: true, requiredVersion: '7.9.6' },
  },
  dts: false,
});
