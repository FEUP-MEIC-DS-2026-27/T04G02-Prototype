# T04G02-Prototype
This is the repo for a prototype created by T04G02

Display interactive graphs to explore projects by status.

Idea of architecture :

┌─────────────────────────────────────────────────────┐
│  Shell (React Host)                                 │
│  ┌─────────────────┐  ┌──────────────────────────┐ │
│  │ Project Filter  │  │ Chart Micro-frontend     │ │
│  │ (status select) │  │ (React + ECharts/Recharts)│ │
│  └────────┬────────┘  └────────────┬─────────────┘ │
│           │ EventBus (mitt/tiny-   │ SSE / EventSource│
│           │ emitter)               │                 │
└───────────┼────────────────────────┼─────────────────┘
            │                        │
            ▼                        ▼
┌─────────────────────────────────────────────────────┐
│  BFF / Micro-backend (Node.js + Express/Fastify)    │
│  ┌──────────────┐  ┌────────────┐  ┌─────────────┐ │
│  │ REST API     │  │ Event Bus  │  │ SSE Hub     │ │
│  │ /projects    │  │ (EventEmit)│  │ /events     │ │
│  └──────┬───────┘  └─────┬──────┘  └──────┬──────┘ │
│         │                │                 │        │
│         ▼                ▼                 ▼        │
│  ┌─────────────────────────────────────────────┐   │
│  │ In-Memory Store (prototype) / SQLite / PG   │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
