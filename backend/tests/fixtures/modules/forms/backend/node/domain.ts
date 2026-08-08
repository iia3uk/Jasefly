import type { Context } from 'hono';
import type { PlatformContext } from './sdk/platform-types.js';
import type { DbLike } from './sdk/helpers.js';
import {
  nowSql,
  publicId,
  notDeletedClause,
  readJsonBody,
  loadModuleSettings,
  saveModuleSettings,
  okListOrEmpty,
} from './sdk/helpers.js';

import crypto from 'node:crypto';


type FormFieldDef = {
  name: string;
  required?: boolean;
  type?: string;
};

const ipRate = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;

function parseJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isEmpty(val: unknown): boolean {
  return val === null || val === undefined || val === '' || val === false || (Array.isArray(val) && val.length === 0);
}

function checkRate(ip: string): boolean {
  const now = Date.now();
  const entry = ipRate.get(ip);
  if (!entry || now >= entry.resetAt) {
    ipRate.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count += 1;
  return true;
}

function fieldDefsFromJson(raw: unknown): FormFieldDef[] {
  if (!Array.isArray(raw)) return [];
  const out: FormFieldDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? '').trim();
    if (!name) continue;
    out.push({
      name,
      required: Boolean(row.required),
      type: String(row.type ?? 'text'),
    });
  }
  return out;
}

async function resolveFormFields(db: DbLike, form: Row): Promise<FormFieldDef[]> {
  if (await db.tableExists('form_fields')) {
    const rows = await db.all(
      'SELECT name, required, type FROM form_fields WHERE form_id=? ORDER BY sort_order, id',
      [form.id],
    );
    if (rows.length > 0) {
      return rows.map((f) => ({
        name: String(f.name),
        required: Number(f.required ?? 0) === 1,
        type: String(f.type ?? 'text'),
      }));
    }
  }

  for (const col of ['fields_json', 'schema_json']) {
    if (form[col] != null) {
      const parsed = parseJson(form[col]);
      const defs = fieldDefsFromJson(parsed);
      if (defs.length > 0) return defs;
      const obj = parsed as Record<string, unknown> | null;
      if (obj && Array.isArray(obj.fields)) return fieldDefsFromJson(obj.fields);
    }
  }

  const settings = parseJson(form.settings) as Record<string, unknown> | null;
  if (settings && Array.isArray(settings.fields)) {
    return fieldDefsFromJson(settings.fields);
  }

  return [];
}

function validateValues(
  fields: FormFieldDef[],
  values: Record<string, unknown>,
): { ok: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const type = field.type ?? 'text';
    if (['heading', 'paragraph'].includes(type)) continue;
    if (!field.required) continue;
    const val = values[field.name];
    if (isEmpty(val)) errors[field.name] = 'Обязательное поле';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

function publicId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 26);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'form';
}

async function getFormById(db: DbLike, id: string | number): Promise<Row | null> {
  if (!(await db.tableExists('forms'))) return null;
  const cols = await db.columns('forms');
  const deleted = cols.includes('deleted_at') ? ' AND deleted_at IS NULL' : '';
  const form = await db.one(`SELECT * FROM forms WHERE id=?${deleted} LIMIT 1`, [id]);
  if (!form) return null;
  form.fields = await resolveFormFields(db, form);
  return form;
}

async function syncFormFields(db: DbLike, formId: number, fields: unknown): Promise<void> {
  if (!(await db.tableExists('form_fields')) || !Array.isArray(fields)) return;
  await db.run('DELETE FROM form_fields WHERE form_id=?', [formId]);
  let order = 0;
  for (const f of fields) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
    const row = f as Record<string, unknown>;
    const name = String(row.name ?? '').trim();
    if (!name) continue;
    order += 10;
    const cols = await db.columns('form_fields');
    const data: Record<string, unknown> = {
      form_id: formId,
      name,
      label: String(row.label ?? name),
      type: String(row.type ?? 'text'),
      required: row.required ? 1 : 0,
      sort_order: Number(row.sort_order ?? order),
    };
    if (cols.includes('placeholder')) data.placeholder = row.placeholder ?? null;
    if (cols.includes('help_text')) data.help_text = row.help_text ?? null;
    if (cols.includes('default_value')) data.default_value = row.default_value ?? null;
    if (cols.includes('options')) data.options = JSON.stringify(row.options ?? null);
    if (cols.includes('width')) data.width = String(row.width ?? 'full');
    if (cols.includes('visibility')) data.visibility = JSON.stringify(row.visibility ?? null);
    const keys = Object.keys(data);
    await db.run(
      `INSERT INTO form_fields (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
      keys.map((k) => data[k]),
    );
  }
}

function csvEscape(val: unknown): string {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function register(ctx: PlatformContext) {
  const http = ctx.http();
  const db = ctx.database();
  const events = ctx.events();
  const admin = http.admin();
  const crud = ctx.adminResources();
  void admin;
  void crud;


    http.get('/forms/:slug', async (c) => {
      if (!(await db.tableExists('forms'))) return http.fail(c, 'Not found', 404);
      const cols = await db.columns('forms');
      const deleted = cols.includes('deleted_at') ? ' AND deleted_at IS NULL' : '';
      const form = await db.one(`SELECT * FROM forms WHERE slug=?${deleted} LIMIT 1`, [
        c.req.param('slug'),
      ]);
      if (!form || String(form.status ?? 'active') !== 'active') return http.fail(c, 'Not found', 404);
      const fields = await resolveFormFields(db, form);
      return http.ok(c, {
        id: form.id,
        name: form.name,
        slug: form.slug,
        description: form.description,
        success_message: form.success_message,
        submit_button_text: form.submit_button_text,
        fields: fields.map((f) => ({
          name: f.name,
          type: f.type,
          required: Boolean(f.required),
        })),
        settings: { honeypot: true },
      });
    });

    http.post('/forms/:slug/submit', async (c) => {
      const formsBareFail = (error: string, status: 404 | 422 | 429, errors: Record<string, string> | unknown[] = []) =>
        // PHP FormsModule submit errors omit data (bare success/error/errors/meta).
        c.json({ success: false, error, errors, meta: { api_version: 'v1' } }, status);

      if (!(await db.tableExists('forms'))) return formsBareFail('Form not found', 404);
      const formCols = await db.columns('forms');
      const deletedClause = formCols.includes('deleted_at') ? ' AND deleted_at IS NULL' : '';
      const form = await db.one(
        `SELECT * FROM forms WHERE slug=?${deletedClause} AND status='active' LIMIT 1`,
        [c.req.param('slug')],
      );
      if (!form) return formsBareFail('Form not found', 404);

      const ip =
        c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
        c.req.header('x-real-ip') ||
        'unknown';
      if (!checkRate(ip)) return formsBareFail('Too many requests', 429);

      let payload: Record<string, unknown> = {};
      try {
        payload = (await c.req.json()) as Record<string, unknown>;
      } catch {
        return formsBareFail('Validation failed', 422);
      }

      const values =
        payload.values && typeof payload.values === 'object' && !Array.isArray(payload.values)
          ? (payload.values as Record<string, unknown>)
          : payload;

      const fields = await resolveFormFields(db, form);
      if (fields.length > 0) {
        const validation = validateValues(fields, values);
        if (!validation.ok) {
          return formsBareFail('Validation failed', 422, validation.errors);
        }
      } else if (Object.keys(values).length === 0) {
        return formsBareFail('Validation failed', 422, { _form: 'Пустая заявка' });
      }

      if (!(await db.tableExists('form_submissions'))) {
        return http.fail(c, 'capability_unavailable', 409);
      }

      const pub = publicId();
      const cols = await db.columns('form_submissions');
      try {
        if (cols.includes('public_id') && cols.includes('payload')) {
          await db.run(
            'INSERT INTO form_submissions (public_id, form_id, status, payload, created_at) VALUES (?, ?, ?, ?, ?)',
            [pub, form.id, 'new', JSON.stringify(values), nowSql()],
          );
        } else if (cols.includes('public_id')) {
          await db.run(
            'INSERT INTO form_submissions (public_id, form_id, status, created_at) VALUES (?, ?, ?, ?)',
            [pub, form.id, 'new', nowSql()],
          );
        } else if (cols.includes('payload')) {
          await db.run('INSERT INTO form_submissions (form_id, payload, created_at) VALUES (?, ?, ?)', [
            form.id,
            JSON.stringify(values),
            nowSql(),
          ]);
        } else {
          await db.run('INSERT INTO form_submissions (form_id, status, created_at) VALUES (?, ?, ?)', [
            form.id,
            'new',
            nowSql(),
          ]);
        }
      } catch (err) {
        console.error('[forms] submission insert failed:', err);
        return http.fail(c, 'Internal server error', 500);
      }

      const submissionId = await db.lastInsertId();
      await events.publish('form.submitted', {
        form_id: form.id,
        form_slug: form.slug,
        submission_id: submissionId,
        public_id: pub,
        values,
      });

      return http.ok(
        c,
        {
          success: true,
          public_id: pub,
          message: form.success_message || 'Спасибо!',
        },
        201,
      );
    });

    http.get('/admin/forms', admin, async (c) => {
      return okListOrEmpty(c, db, 'forms', async () => {
        const formCols = await db.columns('forms');
        const deleted = formCols.includes('deleted_at') ? ' WHERE f.deleted_at IS NULL' : '';
        if (await db.tableExists('form_submissions')) {
          const subCols = await db.columns('form_submissions');
          const subDel = subCols.includes('deleted_at') ? ' AND s.deleted_at IS NULL' : '';
          return db.all(
            `SELECT f.*, (SELECT COUNT(*) FROM form_submissions s WHERE s.form_id=f.id${subDel}) AS submissions_count
             FROM forms f${deleted} ORDER BY f.id DESC`,
          );
        }
        const plainDeleted = formCols.includes('deleted_at') ? ' WHERE deleted_at IS NULL' : '';
        return db.all(`SELECT * FROM forms${plainDeleted} ORDER BY id DESC`);
      }, http.ok);
    });

    http.post('/admin/forms', admin, async (c) => {
      if (!(await db.tableExists('forms'))) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const name = String(body.name ?? 'Форма').trim();
      let slug = String(body.slug ?? '').trim();
      if (!slug) slug = slugify(name);
      const status = ['draft', 'active', 'disabled', 'archived'].includes(String(body.status ?? ''))
        ? String(body.status)
        : 'draft';
      const cols = await db.columns('forms');
      const data: Record<string, unknown> = {
        name,
        slug,
        description: body.description ?? null,
        status,
        success_message: body.success_message ?? 'Спасибо!',
        submit_button_text: body.submit_button_text ?? 'Отправить',
      };
      if (cols.includes('redirect_url')) data.redirect_url = body.redirect_url ?? null;
      if (cols.includes('settings')) data.settings = JSON.stringify(body.settings ?? { honeypot: true });
      if (cols.includes('created_at')) data.created_at = nowSql();
      const keys = Object.keys(data);
      await db.run(
        `INSERT INTO forms (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((k) => data[k]),
      );
      const id = await db.lastInsertId();
      await syncFormFields(db, id, body.fields);
      await events.publish('form.created', { form_id: id });
      const form = await getFormById(db, id);
      return http.ok(c, form, 201);
    });

    http.get('/admin/forms/:id', admin, async (c) => {
      const form = await getFormById(db, c.req.param('id'));
      if (!form) return http.fail(c, 'Not found', 404);
      return http.ok(c, form);
    });

    http.put('/admin/forms/:id', admin, async (c) => {
      const id = c.req.param('id');
      const form = await getFormById(db, id);
      if (!form) return http.fail(c, 'Not found', 404);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const status = ['draft', 'active', 'disabled', 'archived'].includes(String(body.status ?? form.status))
        ? String(body.status ?? form.status)
        : String(form.status);
      const cols = await db.columns('forms');
      const sets = ['name=?', 'slug=?', 'description=?', 'status=?', 'success_message=?', 'submit_button_text=?'];
      const params: unknown[] = [
        String(body.name ?? form.name).trim(),
        String(body.slug ?? form.slug).trim(),
        body.description ?? form.description,
        status,
        body.success_message ?? form.success_message,
        body.submit_button_text ?? form.submit_button_text,
      ];
      if (cols.includes('redirect_url')) {
        sets.push('redirect_url=?');
        params.push(body.redirect_url ?? form.redirect_url ?? null);
      }
      if (cols.includes('settings')) {
        sets.push('settings=?');
        params.push(JSON.stringify(body.settings ?? parseJson(form.settings) ?? { honeypot: true }));
      }
      params.push(id);
      await db.run(`UPDATE forms SET ${sets.join(', ')} WHERE id=?`, params);
      if (body.fields !== undefined) await syncFormFields(db, Number(id), body.fields);
      await events.publish('form.updated', { form_id: Number(id) });
      return http.ok(c, await getFormById(db, id));
    });

    http.delete('/admin/forms/:id', admin, async (c) => {
      if (!(await db.tableExists('forms'))) return http.fail(c, 'Not found', 404);
      const id = c.req.param('id');
      const cols = await db.columns('forms');
      if (cols.includes('deleted_at')) {
        await db.run("UPDATE forms SET deleted_at=?, status='archived' WHERE id=?", [nowSql(), id]);
      } else {
        await db.run('DELETE FROM forms WHERE id=?', [id]);
      }
      await events.publish('form.deleted', { form_id: Number(id) });
      return http.ok(c, { ok: true });
    });

    http.get('/admin/forms/:id/submissions', admin, async (c) => {
      if (!(await db.tableExists('form_submissions'))) return http.fail(c, 'capability_unavailable', 409);
      const formId = c.req.param('id');
      const status = String(c.req.query('status') ?? '');
      const cols = await db.columns('form_submissions');
      const deleted = cols.includes('deleted_at') ? ' AND deleted_at IS NULL' : '';
      let sql = `SELECT id, public_id, form_id, status, page_url, created_at, updated_at FROM form_submissions WHERE form_id=?${deleted}`;
      const params: unknown[] = [formId];
      if (status) {
        sql += ' AND status=?';
        params.push(status);
      }
      sql += ' ORDER BY id DESC LIMIT 200';
      const items = await db.all(sql, params);
      return http.ok(c, items);
    });

    http.get('/admin/forms/:id/export', admin, async (c) => {
      const form = await getFormById(db, c.req.param('id'));
      if (!form) return http.fail(c, 'Not found', 404);
      if (!(await db.tableExists('form_submissions'))) return http.fail(c, 'capability_unavailable', 409);
      const subs = await db.all(
        'SELECT * FROM form_submissions WHERE form_id=? ORDER BY id DESC LIMIT 5000',
        [form.id],
      );
      const fieldNames = ((form.fields as FormFieldDef[]) ?? []).map((f) => f.name);
      const headers = ['public_id', 'status', 'created_at', 'page_url', ...fieldNames];
      const lines = [headers.map(csvEscape).join(',')];
      for (const sub of subs) {
        const map: Record<string, string> = {};
        if (await db.tableExists('form_submission_values')) {
          const vals = await db.all(
            'SELECT field_name, value_text FROM form_submission_values WHERE submission_id=?',
            [sub.id],
          );
          for (const v of vals) map[String(v.field_name)] = String(v.value_text ?? '');
        } else if (typeof sub.payload === 'string') {
          const parsed = parseJson(sub.payload) as Record<string, unknown> | null;
          if (parsed) {
            for (const [k, v] of Object.entries(parsed)) map[k] = String(v ?? '');
          }
        }
        const row = [sub.public_id, sub.status, sub.created_at, sub.page_url ?? '', ...fieldNames.map((fn) => map[fn] ?? '')];
        lines.push(row.map(csvEscape).join(','));
      }
      const csv = '\uFEFF' + lines.join('\n');
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="form-${form.slug}-export.csv"`,
        },
      });
    });

    http.get('/admin/form-submissions', admin, async (c) => {
      return okListOrEmpty(c, db, 'form_submissions', async () => {
        const cols = await db.columns('form_submissions');
        const deleted = cols.includes('deleted_at') ? ' WHERE deleted_at IS NULL' : '';
        return db.all(`SELECT * FROM form_submissions${deleted} ORDER BY id DESC LIMIT 200`);
      }, http.ok);
    });

    http.get('/admin/form-submissions/:id', admin, async (c) => {
      if (!(await db.tableExists('form_submissions'))) return http.fail(c, 'Not found', 404);
      const cols = await db.columns('form_submissions');
      const deleted = cols.includes('deleted_at') ? ' AND deleted_at IS NULL' : '';
      const sub = await db.one(`SELECT * FROM form_submissions WHERE id=?${deleted} LIMIT 1`, [
        c.req.param('id'),
      ]);
      if (!sub) return http.fail(c, 'Not found', 404);

      if (await db.tableExists('form_submission_values')) {
        sub.values = await db.all(
          'SELECT * FROM form_submission_values WHERE submission_id=?',
          [sub.id],
        );
      } else if (typeof sub.payload === 'string') {
        sub.values = parseJson(sub.payload);
      }

      delete sub.ip_hash;
      delete sub.ua_hash;
      return http.ok(c, sub);
    });

    http.put('/admin/form-submissions/:id', admin, async (c) => {
      if (!(await db.tableExists('form_submissions'))) return http.fail(c, 'Not found', 404);
      const id = c.req.param('id');
      const cols = await db.columns('form_submissions');
      const deleted = cols.includes('deleted_at') ? ' AND deleted_at IS NULL' : '';
      const sub = await db.one(`SELECT * FROM form_submissions WHERE id=?${deleted} LIMIT 1`, [id]);
      if (!sub) return http.fail(c, 'Not found', 404);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const status = String(body.status ?? sub.status);
      if (!['new', 'in_progress', 'resolved', 'spam', 'archived'].includes(status)) {
        return http.fail(c, 'Invalid status', 422);
      }
      if (cols.includes('internal_note')) {
        await db.run('UPDATE form_submissions SET status=?, internal_note=COALESCE(?, internal_note) WHERE id=?', [
          status,
          body.internal_note ?? null,
          id,
        ]);
      } else {
        await db.run('UPDATE form_submissions SET status=? WHERE id=?', [status, id]);
      }
      if (status !== sub.status) {
        await events.publish('form.submission.status_changed', {
          submission_id: Number(id),
          public_id: sub.public_id,
          from: sub.status,
          to: status,
        });
      }
      return http.ok(c, { ok: true });
    });

    http.post('/admin/form-submissions/bulk-status', admin, async (c) => {
      if (!(await db.tableExists('form_submissions'))) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const ids = body.ids;
      const status = String(body.status ?? '');
      if (!Array.isArray(ids) || !['new', 'in_progress', 'resolved', 'spam', 'archived'].includes(status)) {
        return http.fail(c, 'Invalid payload', 422);
      }
      const cols = await db.columns('form_submissions');
      const deleted = cols.includes('deleted_at') ? ' AND deleted_at IS NULL' : '';
      for (const sid of ids) {
        await db.run(`UPDATE form_submissions SET status=? WHERE id=?${deleted}`, [status, Number(sid)]);
      }
      return http.ok(c, { ok: true, count: ids.length });
    });

    http.delete('/admin/form-submissions/:id', admin, async (c) => {
      if (!(await db.tableExists('form_submissions'))) return http.fail(c, 'Not found', 404);
      const id = c.req.param('id');
      const sub = await db.one('SELECT public_id FROM form_submissions WHERE id=?', [id]);
      const cols = await db.columns('form_submissions');
      if (cols.includes('deleted_at')) {
        await db.run("UPDATE form_submissions SET deleted_at=?, status='archived' WHERE id=?", [nowSql(), id]);
      } else {
        await db.run('DELETE FROM form_submissions WHERE id=?', [id]);
      }
      await events.publish('form.submission.deleted', {
        submission_id: Number(id),
        public_id: sub?.public_id ?? null,
      });
      return http.ok(c, { ok: true });
    });
  
}
