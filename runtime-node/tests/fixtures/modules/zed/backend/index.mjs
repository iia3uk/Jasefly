/**
 * Synthetic unknown-package Node entry v2 — loaded only from installed package storage.
 * Surfaces also come from module.json; this proves runtime register() without host edits.
 */
export async function register(ctx) {
  const slug = ctx.slug();

  ctx.capabilities().provide(`${slug}.ping`);

  ctx.surfaces().register({
    trash: [{ resource: 'zed-items', table: 'zed_items' }],
    schema: [{ table: 'zed_items', role: 'owner' }],
  });

  ctx.events().declare(`${slug}.ready`, {
    label: 'Synthetic package ready',
    category: 'probe',
    payload: { slug },
  });

  ctx.scheduler().registerHandler(`${slug}.tick`, async () => {
    /* optional proof handler — noop */
  });

  ctx.http().get(`/${slug}/ping`, async (c) => {
    const bag = await ctx.settings().get();
    const marker = bag?.probe_marker ?? null;
    return c.json({
      success: true,
      data: {
        pong: true,
        slug,
        runtime: ctx.runtime(),
        capability: ctx.capabilities().has(`${slug}.ping`),
        declared: ctx.events().hasDeclared(`${slug}.ready`),
        settings_marker: marker,
      },
      meta: { api_version: 'v1' },
    });
  });

  ctx.http().post(
    `/${slug}/settings`,
    ctx.http().permission('zed.manage'),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const marker = String(body?.probe_marker ?? 'zed-ok');
      await ctx.settings().set({ probe_marker: marker });
      const bag = await ctx.settings().get();
      return c.json({
        success: true,
        data: { probe_marker: bag?.probe_marker ?? null },
        meta: { api_version: 'v1' },
      });
    },
  );

  ctx.http().get(
    `/${slug}/secure`,
    ctx.http().permission('zed.view'),
    (c) =>
      c.json({
        success: true,
        data: { secure: true, slug },
        meta: { api_version: 'v1' },
      }),
  );
}
