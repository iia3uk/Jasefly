import type { EventBus } from '../platform/events.js';

export type JobHandler = (payload: Record<string, unknown>, ctx: JobHandlerContext) => Promise<void> | void;

export type JobHandlerContext = {
  events: EventBus;
  signal: AbortSignal;
};

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function getJobHandler(type: string): JobHandler | undefined {
  return handlers.get(type);
}

export function jobHandlerTypes(): string[] {
  // Match PHP JobHandlerRegistry::types() registration order (not alpha-sorted).
  return [
    'scheduler.noop',
    'platform.event.dispatch',
    'scheduler.cleanup',
    'automation.resume',
    'newsletter.campaign.send',
    'analytics.retention',
    'analytics.aggregate',
  ];
}

export function resolveHandlerType(job: Record<string, unknown>): string {
  const payload = parsePayload(job.payload);
  return String(job.type ?? job.handler ?? payload.type ?? payload.handler ?? '').trim();
}

export function parsePayload(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const decoded = JSON.parse(raw) as unknown;
      if (typeof decoded === 'object' && decoded !== null && !Array.isArray(decoded)) {
        return decoded as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export function registerDefaultHandlers(events: EventBus): void {
  const noop: JobHandler = () => {};
  for (const alias of ['noop', 'scheduler.noop', 'scheduler.cleanup', 'automation.resume', 'newsletter.campaign.send', 'analytics.retention', 'analytics.aggregate']) {
    registerJobHandler(alias, noop);
  }

  registerJobHandler('http_ping', async (payload, ctx) => {
    const url = String(payload.url ?? payload.endpoint ?? '').trim();
    if (!url) throw new Error('http_ping: url required');
    const timeoutMs = Math.max(1000, Math.min(60000, Number(payload.timeout_ms ?? payload.timeout ?? 10000)));
    const res = await fetch(url, { signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(timeoutMs)]) });
    if (!res.ok) throw new Error(`http_ping: HTTP ${res.status}`);
  });

  const eventHandler: JobHandler = async (payload, ctx) => {
    const event = String(payload._platform_event ?? payload.event ?? payload.name ?? '').trim();
    if (!event) throw new Error('event: event name required');
    await ctx.events.publish(event, payload);
  };
  for (const alias of ['event', 'platform.event.dispatch']) {
    registerJobHandler(alias, eventHandler);
  }
}
