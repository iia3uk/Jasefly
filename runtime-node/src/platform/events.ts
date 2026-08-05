type Handler = (payload: Record<string, unknown>) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<string, { fn: Handler; priority: number }[]>();

  subscribe(event: string, handler: Handler, priority = 100): void {
    const list = this.handlers.get(event) ?? [];
    list.push({ fn: handler, priority });
    list.sort((a, b) => b.priority - a.priority);
    this.handlers.set(event, list);
  }

  async publish(event: string, payload: Record<string, unknown> = {}): Promise<void> {
    const list = this.handlers.get(event) ?? [];
    for (const h of list) {
      await h.fn(payload);
    }
  }
}
