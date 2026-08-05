import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { hashPassword } from '../auth/password.js';
import { readJsonBody } from './_helpers.js';

export const name = 'users';

const SAFE_SELECT =
  'SELECT id, email, name, role, avatar_media_id, last_login_at, created_at FROM users';

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/users`, admin, async (c) => {
      return ok(c, await ctx.db.all(`${SAFE_SELECT} ORDER BY id`));
    });

    ctx.app.get(`${p}/admin/users/:id`, admin, async (c) => {
      const row = await ctx.db.one(`${SAFE_SELECT} WHERE id=?`, [c.req.param('id')]);
      if (!row) return fail(c, 'User not found', 404);
      return ok(c, row);
    });

    ctx.app.post(`${p}/admin/users`, admin, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const email = String(body.email ?? '').toLowerCase().trim();
      const password = String(body.password ?? '');
      if (!email || !password) return fail(c, 'Validation failed', 422);
      const exists = await ctx.db.one('SELECT id FROM users WHERE email=?', [email]);
      if (exists) return fail(c, 'Conflict', 409);
      await ctx.db.run('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)', [
        email,
        await hashPassword(password),
        String(body.name ?? ''),
        String(body.role ?? 'editor'),
      ]);
      const id = await ctx.db.lastInsertId();
      const row = await ctx.db.one(`${SAFE_SELECT} WHERE id=?`, [id]);
      await ctx.events.publish('resource.afterSave', { resource: 'users', table: 'users', id, op: 'create' });
      return ok(c, row);
    });

    ctx.app.put(`${p}/admin/users/:id`, admin, async (c) => {
      const id = c.req.param('id');
      const existing = await ctx.db.one('SELECT * FROM users WHERE id=?', [id]);
      if (!existing) return fail(c, 'Not found', 404);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;

      const sets: string[] = [];
      const params: unknown[] = [];
      if (body.name !== undefined) {
        sets.push('name=?');
        params.push(String(body.name));
      }
      if (body.role !== undefined) {
        sets.push('role=?');
        params.push(String(body.role));
      }
      if (body.email !== undefined) {
        const email = String(body.email).toLowerCase().trim();
        const dup = await ctx.db.one('SELECT id FROM users WHERE email=? AND id<>?', [email, id]);
        if (dup) return fail(c, 'Conflict', 409);
        sets.push('email=?');
        params.push(email);
      }
      if (body.password) {
        sets.push('password_hash=?');
        params.push(await hashPassword(String(body.password)));
      }
      if (!sets.length) return fail(c, 'Validation failed', 422);
      params.push(id);
      await ctx.db.run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, params);
      const row = await ctx.db.one(`${SAFE_SELECT} WHERE id=?`, [id]);
      await ctx.events.publish('resource.afterSave', { resource: 'users', table: 'users', id, op: 'update' });
      return ok(c, row);
    });

    ctx.app.delete(`${p}/admin/users/:id`, admin, async (c) => {
      const id = c.req.param('id');
      const existing = await ctx.db.one('SELECT id FROM users WHERE id=?', [id]);
      if (!existing) return fail(c, 'Not found', 404);
      await ctx.db.run('DELETE FROM users WHERE id=?', [id]);
      await ctx.events.publish('resource.afterDelete', { resource: 'users', table: 'users', id, mode: 'deleted' });
      return ok(c, { id: Number(id), deleted: true });
    });

    ctx.app.get(`${p}/admin/roles`, admin, async (c) => {
      if (await ctx.db.tableExists('roles')) {
        // Match PHP PermissionService::roles — include perm_count, order by role_rank.
        const hasRank = (await ctx.db.columns('roles')).includes('role_rank');
        const order = hasRank ? 'r.role_rank ASC, r.id ASC' : 'r.id';
        if (await ctx.db.tableExists('role_permissions')) {
          return ok(
            c,
            await ctx.db.all(
              `SELECT r.*, COUNT(rp.permission_id) AS perm_count FROM roles r
               LEFT JOIN role_permissions rp ON rp.role_id=r.id
               GROUP BY r.id ORDER BY ${order}`,
            ),
          );
        }
        return ok(c, await ctx.db.all(`SELECT * FROM roles ORDER BY ${hasRank ? 'role_rank ASC, id ASC' : 'id'}`));
      }
      return ok(c, [
        { slug: 'admin', name: 'Admin' },
        { slug: 'editor', name: 'Editor' },
        { slug: 'member', name: 'Member' },
      ]);
    });

    ctx.app.get(`${p}/admin/permissions`, admin, async (c) => {
      if (!(await ctx.db.tableExists('permissions'))) return ok(c, []);
      return ok(c, await ctx.db.all('SELECT * FROM permissions ORDER BY group_name, slug'));
    });

    ctx.app.get(`${p}/admin/roles/:id/permissions`, admin, async (c) => {
      if (!(await ctx.db.tableExists('permissions')) || !(await ctx.db.tableExists('role_permissions'))) {
        return ok(c, []);
      }
      const rows = await ctx.db.all(
        `SELECT p.slug, p.name, p.group_name FROM permissions p
         INNER JOIN role_permissions rp ON rp.permission_id = p.id
         WHERE rp.role_id = ? ORDER BY p.group_name, p.slug`,
        [c.req.param('id')],
      );
      return ok(c, rows);
    });

    ctx.app.put(`${p}/admin/roles/:id/permissions`, admin, async (c) => {
      if (!(await ctx.db.tableExists('roles'))) return fail(c, 'Role not found', 404);
      const roleId = c.req.param('id');
      const role = await ctx.db.one('SELECT * FROM roles WHERE id=?', [roleId]);
      if (!role) return fail(c, 'Role not found', 404);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const permissionSlugs = Array.isArray(body.permissions) ? body.permissions.map(String) : [];
      if (await ctx.db.tableExists('role_permissions')) {
        await ctx.db.run('DELETE FROM role_permissions WHERE role_id=?', [roleId]);
        if (permissionSlugs.length && (await ctx.db.tableExists('permissions'))) {
          for (const slug of permissionSlugs) {
            const perm = await ctx.db.one('SELECT id FROM permissions WHERE slug=?', [slug]);
            if (perm) {
              await ctx.db.run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [
                roleId,
                perm.id,
              ]);
            }
          }
        }
      }
      return ok(c, { message: 'Role permissions updated' });
    });
  }
}
