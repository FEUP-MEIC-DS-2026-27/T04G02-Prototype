import './bootstrap';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectStatusTracker } from './Components/ProjectStatusTracker';

const container = document.getElementById('react-app');
if (container) {
    const root = createRoot(container);
    root.render(<ProjectStatusTracker />);
}