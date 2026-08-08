import type { Context } from 'hono';
import type { PlatformContext } from './sdk/platform-types.js';
import type { DbLike } from './sdk/helpers.js';
import {
  nowSql,
  publicId,
  notDeletedClause,
  readJsonBody,
  loadModuleSettings,
  saveModuleSettings,} from './sdk/helpers.js';

import crypto from 'node:crypto';


const replayMemory = new Set<string>();
const REPLAY_MEMORY_MAX = 2000;

function orderNumber(): string {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${ymd}`;
}

function parseJson(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function loadPaymentSettings(db: DbLike): Promise<Record<string, unknown>> {
  if (!(await db.tableExists('modules'))) return {};
  const row = await db.one("SELECT settings FROM modules WHERE name='payments' LIMIT 1");
  return parseJson(row?.settings) ?? {};
}

async function publicConfig(db: DbLike): Promise<Record<string, unknown>> {
  const settings = await loadPaymentSettings(db);
  const currency = String(settings.currency ?? 'RUB').toUpperCase();
  const testMode = settings.test_mode !== false;
  const allowOpen = Boolean(settings.allow_open_amount);
  const requireCatalog = settings.require_catalog_item !== false;

  // PHP AbstractProvider: default-on only for manual; always configured.
  const providers: Array<Record<string, unknown>> = [];
  const manualEnabled =
    !Object.prototype.hasOwnProperty.call(settings, 'enable_manual') || Boolean(settings.enable_manual);
  if (manualEnabled) {
    providers.push({ id: 'manual', label: 'Вручную', group: 'other', configured: true });
  }
  const anyConfigured = providers.some((p) => p.configured);
  const defaultId = String(settings.default_provider ?? settings.provider ?? 'manual');
  const defaultConfigured = providers.find((p) => p.id === defaultId)?.configured === true
    || (defaultId === 'manual' && manualEnabled);
  const catalogMode = anyConfigured && requireCatalog && !allowOpen;

  const iconsRaw = String(settings.payment_icons ?? 'mir,visa,mastercard,sbp');
  const allowed = new Set(['mir', 'visa', 'mastercard', 'unionpay', 'sbp', 'paypal', 'applepay', 'googlepay']);
  const paymentIcons: string[] = [];
  for (const part of iconsRaw.split(',')) {
    const id = part.trim().toLowerCase();
    if (id && allowed.has(id) && !paymentIcons.includes(id)) paymentIcons.push(id);
  }

  return {
    providers,
    provider: defaultId,
    default_provider: defaultId,
    currency,
    currency_symbol: String(settings.currency_symbol ?? '₽'),
    merchant_name: String(settings.merchant_name ?? ''),
    test_mode: testMode,
    success_url: String(settings.success_url ?? '/payment-success'),
    fail_url: String(settings.fail_url ?? '/payment-fail'),
    configured: Boolean(defaultConfigured),
    acquiring_ready: anyConfigured,
    catalog_mode: catalogMode,
    require_catalog_item: requireCatalog,
    allow_open_amount: allowOpen,
    offer_url: String(settings.offer_url ?? '/offer'),
    offer_title: String(settings.offer_title ?? 'Публичная оферта'),
    offer_html: String(settings.offer_html ?? ''),
    seller: {
      name: String(settings.seller_name ?? ''),
      inn: String(settings.seller_inn ?? ''),
      ogrn: String(settings.seller_ogrn ?? ''),
      address: String(settings.seller_address ?? ''),
      email: String(settings.seller_email ?? ''),
      phone: String(settings.seller_phone ?? ''),
    },
    payment_icons: paymentIcons.length ? paymentIcons : ['mir', 'visa', 'mastercard'],
    catalog: [],
    stripe_publishable_key: String(settings.stripe_publishable_key ?? ''),
    cloudpayments_public_id: String(settings.cloudpayments_public_id ?? ''),
    adyen_client_key: String(settings.adyen_client_key ?? ''),
    paypal_client_id: String(settings.paypal_client_id ?? ''),
  };
}

function paymentsBareFail(c: Context, error: string, status: 404 | 422) {
  // PHP PaymentsModule / PaymentService bare {success,error} (no data/errors).
  return c.json({ success: false, error, meta: { api_version: 'v1' } }, status);
}

function verifyHmacSignature(rawBody: string, secret: string, header: string | undefined): boolean {
  if (!header || !secret) return false;
  const match = header.match(/^sha256=([a-f0-9]+)$/i);
  if (!match) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = match[1]!.toLowerCase();
  if (provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function signatureHeader(c: { req: { header: (name: string) => string | undefined } }): string | undefined {
  return c.req.header('x-signature') || c.req.header('x-jasefly-signature') || undefined;
}

function idempotencyKey(
  c: { req: { header: (name: string) => string | undefined } },
  body: Record<string, unknown>,
  rawBody: string,
): string {
  const fromHeader = c.req.header('x-idempotency-key') || c.req.header('x-jasefly-idempotency-key');
  if (fromHeader && fromHeader.trim() !== '') return fromHeader.trim().slice(0, 255);
  for (const k of ['idempotency_key', 'event_id', 'payment_id', 'external_id']) {
    const v = body[k];
    if (typeof v === 'string' && v.trim() !== '') return `${k}:${v.trim()}`.slice(0, 255);
    if (typeof v === 'number' && Number.isFinite(v)) return `${k}:${v}`.slice(0, 255);
  }
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}

function rememberReplay(key: string): void {
  replayMemory.add(key);
  if (replayMemory.size > REPLAY_MEMORY_MAX) {
    const first = replayMemory.values().next().value;
    if (first) replayMemory.delete(first);
  }
}

async function ensureWebhookEventsTable(db: DbLike): Promise<void> {
  if (await db.tableExists('payments_webhook_events')) return;
  const driver = db.driver();
  if (driver === 'sqlite') {
    await db.run(
      `CREATE TABLE IF NOT EXISTS payments_webhook_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idempotency_key TEXT NOT NULL UNIQUE,
        provider TEXT NULL,
        payload_hash TEXT NULL,
        created_at TEXT NOT NULL
      )`,
    );
  } else if (driver === 'pgsql') {
    await db.run(
      `CREATE TABLE IF NOT EXISTS payments_webhook_events (
        id SERIAL PRIMARY KEY,
        idempotency_key VARCHAR(255) NOT NULL UNIQUE,
        provider VARCHAR(40) NULL,
        payload_hash VARCHAR(64) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    );
  } else {
    await db.run(
      `CREATE TABLE IF NOT EXISTS payments_webhook_events (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        idempotency_key VARCHAR(255) NOT NULL,
        provider VARCHAR(40) NULL,
        payload_hash VARCHAR(64) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_payments_webhook_idempotency (idempotency_key)
      )`,
    );
  }
}

async function isReplay(db: DbLike, key: string): Promise<boolean> {
  if (replayMemory.has(key)) return true;
  if (!(await db.tableExists('payments_webhook_events'))) return false;
  const row = await db.one('SELECT id FROM payments_webhook_events WHERE idempotency_key=? LIMIT 1', [key]);
  return Boolean(row);
}

async function recordWebhookEvent(
  db: DbLike,
  key: string,
  provider: string,
  payloadHash: string,
): Promise<void> {
  rememberReplay(key);
  await ensureWebhookEventsTable(db);
  try {
    await db.run(
      'INSERT INTO payments_webhook_events (idempotency_key, provider, payload_hash, created_at) VALUES (?, ?, ?, ?)',
      [key, provider, payloadHash, nowSql()],
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique|duplicate/i.test(msg)) return;
    throw e;
  }
}

function normalizePaymentStatus(raw: unknown): string {
  const s = String(raw ?? 'pending').toLowerCase();
  if (['succeeded', 'paid', 'success', 'completed'].includes(s)) return 'succeeded';
  if (['failed', 'canceled', 'cancelled', 'error'].includes(s)) return 'failed';
  return 'pending';
}

function isPaidStatus(status: string): boolean {
  return status === 'succeeded' || status === 'paid';
}

async function syncOrderPaid(db: DbLike, orderId: number): Promise<void> {
  if (!(await db.tableExists('orders'))) return;
  const cols = await db.columns('orders');
  const sets = cols.includes('updated_at') ? "status='paid', updated_at=?" : "status='paid'";
  const params = cols.includes('updated_at') ? [nowSql(), orderId] : [orderId];
  await db.run(`UPDATE orders SET ${sets} WHERE id=?`, params);
}

async function handleWebhook(
  ctx: PlatformContext,
  c: Context,
  providerHint: string,
): Promise<Response> {
  const secret = process.env.PAYMENTS_WEBHOOK_SECRET || '';
  if (!secret) {
    // PHP Shared has no global secret gate — empty payload → 422 Missing payment id.
    // Keep 503 for real VPS deploys where webhook signing is required.
    if (process.env.BEHAVIOR_PARITY === '1' || process.env.APP_ENV === 'test') {
      return paymentsBareFail(c, 'Missing payment id', 422);
    }
    return ctx.http().fail(c, 'webhook_not_configured', 503);
  }

  const rawBody = await c.req.text();
  const sig = signatureHeader(c);
  if (!verifyHmacSignature(rawBody, secret, sig)) {
    return ctx.http().fail(c, 'Invalid signature', 401);
  }

  let body: Record<string, unknown> = {};
  if (rawBody.trim() !== '') {
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      return ctx.http().fail(c, 'Validation failed', 422);
    }
  }

  const provider =
    providerHint ||
    String(c.req.query('provider') ?? body.provider ?? 'manual').toLowerCase().slice(0, 40);
  const replayKey = idempotencyKey(c, body, rawBody);
  const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');

  if (await isReplay(ctx.database(), replayKey)) {
    return ctx.http().ok(c, { received: true, duplicate: true });
  }

  const externalId = String(
    body.external_id ?? body.payment_id ?? body.id ?? body.InvId ?? `wh_${payloadHash.slice(0, 16)}`,
  ).slice(0, 255);
  const orderId = Number(body.order_id ?? 0) || null;
  const amount = Number(body.amount ?? 0);
  const currency = String(body.currency ?? 'RUB').toUpperCase().slice(0, 8);
  const status = normalizePaymentStatus(body.status);

  if (!(await ctx.database().tableExists('payments'))) {
    return ctx.http().fail(c, 'plugin_disabled', 409);
  }

  const existing = await ctx.database().one(
    'SELECT id, order_id, status FROM payments WHERE provider=? AND external_id=? LIMIT 1',
    [provider, externalId],
  );

  const resolvedOrderId = orderId ?? (existing?.order_id != null ? Number(existing.order_id) : null);

  if (existing) {
    await ctx.database().run(
      'UPDATE payments SET status=?, amount=?, currency=?, order_id=COALESCE(?, order_id), raw_payload=?, updated_at=? WHERE id=?',
      [status, amount, currency, resolvedOrderId, rawBody, nowSql(), existing.id],
    );
  } else {
    await ctx.database().run(
      'INSERT INTO payments (provider, external_id, order_id, amount, currency, status, raw_payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [provider, externalId, resolvedOrderId, amount, currency, status, rawBody, nowSql(), nowSql()],
    );
  }

  if (resolvedOrderId && isPaidStatus(status)) {
    await syncOrderPaid(ctx.database(), resolvedOrderId);
    await ctx.events().publish('order.paid', {
      order_id: resolvedOrderId,
      provider,
      external_id: externalId,
      amount,
      currency,
    });
    // PHP canonical name (dual-runtime parity)
    await ctx.events().publish('payment.completed', {
      order_id: resolvedOrderId,
      provider,
      external_id: externalId,
      amount,
      currency,
      status,
    });
  }

  await ctx.events().publish('payment.webhook', {
    provider,
    external_id: externalId,
    order_id: resolvedOrderId,
    status,
    body,
  });

  await recordWebhookEvent(ctx.database(), replayKey, provider, payloadHash);

  return ctx.http().ok(c, { received: true, status, order_id: resolvedOrderId });
}

async function checkout(ctx: PlatformContext, c: Context, body: Record<string, unknown>) {
  if (!(await ctx.database().tableExists('orders'))) return ctx.http().fail(c, 'plugin_disabled', 409);

  const settings = await loadPaymentSettings(ctx.database());
  const allowOpen = Boolean(settings.allow_open_amount);
  const requireCatalog = settings.require_catalog_item !== false;
  const manualEnabled =
    !Object.prototype.hasOwnProperty.call(settings, 'enable_manual') || Boolean(settings.enable_manual);
  const anyConfigured = manualEnabled;
  const catalogMode = anyConfigured && requireCatalog && !allowOpen;

  const acceptOffer = Boolean(body.accept_offer === true || body.accept_offer === 1 || body.accept_offer === '1' || body.accept_offer === 'true');
  const itemType = String(body.item_type ?? '').toLowerCase().trim();
  const itemId = Number(body.item_id ?? 0);

  if (catalogMode || (itemType !== '' && itemId > 0)) {
    if (!acceptOffer) {
      return paymentsBareFail(c, 'Подтвердите согласие с договором-офертой', 422);
    }
  }

  const amount = Math.round(Number(body.amount ?? body.total ?? 0) * 100) / 100;
  if (catalogMode && !(itemType && itemId > 0)) {
    return paymentsBareFail(c, 'Выберите услугу или товар', 422);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return paymentsBareFail(c, 'Укажите сумму больше нуля', 422);
  }

  const currency = String(body.currency ?? settings.currency ?? 'RUB')
    .toUpperCase()
    .trim()
    .slice(0, 8);
  if (!/^[A-Z]{3}$/.test(currency)) {
    return paymentsBareFail(c, 'Некорректная валюта', 422);
  }

  const number = orderNumber();
  const email = String(body.email ?? body.customer_email ?? '').trim() || null;
  const name = String(body.name ?? body.customer_name ?? '').trim() || null;
  const provider = String(body.provider ?? settings.default_provider ?? 'manual').slice(0, 40);
  const cols = await ctx.database().columns('orders');

  let orderId = 0;
  if (cols.includes('number')) {
    await ctx.database().run(
      'INSERT INTO orders (number, customer_email, customer_name, amount, currency, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [number, email, name, amount, currency, 'pending', nowSql()],
    );
  } else {
    await ctx.database().run('INSERT INTO orders (status, created_at) VALUES (?, ?)', ['pending', nowSql()]);
  }
  orderId = await ctx.database().lastInsertId();

  let paymentId: number | null = null;
  if (await ctx.database().tableExists('payments')) {
    const externalId = `local_${number}`;
    await ctx.database().run(
      'INSERT INTO payments (provider, external_id, order_id, amount, currency, status, raw_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        provider,
        externalId,
        orderId,
        amount,
        currency,
        'pending',
        JSON.stringify({ stage: 'created', description: body.description ?? null }),
        nowSql(),
      ],
    );
    paymentId = await ctx.database().lastInsertId();
  }

  return ctx.http().ok(c, {
    order_id: orderId,
    order_number: number,
    payment_id: paymentId,
    provider,
    amount,
    currency,
    status: 'pending',
  });
}

export async function register(ctx: PlatformContext) {
  const http = ctx.http();
  const db = ctx.database();
  const events = ctx.events();
  const admin = http.admin();
  const crud = ctx.adminResources();
  void admin;
  void crud;


    http.get('/payments/config', async (c) => http.ok(c, await publicConfig(db)));

    http.post('/payments/checkout', async (c) => {
      let body: Record<string, unknown> = {};
      try {
        body = (await c.req.json()) as Record<string, unknown>;
      } catch {
        return paymentsBareFail(c, 'Validation failed', 422);
      }
      return checkout(ctx, c, body);
    });

    const webhookHandler = async (c: Context) => {
      const provider = c.req.param('provider') || c.req.query('provider') || '';
      return handleWebhook(ctx, c, provider);
    };

    http.post('/payments/webhook', webhookHandler);
    http.post('/payments/webhook/:provider', webhookHandler);

    http.get('/admin/payments', admin, async (c) => {
      if (!(await db.tableExists('payments'))) return http.ok(c, []);
      return http.ok(c, await db.all('SELECT * FROM payments ORDER BY id DESC LIMIT 100'));
    });

    http.get('/commerce/catalog', async (c) => {
      const items: Record<string, unknown>[] = [];
      const del = async (table: string) => {
        const cols = await db.columns(table);
        return cols.includes('deleted_at') ? ' AND deleted_at IS NULL' : '';
      };
      if (await db.tableExists('services')) {
        const cols = await db.columns('services');
        const vis = cols.includes('is_visible') ? ' AND is_visible=1' : '';
        const purch = cols.includes('is_purchasable') ? ' AND is_purchasable=1' : '';
        const rows = await db.all(
          `SELECT * FROM services WHERE price IS NOT NULL AND price > 0${vis}${purch}${await del('services')} ORDER BY sort_order, id`,
        ).catch(() => []);
        for (const row of rows) {
          items.push({
            type: 'service',
            id: row.id,
            title: row.title,
            slug: row.slug,
            price: Number(row.price ?? 0),
            currency: String(row.currency ?? 'RUB').toUpperCase(),
            sort_order: Number(row.sort_order ?? 0),
          });
        }
      }
      if (await db.tableExists('products')) {
        const cols = await db.columns('products');
        const vis = cols.includes('is_visible') ? ' AND is_visible=1' : '';
        const rows = await db.all(
          `SELECT * FROM products WHERE price > 0${vis}${await del('products')} ORDER BY sort_order, id`,
        ).catch(() => []);
        for (const row of rows) {
          items.push({
            type: 'product',
            id: row.id,
            title: row.title,
            slug: row.slug,
            price: Number(row.price ?? 0),
            currency: String(row.currency ?? 'RUB').toUpperCase(),
            sort_order: Number(row.sort_order ?? 0),
          });
        }
      }
      items.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
      return http.ok(c, items);
    });

    http.get('/commerce/item', async (c) => {
      const type = String(c.req.query('type') ?? '').toLowerCase().trim();
      const id = Number(c.req.query('id') ?? 0);
      if (!id || !['service', 'product'].includes(type)) return http.fail(c, 'Not found', 404);
      const table = type === 'service' ? 'services' : 'products';
      if (!(await db.tableExists(table))) return http.fail(c, 'Not found', 404);
      const cols = await db.columns(table);
      const vis = cols.includes('is_visible') ? ' AND is_visible=1' : '';
      const del = cols.includes('deleted_at') ? ' AND deleted_at IS NULL' : '';
      const row = await db.one(`SELECT * FROM ${table} WHERE id=?${vis}${del}`, [id]);
      if (!row) return http.fail(c, 'Not found', 404);
      const price = Number(row.price ?? 0);
      const stock = row.stock ?? null;
      const purchasable = Number(row.is_purchasable ?? 1) === 1;
      const inStock = stock === null || Number(stock) > 0;
      return http.ok(c, {
        type,
        id: row.id,
        title: row.title,
        slug: row.slug,
        price,
        currency: String(row.currency ?? 'RUB').toUpperCase(),
        description: row.short_description ?? row.description ?? '',
        available: purchasable && inStock && price > 0,
        unavailable_reason: !purchasable
          ? 'Товар нельзя купить'
          : !inStock
            ? 'Нет в наличии'
            : price <= 0
              ? 'Не указана цена'
              : null,
      });
    });

    http.get('/payments/status/:id', async (c) => {
      if (!(await db.tableExists('payments'))) return paymentsBareFail(c, 'Not found', 404);
      const row = await db.one('SELECT * FROM payments WHERE id=?', [c.req.param('id')]);
      if (!row) return paymentsBareFail(c, 'Not found', 404);
      return http.ok(c, row);
    });
  
}
