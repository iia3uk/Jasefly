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
async function resolvedRegistrationSettings(db: DbLike): Promise<Record<string, unknown>> {
  const stored = await loadModuleSettings(db, 'registration');
  return { ...REGISTRATION_DEFAULTS, ...stored };
}

/** PHP RegistrationService::publicCaptchaConfig() */
async function publicCaptchaConfig(
  db: DbLike,
  settings: Record<string, unknown>,
): Promise<Record<string, string>> {
  const mode = String(settings.captcha_mode ?? 'none');
  const mail = await loadModuleSettings(db, 'mail');
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
async function publicConfig(db: DbLike): Promise<Record<string, unknown>> {
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

export async function register(ctx: PlatformContext) {
  const http = ctx.http();
  const db = ctx.database();
  const events = ctx.events();
  const admin = http.admin();
  const crud = ctx.adminResources();
  void admin;
  void crud;


    http.get('/registration/config', async (c) => http.ok(c, await publicConfig(db)));

    const registerHandler = async (c: Context) => {
      const settings = await resolvedRegistrationSettings(db);
      // PHP default: registration_enabled=false → 403 closed
      if (!settings.registration_enabled) {
        return http.fail(c, String(settings.closed_message ?? 'Регистрация временно закрыта.'), 403);
      }

      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;

      const email = String(body.email ?? '').toLowerCase().trim();
      const password = String(body.password ?? '');
      const name = String(body.name ?? '').trim();
      const minLen = Number(settings.min_password_length ?? 8) || 8;

      if (!email || !email.includes('@')) return http.fail(c, 'Validation failed', 422, { email: 'invalid' });
      if (!password || password.length < minLen) {
        return http.fail(c, 'Validation failed', 422, { password: `min ${minLen} chars` });
      }
      if (body.password_confirm !== undefined && password !== String(body.password_confirm)) {
        return http.fail(c, 'Validation failed', 422, { password_confirm: 'mismatch' });
      }

      const exists = await db.one('SELECT id FROM users WHERE email=?', [email]);
      if (exists) return http.fail(c, 'Conflict', 409);

      const role = String(body.role ?? 'member');
      const safeRole = ['member', 'editor'].includes(role) ? role : 'member';

      await db.run('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)', [
        email,
        await ctx.passwords().hash(password),
        name,
        safeRole,
      ]);
      const id = await db.lastInsertId();
      await events.publish('user.registered', { id, email, role: safeRole });

      return http.ok(c, {
        ok: true,
        message: 'Аккаунт создан.',
        user: { id, email, name, role: safeRole },
      }, 201);
    };

    http.post('/auth/register', registerHandler);
    http.post('/registration/register', registerHandler);

    const verifyHandler = async (c: Context) => {
      let bodyToken = String(c.req.query('token') ?? '').trim();
      if (!bodyToken && c.req.method !== 'GET' && c.req.method !== 'HEAD') {
        const body = await readJsonBody(c, http.fail);
        if (body instanceof Response) return body;
        bodyToken = String(body.token ?? '').trim();
      }
      if (!bodyToken || bodyToken.length < 16) return http.fail(c, 'Некорректная ссылка', 400);
      const cols = await db.columns('users');
      if (!cols.includes('email_verify_token')) return http.fail(c, 'Email verification not configured', 400);
      const user = await db.one('SELECT * FROM users WHERE email_verify_token=? LIMIT 1', [bodyToken]);
      if (!user) return http.fail(c, 'Ссылка недействительна или уже использована', 400);
      const exp = String(user.email_verify_expires_at ?? '');
      if (exp && new Date(exp).getTime() < Date.now()) return http.fail(c, 'Срок действия ссылки истёк', 400);
      const sets = ['email_verified_at=?', 'email_verify_token=NULL', 'email_verify_expires_at=NULL'];
      const params: unknown[] = [nowSql()];
      if (cols.includes('updated_at')) {
        sets.push('updated_at=?');
        params.push(nowSql());
      }
      params.push(user.id);
      await db.run(`UPDATE users SET ${sets.join(', ')} WHERE id=?`, params);
      const fresh = await db.one('SELECT id, email, name, role FROM users WHERE id=?', [user.id]);
      return http.ok(c, {
        verified: true,
        message: 'Email подтверждён.',
        redirect: '/admin/login',
        user: fresh,
      });
    };

    http.get('/auth/verify-email', verifyHandler);
    http.post('/auth/verify-email', verifyHandler);

    http.post('/auth/resend-verification', async (c) => {
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const email = String(body.email ?? '').toLowerCase().trim();
      const cols = await db.columns('users');
      if (cols.includes('email_verify_token') && email) {
        const user = await db.one('SELECT * FROM users WHERE email=? LIMIT 1', [email]);
        if (user && !user.email_verified_at) {
          const token = crypto.randomBytes(32).toString('hex');
          const expires = new Date(Date.now() + 48 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
          await db.run('UPDATE users SET email_verify_token=?, email_verify_expires_at=? WHERE id=?', [
            token,
            expires,
            user.id,
          ]);
        }
      }
      return http.ok(c, {
        ok: true,
        message: 'Если аккаунт ждёт подтверждения — письмо отправлено.',
      });
    });
  
}
