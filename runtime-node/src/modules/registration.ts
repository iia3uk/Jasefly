import type { Context } from 'hono';
import crypto from 'node:crypto';
import type { ModuleContext } from '../core/types.js';
import { fail, ok } from '../http/envelope.js';
import { hashPassword } from '../auth/password.js';
import { moduleSettings, nowSql, readJsonBody } from './_helpers.js';

export const name = 'registration';

/** PHP RegistrationModule::settings() — schema defaults before stored JSON. */
const REGISTRATION_DEFAULTS: Record<string, unknown> = {
  registration_enabled: false,
  default_role: 'member',
  allow_role_override: false,
  auto_login_after_register: true,
  redirect_after_register: '/',
  redirect_after_verify: '/admin/login',
  auto_login_after_verify: false,
  closed_message: 'Регистрация временно закрыта.',
  success_message: 'Аккаунт создан. Если нужно — подтвердите email.',
  require_name: true,
  min_password_length: 8,
  require_password_confirm: true,
  show_login_link: true,
  login_path: '/admin/login',
  terms_required: false,
  terms_url: '/privacy',
  terms_label: 'Согласен с политикой конфиденциальности',
  require_email_verification: false,
  verification_token_ttl_hours: 48,
  block_login_until_verified: true,
  honeypot_enabled: true,
  captcha_mode: 'none',
};

function asBool(v: unknown, fallback: boolean): boolean {
  if (v === undefined || v === null) return fallback;
  return Boolean(v);
}

/** PHP PluginStateService::getSettings — defaults merged under stored. */
async function resolvedRegistrationSettings(db: ModuleContext['db']): Promise<Record<string, unknown>> {
  const stored = await moduleSettings(db, 'registration');
  return { ...REGISTRATION_DEFAULTS, ...stored };
}

/** PHP RegistrationService::publicCaptchaConfig() */
async function publicCaptchaConfig(
  db: ModuleContext['db'],
  settings: Record<string, unknown>,
): Promise<Record<string, string>> {
  const mode = String(settings.captcha_mode ?? 'none');
  const mail = await moduleSettings(db, 'mail');
  if (mode === 'inherit_mail') {
    return {
      provider: String(mail.captcha_provider ?? 'none'),
      turnstile_site_key: String(mail.turnstile_site_key ?? ''),
      smartcaptcha_site_key: String(mail.smartcaptcha_site_key ?? ''),
    };
  }
  if (mode === 'turnstile') {
    return {
      provider: 'turnstile',
      turnstile_site_key: String(mail.turnstile_site_key ?? ''),
      smartcaptcha_site_key: '',
    };
  }
  if (mode === 'smartcaptcha') {
    return {
      provider: 'smartcaptcha',
      turnstile_site_key: '',
      smartcaptcha_site_key: String(mail.smartcaptcha_site_key ?? ''),
    };
  }
  return { provider: 'none', turnstile_site_key: '', smartcaptcha_site_key: '' };
}

/** PHP RegistrationService::publicConfig() */
async function publicConfig(db: ModuleContext['db']): Promise<Record<string, unknown>> {
  const s = await resolvedRegistrationSettings(db);
  return {
    enabled: asBool(s.registration_enabled, false),
    require_name: asBool(s.require_name, true),
    min_password_length: Math.max(6, Number(s.min_password_length ?? 8) || 8),
    require_password_confirm: asBool(s.require_password_confirm, true),
    require_email_verification: asBool(s.require_email_verification, false),
    show_login_link: asBool(s.show_login_link, true),
    login_path: String(s.login_path ?? '/admin/login'),
    honeypot_enabled: asBool(s.honeypot_enabled, true),
    terms_required: asBool(s.terms_required, false),
    terms_url: String(s.terms_url ?? '/privacy'),
    terms_label: String(s.terms_label ?? 'Согласен с политикой конфиденциальности'),
    closed_message: String(s.closed_message ?? 'Регистрация временно закрыта.'),
    success_message: String(s.success_message ?? 'Аккаунт создан.'),
    captcha: await publicCaptchaConfig(db, s),
  };
}

export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/registration/config`, async (c) => ok(c, await publicConfig(ctx.db)));

    const registerHandler = async (c: Context) => {
      const settings = await resolvedRegistrationSettings(ctx.db);
      // PHP default: registration_enabled=false → 403 closed
      if (!settings.registration_enabled) {
        return fail(c, String(settings.closed_message ?? 'Регистрация временно закрыта.'), 403);
      }

      const body = await readJsonBody(c);
      if (body instanceof Response) return body;

      const email = String(body.email ?? '').toLowerCase().trim();
      const password = String(body.password ?? '');
      const name = String(body.name ?? '').trim();
      const minLen = Number(settings.min_password_length ?? 8) || 8;

      if (!email || !email.includes('@')) return fail(c, 'Validation failed', 422, { email: 'invalid' });
      if (!password || password.length < minLen) {
        return fail(c, 'Validation failed', 422, { password: `min ${minLen} chars` });
      }
      if (body.password_confirm !== undefined && password !== String(body.password_confirm)) {
        return fail(c, 'Validation failed', 422, { password_confirm: 'mismatch' });
      }

      const exists = await ctx.db.one('SELECT id FROM users WHERE email=?', [email]);
      if (exists) return fail(c, 'Conflict', 409);

      const role = String(body.role ?? 'member');
      const safeRole = ['member', 'editor'].includes(role) ? role : 'member';

      await ctx.db.run('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)', [
        email,
        await hashPassword(password),
        name,
        safeRole,
      ]);
      const id = await ctx.db.lastInsertId();
      await ctx.events.publish('user.registered', { id, email, role: safeRole });

      return ok(c, {
        ok: true,
        message: 'Аккаунт создан.',
        user: { id, email, name, role: safeRole },
      }, 201);
    };

    ctx.app.post(`${p}/auth/register`, registerHandler);
    ctx.app.post(`${p}/registration/register`, registerHandler);

    const verifyHandler = async (c: Context) => {
      let bodyToken = String(c.req.query('token') ?? '').trim();
      if (!bodyToken && c.req.method !== 'GET' && c.req.method !== 'HEAD') {
        const body = await readJsonBody(c);
        if (body instanceof Response) return body;
        bodyToken = String(body.token ?? '').trim();
      }
      if (!bodyToken || bodyToken.length < 16) return fail(c, 'Некорректная ссылка', 400);
      const cols = await ctx.db.columns('users');
      if (!cols.includes('email_verify_token')) return fail(c, 'Email verification not configured', 400);
      const user = await ctx.db.one('SELECT * FROM users WHERE email_verify_token=? LIMIT 1', [bodyToken]);
      if (!user) return fail(c, 'Ссылка недействительна или уже использована', 400);
      const exp = String(user.email_verify_expires_at ?? '');
      if (exp && new Date(exp).getTime() < Date.now()) return fail(c, 'Срок действия ссылки истёк', 400);
      const sets = ['email_verified_at=?', 'email_verify_token=NULL', 'email_verify_expires_at=NULL'];
      const params: unknown[] = [nowSql()];
      if (cols.includes('updated_at')) {
        sets.push('updated_at=?');
        params.push(nowSql());
      }
      params.push(user.id);
      await ctx.db.run(`UPDATE users SET ${sets.join(', ')} WHERE id=?`, params);
      const fresh = await ctx.db.one('SELECT id, email, name, role FROM users WHERE id=?', [user.id]);
      return ok(c, {
        verified: true,
        message: 'Email подтверждён.',
        redirect: '/admin/login',
        user: fresh,
      });
    };

    ctx.app.get(`${p}/auth/verify-email`, verifyHandler);
    ctx.app.post(`${p}/auth/verify-email`, verifyHandler);

    ctx.app.post(`${p}/auth/resend-verification`, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const email = String(body.email ?? '').toLowerCase().trim();
      const cols = await ctx.db.columns('users');
      if (cols.includes('email_verify_token') && email) {
        const user = await ctx.db.one('SELECT * FROM users WHERE email=? LIMIT 1', [email]);
        if (user && !user.email_verified_at) {
          const token = crypto.randomBytes(32).toString('hex');
          const expires = new Date(Date.now() + 48 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
          await ctx.db.run('UPDATE users SET email_verify_token=?, email_verify_expires_at=? WHERE id=?', [
            token,
            expires,
            user.id,
          ]);
        }
      }
      return ok(c, {
        ok: true,
        message: 'Если аккаунт ждёт подтверждения — письмо отправлено.',
      });
    });
  }
}
