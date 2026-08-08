import { describe, expect, it, beforeEach } from 'vitest';
import { EventCatalog } from '../src/platform/EventCatalog.js';
import { CapabilityRuntime } from '../src/platform/CapabilityRuntime.js';
import { PackageSurfaceRegistry } from '../src/platform/PackageSurfaceRegistry.js';
import { contentResources } from '../src/core/permissionMiddleware.js';
import { trashableMap } from '../src/system/helpers.js';
import {
  getJobHandler,
  registerDefaultHandlers,
  registerOwnedJobHandler,
  clearOwnedJobHandlers,
  resetJobHandlersForTests,
} from '../src/scheduler/JobHandlerRegistry.js';
import { EventBus } from '../src/platform/events.js';
import { isSafeHttpUrl } from '../src/support/ssrfGuard.js';

describe('Package host foundation units', () => {
  beforeEach(() => {
    EventCatalog.resetForTests();
    CapabilityRuntime.resetForTests();
    PackageSurfaceRegistry.resetForTests();
    resetJobHandlersForTests();
  });

  it('EventCatalog declare / clearOwner / list', () => {
    EventCatalog.declare('probe.alpha', 'alpha-mod', { label: 'Alpha' });
    EventCatalog.declare('probe.beta', 'beta-mod', { label: 'Beta' });
    expect(EventCatalog.list()).toHaveLength(2);
    expect(EventCatalog.clearOwner('alpha-mod')).toBe(1);
    expect(EventCatalog.has('probe.alpha')).toBe(false);
    expect(EventCatalog.has('probe.beta')).toBe(true);
  });

  it('CapabilityRuntime provide / revokeModule', () => {
    CapabilityRuntime.provide('pkg-a', 'pkg-a.feature');
    expect(CapabilityRuntime.has('pkg-a.feature')).toBe(true);
    CapabilityRuntime.revokeModule('pkg-a');
    expect(CapabilityRuntime.has('pkg-a.feature')).toBe(false);
  });

  it('owned job handlers clear on owner revoke', () => {
    registerOwnedJobHandler('pkg-a', 'pkg-a.job', async () => {});
    expect(getJobHandler('pkg-a.job')).toBeTypeOf('function');
    clearOwnedJobHandlers('pkg-a');
    expect(getJobHandler('pkg-a.job')).toBeUndefined();
  });

  it('http_ping uses SSRF-safe path (blocks private URLs)', async () => {
    const bus = new EventBus();
    registerDefaultHandlers(bus);
    const handler = getJobHandler('http_ping');
    expect(handler).toBeTypeOf('function');
    await expect(
      handler!(
        { url: 'http://127.0.0.1/' },
        { events: bus, signal: new AbortController().signal },
      ),
    ).rejects.toThrow(/SSRF/i);
    expect(await isSafeHttpUrl('http://127.0.0.1/')).toBe(false);
  });

  it('PackageSurfaceRegistry register / clearOwner / host merge', () => {
    PackageSurfaceRegistry.register('blog', {
      trash: [{ resource: 'blog', table: 'blog_posts' }],
      content_acl: [{ resource: 'blog' }],
      dashboard: [{ table: 'blog_posts', count_as: 'blog_posts' }],
    });
    expect(trashableMap().blog).toBe('blog_posts');
    expect(contentResources()).toContain('blog');
    expect(PackageSurfaceRegistry.dashboardMetrics()).toHaveLength(1);
    expect(PackageSurfaceRegistry.clearOwner('blog')).toBe(1);
    expect(trashableMap().blog).toBeUndefined();
  });

  it('EventBus wildcard fans out after named handlers', async () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.subscribe('*', async (payload) => {
      seen.push(String(payload._event ?? ''));
    });
    bus.subscribe('form.submitted', async () => {
      seen.push('named');
    });
    await bus.publish('form.submitted', { id: 1 });
    expect(seen).toEqual(['named', 'form.submitted']);
  });
});
