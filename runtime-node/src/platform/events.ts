type Handler = (payload: Record<string, unknown>) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<string, { fn: Handler; priority: number }[]>();

  subscribe(event: string, handler: Handler, priority = 100): void {
    const list = this.handlers.get(event) ?? [];
    list.push({ fn: handler, priority });
    list.sort((a, b) => b.priority - a.priority);
    this.handlers.set(event, list);
  }

  unsubscribe(event: string, handler: Handler): boolean {
    const list = this.handlers.get(event);
    if (!list) return false;
    const next = list.filter((h) => h.fn !== handler);
    if (next.length === list.length) return false;
    if (next.length === 0) this.handlers.delete(event);
    else this.handlers.set(event, next);
    return true;
  }

  async publish(event: string, payload: Record<string, unknown> = {}): Promise<void> {
    const list = this.handlers.get(event) ?? [];
    for (const h of list) {
      await h.fn(payload);
    }
    // Wildcard fans-out after named handlers (parity with PHP EventDispatcher).
    if (event !== '*') {
      const wild = this.handlers.get('*') ?? [];
      for (const h of wild) {
        await h.fn({ ...payload, _event: event, _wildcard: true });
      }
    }
  }
}
