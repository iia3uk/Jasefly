import type { Context } from 'hono';
import crypto from 'node:crypto';
import type { ModuleContext } from '../core/types.js';
import { fail, ok } from '../http/envelope.js';
import { hashPassword } from '../auth/password.js';
import { moduleSettings, nowSql, readJsonBody } from './_helpers.js';

export const name = 'registration';

export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/registration/config`, async (c) => {
      const settings = await moduleSettings(ctx.db, 'registration');
      const enabled = Boolean(settings.registration_enabled);
      return ok(c, {
        registration_enabled: enabled,
        default_role: String(settings.default_role ?? 'member'),
        require_name: settings.require_name !== false,
        min_password_length: Number(settings.min_password_length ?? 8),
        require_password_confirm: settings.require_password_confirm !== false,
        show_login_link: settings.show_login_link !== false,
        login_path: String(settings.login_path ?? '/admin/login'),
        require_email_verification: Boolean(settings.require_email_verification),
        closed_message: String(settings.closed_message ?? 'Регистрация временно закрыта.'),
        success_message: String(settings.success_message ?? 'Аккаунт создан.'),
      });
    });

    const registerHandler = async (c: Context) => {
      const settings = await moduleSettings(ctx.db, 'registration');
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
