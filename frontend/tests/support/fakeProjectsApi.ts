import { vi } from 'vitest';

type Status = 'pending' | 'in_progress' | 'completed';

export interface FakeProject {
  id: number;
  name: string;
  status: Status;
}

const statuses: Status[] = ['pending', 'in_progress', 'completed'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * An in-memory copy of the Laravel API (routes/api.php), answering fetch() calls
 * with the same response shapes, validation and errors. Replaces global fetch.
 */
export function installFakeProjectsApi(baseUrl: string, initial: FakeProject[]) {
  const projects = initial.map((p) => ({ ...p }));
  const requests: { method: string; url: string; headers: Headers; body: unknown }[] = [];
  let failNextListWith: number | null = null;

  const list = () => ({
    projects,
    stats: {
      total: projects.length,
      pending: projects.filter((p) => p.status === 'pending').length,
      in_progress: projects.filter((p) => p.status === 'in_progress').length,
      completed: projects.filter((p) => p.status === 'completed').length,
    },
  });

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ method, url, headers: new Headers(init.headers), body });

    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    if (!url.startsWith(baseUrl)) throw new TypeError(`Failed to fetch ${url}`);
    const path = url.slice(baseUrl.length);

    if (method === 'GET' && path === '/api/projects') {
      if (failNextListWith !== null) {
        const status = failNextListWith;
        failNextListWith = null;
        return json({ message: 'Server Error' }, status);
      }
      return json(list());
    }

    const update = path.match(/^\/api\/projects\/(\d+)\/status$/);
    if (method === 'POST' && update) {
      if (!statuses.includes(body?.status)) {
        return json({ message: 'The selected status is invalid.', errors: { status: ['The selected status is invalid.'] } }, 422);
      }
      const project = projects.find((p) => p.id === Number(update[1]));
      if (!project) return json({ message: `No query results for model [App\\Models\\Project] ${update[1]}` }, 404);
      project.status = body.status;
      return json({ message: 'Status updated and event published to Kafka', data: project });
    }

    return json({ message: 'Not Found' }, 404);
  });

  vi.stubGlobal('fetch', fetchMock);

  return {
    projects,
    requests,
    /** Simulate another user or system changing a project on the server. */
    setStatus(id: number, status: Status) {
      const project = projects.find((p) => p.id === id);
      if (project) project.status = status;
    },
    failNextList(status = 500) {
      failNextListWith = status;
    },
    listCalls: () => requests.filter((r) => r.method === 'GET').length,
  };
}
