/**
 * Stands in for the SSE hub. Tests push events with emit() and simulate the
 * connection opening or dropping with open() / fail().
 */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];

  static latest(): FakeEventSource {
    const source = FakeEventSource.instances[FakeEventSource.instances.length - 1];
    if (!source) throw new Error('No EventSource was opened');
    return source;
  }

  static reset() {
    FakeEventSource.instances = [];
  }

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  open() {
    this.onopen?.(new Event('open'));
  }

  fail() {
    this.onerror?.(new Event('error'));
  }

  emit(data: unknown) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    this.onmessage?.(new MessageEvent('message', { data: payload }));
  }

  close() {
    this.closed = true;
  }
}
