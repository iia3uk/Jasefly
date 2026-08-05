import crypto from 'node:crypto';
import type { Context } from 'hono';
import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { nowSql, readJsonBody } from './_helpers.js';

export const name = 'mail';

const csrfTokens = new Map<string, number>();
const ipRate = new Map<string, { count: number; resetAt: number }>();

function issueCsrf(): string {
  const token = crypto.randomBytes(16).toString('hex');
  csrfTokens.set(token, Date.now() + 3600_000);
  return token;
}

function verifyCsrf(token: string): boolean {
  const exp = csrfTokens.get(token);
  if (!exp || Date.now() > exp) return false;
  return true;
}

function allowIp(ip: string): boolean {
  // PHP ContactFormService::allowIp — 1 message / IP / minute (shared across /contact + /mail/contact).
  const now = Date.now();
  const entry = ipRate.get(ip);
  if (!entry || now >= entry.resetAt) {
    ipRate.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  return false;
}

async function insertContactMessage(
  db: ModuleContext['db'],
  payload: { name: string; email: string; message: string; subject?: string },
  ip: string,
  ua: string,
): Promise<void> {
  const table = (await db.tableExists('contact_messages'))
    ? 'contact_messages'
    : (await db.tableExists('messages'))
      ? 'messages'
      : null;
  if (!table) throw new Error('capability_unavailable');

  const cols = await db.columns(table);
  const data: Record<string, unknown> = {};
  if (cols.includes('name')) data.name = payload.name;
  if (cols.includes('email')) data.email = payload.email;
  if (cols.includes('message')) data.message = payload.message;
  if (cols.includes('subject')) data.subject = payload.subject ?? 'Сообщение с сайта';
  if (cols.includes('ip_address')) data.ip_address = ip;
  if (cols.includes('user_agent')) data.user_agent = ua.slice(0, 500);
  if (cols.includes('created_at')) data.created_at = nowSql();
  const keys = Object.keys(data);
  await db.run(
    `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    keys.map((k) => data[k]),
  );
}

async function handleContact(ctx: ModuleContext, c: Context) {
  const hasTable =
    (await ctx.db.tableExists('contact_messages')) || (await ctx.db.tableExists('messages'));
  if (!hasTable) return fail(c, 'capability_unavailable', 409);

  const body = await readJsonBody(c);
  if (body instanceof Response) return body;

  if (body.website || body.company_url || body.hp_field) {
    return ok(c, { message: 'Спасибо! Сообщение отправлено.' }, 201);
  }

  const csrf = String(body.csrf ?? body._csrf ?? '');
  if (csrf && !verifyCsrf(csrf)) {
    return fail(c, 'Сессия устарела. Обновите страницу.', 422);
  }

  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
  if (!allowIp(ip)) return fail(c, 'Слишком часто. Подождите минуту.', 429);

  const name = String(body.name ?? '').trim().slice(0, 120);
  const email = String(body.email ?? '').toLowerCase().trim();
  const message = String(body.message ?? '').trim().slice(0, 4000);
  const errors: Record<string, string> = {};
  if (!name) errors.name = 'required';
  if (!email || !email.includes('@')) errors.email = 'invalid';
  if (!message) errors.message = 'required';
  if (Object.keys(errors).length) return fail(c, 'Validation failed', 422, errors);

  try {
    await insertContactMessage(
      ctx.db,
      { name, email, message, subject: String(body.subject ?? '') },
      ip,
      c.req.header('user-agent') ?? '',
    );
  } catch {
    return fail(c, 'capability_unavailable', 409);
  }

  await ctx.events.publish('form.submitted', { source: 'contact', name, email });
  return ok(c, { message: 'Спасибо! Сообщение отправлено.' }, 201);
}

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/mail/csrf`, async (c) => ok(c, { csrf: issueCsrf() }));

    ctx.app.get(`${p}/mail/config`, async (c) =>
      ok(c, {
        captcha_provider: 'none',
        turnstile_site_key: '',
        smartcaptcha_site_key: '',
        success_message: 'Спасибо! Сообщение отправлено.',
      }),
    );

    ctx.app.post(`${p}/mail/contact`, async (c) => handleContact(ctx, c));
    ctx.app.post(`${p}/contact`, async (c) => handleContact(ctx, c));

    ctx.app.post(`${p}/admin/mail/test`, admin, async (c) =>
      fail(c, 'SMTP not configured in Node runtime — use hosting PHP mail plugin or configure outbound separately', 501),
    );

    ctx.app.post(`${p}/admin/mail/test-telegram`, admin, async (c) =>
      ok(c, { skipped: true, message: 'Telegram notifications skipped in Node baseline' }),
    );
  }
}
