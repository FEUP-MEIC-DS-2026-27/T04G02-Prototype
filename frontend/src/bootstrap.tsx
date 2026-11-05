import 'bootstrap/dist/css/bootstrap.min.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ProjectStatusTracker from './ProjectStatusTracker';

// Standalone mode only. Inside h.i, ./Dashboard is loaded as a federated module
// and the host provides Bootstrap, so this file is not used.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="container py-4">
      <ProjectStatusTracker />
    </div>
  </StrictMode>,
);
