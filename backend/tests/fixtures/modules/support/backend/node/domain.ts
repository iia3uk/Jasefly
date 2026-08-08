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
} from './sdk/helpers.js';

import crypto from 'node:crypto';

function getUserFromContext(c: Context): Record<string, unknown> | 'mcp' | null {
  try {
    const user = c.get('user') as Record<string, unknown> | 'mcp' | undefined;
    return user ?? null;
  } catch {
    return null;
  }
}

const PLUGIN = 'support';



function supportCodeFail(
  c: Context,
  error: string,
  status: 409 | 422 = 422,
  code: string | null = null,
) {
  // PHP SupportModule custom error envelope (no data/errors keys).
  return c.json(
    {
      success: false,
      error,
      code,
      meta: { api_version: 'v1' },
    },
    status,
  );
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-f0-9]/gi, '').slice(0, 64);
}

function sanitizeBody(body: string): string {
  return body.trim().slice(0, 4000);
}

function newPublicId(): string {
  return crypto.randomBytes(16).toString('hex');
}

function newVisitorKey(): string {
  return crypto.randomBytes(24).toString('hex');
}

async function listMessages(db: DbLike, ticketId: number, afterId = 0) {
  if (!(await db.tableExists('support_messages'))) return [];
  const cols = await db.columns('support_messages');
  const senderCol = cols.includes('sender') ? 'sender' : cols.includes('author') ? 'author AS sender' : "'visitor' AS sender";
  return db.all(
    `SELECT id, ticket_id, ${senderCol}, user_id, body, created_at
     FROM support_messages WHERE ticket_id=? AND id>? ORDER BY id ASC LIMIT 200`,
    [ticketId, afterId],
  );
}

async function insertMessage(
  db: DbLike,
  ticketId: number,
  sender: string,
  body: string,
  userId: number | null = null,
): Promise<Record<string, unknown>> {
  const cols = await db.columns('support_messages');
  if (cols.includes('sender')) {
    await db.run(
      'INSERT INTO support_messages (ticket_id, sender, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
      [ticketId, sender, userId, body, nowSql()],
    );
  } else if (cols.includes('author')) {
    await db.run(
      'INSERT INTO support_messages (ticket_id, author, body, created_at) VALUES (?, ?, ?, ?)',
      [ticketId, sender, body, nowSql()],
    );
  } else {
    await db.run('INSERT INTO support_messages (ticket_id, body, created_at) VALUES (?, ?, ?)', [
      ticketId,
      body,
      nowSql(),
    ]);
  }
  const id = await db.lastInsertId();
  return (await db.one('SELECT * FROM support_messages WHERE id=?', [id])) ?? { id, ticket_id: ticketId, sender, body };
}

async function getTicketByPublicId(db: DbLike, publicIdParam: string, visitorKey: string) {
  const key = sanitizeKey(visitorKey);
  if (!key) return null;
  return db.one('SELECT * FROM support_tickets WHERE public_id=? AND visitor_key=? LIMIT 1', [publicIdParam, key]);
}

async function hasContact(ticket: Record<string, unknown>): Promise<boolean> {
  const email = String(ticket.contact_email ?? '').trim();
  const social = String(ticket.contact_social ?? '').trim();
  return email !== '' || social !== '';
}

async function supportSettings(db: DbLike): Promise<Record<string, unknown>> {
  return loadModuleSettings(db, 'support');
}

async function hasOnlineAgents(db: DbLike): Promise<boolean> {
  if (!(await db.tableExists('support_agent_presence'))) return false;
  const cutoff = new Date(Date.now() - 90_000).toISOString().slice(0, 19).replace('T', ' ');
  const row = await db.one('SELECT COUNT(*) AS c FROM support_agent_presence WHERE last_seen_at >= ?', [cutoff]);
  return Number(row?.c ?? 0) > 0;
}

async function touchAgent(db: DbLike, userId: number): Promise<void> {
  if (!(await db.tableExists('support_agent_presence'))) return;
  const existing = await db.one('SELECT user_id FROM support_agent_presence WHERE user_id=?', [userId]);
  if (existing) {
    await db.run('UPDATE support_agent_presence SET last_seen_at=? WHERE user_id=?', [nowSql(), userId]);
  } else {
    await db.run('INSERT INTO support_agent_presence (user_id, last_seen_at) VALUES (?, ?)', [userId, nowSql()]);
  }
}

async function touchVisitor(db: DbLike, ticketId: number): Promise<void> {
  const cols = await db.columns('support_tickets');
  if (cols.includes('last_visitor_seen_at')) {
    await db.run('UPDATE support_tickets SET last_visitor_seen_at=? WHERE id=?', [nowSql(), ticketId]);
  }
  await db.run('UPDATE support_tickets SET updated_at=? WHERE id=?', [nowSql(), ticketId]);
}

async function publicConfig(db: DbLike) {
  const settings = await supportSettings(db);
  const social = String(settings.social_types ?? 'telegram,vk,whatsapp,max');
  const types = social.split(',').map((s) => s.trim()).filter(Boolean);
  let faq: unknown[] = [];
  if (await db.tableExists('support_faq')) {
    faq = await db.all(
      'SELECT id, question FROM support_faq WHERE is_active=1 ORDER BY sort_order ASC, id ASC LIMIT 20',
    );
  }
  return {
    widget_enabled: settings.widget_enabled !== false,
    position: String(settings.position ?? 'bottom-left'),
    title: String(settings.widget_title ?? 'Поддержка'),
    greeting: String(settings.greeting ?? 'Здравствуйте! Чем можем помочь?'),
    require_contact_on_leave: settings.require_contact_on_leave !== false,
    social_types: types.length ? types : ['telegram', 'vk'],
    agents_online: await hasOnlineAgents(db),
    poll_interval_ms: Math.max(2500, Math.min(8000, Number(settings.poll_interval_ms ?? 3500))),
    faq,
  };
}

export async function register(ctx: PlatformContext) {
  const http = ctx.http();
  const db = ctx.database();
  const events = ctx.events();
  const authMw = http.auth();
  const agentPerm = http.permissionAny(['support.agent', 'support.manage']);
  const managePerm = http.permission('support.manage');
  const agent = [authMw, agentPerm];
  const manage = [authMw, managePerm];
  const crud = ctx.adminResources();
  void crud;


    http.get('/support/config', async (c) => http.ok(c, await publicConfig(db)));

    http.get('/support/faq', async (c) => {
      if (!(await db.tableExists('support_faq'))) return http.fail(c, 'capability_unavailable', 409);
      const rows = await db.all(
        'SELECT id, question FROM support_faq WHERE is_active=1 ORDER BY sort_order ASC, id ASC LIMIT 20',
      );
      const items = rows
        .map((r) => ({ id: Number(r.id), question: String(r.question ?? '').trim() }))
        .filter((r) => r.question !== '');
      return http.ok(c, items);
    });

    http.post('/support/session', async (c) => {
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const existing = sanitizeKey(String(body.visitor_key ?? ''));
      const key = existing.length >= 32 ? existing : newVisitorKey();
      return http.ok(c, { visitor_key: key }, 201);
    });

    http.post('/support/faq/:id/ask', async (c) => {
      if (!(await db.tableExists('support_faq'))) return http.fail(c, 'capability_unavailable', 409);
      if (!(await db.tableExists('support_tickets'))) return http.fail(c, 'capability_unavailable', 409);

      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;

      const visitorKey = sanitizeKey(String(body.visitor_key ?? ''));
      const faqId = Number(c.req.param('id'));
      if (!visitorKey || faqId <= 0) return supportCodeFail(c, 'Некорректный запрос', 422, null);

      const faq = await db.one(
        'SELECT id, question, answer FROM support_faq WHERE id=? AND is_active=1 LIMIT 1',
        [faqId],
      );
      if (!faq) return supportCodeFail(c, 'Вопрос не найден', 422, null);

      const question = String(faq.question ?? '').trim();
      const answer = String(faq.answer ?? '').trim();
      if (!question || !answer) return supportCodeFail(c, 'Пустой FAQ', 422, null);

      let ticket = await db.one(
        "SELECT * FROM support_tickets WHERE visitor_key=? AND status <> 'closed' ORDER BY id DESC LIMIT 1",
        [visitorKey],
      );

      if (ticket && ticket.status === 'awaiting_contact' && !(await hasContact(ticket))) {
        return supportCodeFail(c, 'Нужен контакт (email или соцсеть)', 409, 'contact_required');
      }

      if (ticket) {
        await insertMessage(db, Number(ticket.id), 'visitor', question);
        await insertMessage(db, Number(ticket.id), 'bot', answer);
        await db.run("UPDATE support_tickets SET status='bot', updated_at=? WHERE id=?", [nowSql(), ticket.id]);
      } else {
        const pid = newPublicId();
        await db.run(
          'INSERT INTO support_tickets (public_id, status, visitor_key, page_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [pid, 'bot', visitorKey, body.page_url ?? null, nowSql(), nowSql()],
        );
        const ticketId = await db.lastInsertId();
        await insertMessage(db, ticketId, 'visitor', question);
        await insertMessage(db, ticketId, 'bot', answer);
        ticket = await db.one('SELECT * FROM support_tickets WHERE id=?', [ticketId]);
      }

      const messages = await listMessages(db, Number(ticket!.id), 0);
      return http.ok(c, { ticket, messages }, 201);
    });

    http.get('/support/active', async (c) => {
      const key = sanitizeKey(c.req.query('visitor_key') || '');
      if (!(await db.tableExists('support_tickets')) || !key) {
        return http.ok(c, null);
      }

      const ticket = await db.one(
        "SELECT * FROM support_tickets WHERE visitor_key=? AND status <> 'closed' ORDER BY updated_at DESC, id DESC LIMIT 1",
        [key],
      );
      if (!ticket) return http.ok(c, null);

      const messages = await listMessages(db, Number(ticket.id), 0);
      return http.ok(c, { ticket, messages, agents_online: await hasOnlineAgents(db) });
    });

    http.post('/support/tickets', async (c) => {
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;

      const visitorKey = sanitizeKey(String(body.visitor_key ?? ''));
      const message = sanitizeBody(String(body.body ?? body.message ?? ''));
      // PHP createTicket: empty key OR empty body → «Пустое сообщение»
      if (!visitorKey || !message) return http.fail(c, 'Пустое сообщение', 422);

      if (!(await db.tableExists('support_tickets'))) return http.fail(c, 'capability_unavailable', 409);

      const existing = await db.one(
        "SELECT * FROM support_tickets WHERE visitor_key=? AND status <> 'closed' ORDER BY updated_at DESC, id DESC LIMIT 1",
        [visitorKey],
      );
      if (existing) {
        await insertMessage(db, Number(existing.id), 'visitor', message);
        await touchVisitor(db, Number(existing.id));
        const messages = await listMessages(db, Number(existing.id), 0);
        return http.ok(c, { ticket: existing, messages }, 201);
      }

      const pid = newPublicId();
      const agentsOnline = await hasOnlineAgents(db);
      const status = agentsOnline ? 'waiting_agent' : 'bot';
      await db.run(
        'INSERT INTO support_tickets (public_id, visitor_key, status, page_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [pid, visitorKey, status, body.page_url ?? null, nowSql(), nowSql()],
      );

      const ticketId = await db.lastInsertId();
      await insertMessage(db, ticketId, 'visitor', message);
      if (!agentsOnline) {
        await insertMessage(
          db,
          ticketId,
          'bot',
          'Спасибо за сообщение! Оператор ответит, когда будет онлайн.',
          null,
        );
      }
      const ticket = await db.one('SELECT * FROM support_tickets WHERE id=?', [ticketId]);
      const messages = await listMessages(db, ticketId, 0);
      return http.ok(c, { ticket, messages }, 201);
    });

    http.get('/support/tickets/:publicId', async (c) => {
      if (!(await db.tableExists('support_tickets'))) return http.fail(c, 'Not found', 404);
      const key = sanitizeKey(c.req.query('visitor_key') || '');
      const ticket = await getTicketByPublicId(db, c.req.param('publicId'), key);
      if (!ticket) return http.fail(c, 'Not found', 404);
      return http.ok(c, ticket);
    });

    http.get('/support/tickets/:publicId/messages', async (c) => {
      if (!(await db.tableExists('support_tickets'))) return http.fail(c, 'Not found', 404);

      const key = sanitizeKey(c.req.query('visitor_key') || '');
      const publicIdParam = c.req.param('publicId');
      const afterId = Number(c.req.query('after_id') ?? 0);

      const ticket = await getTicketByPublicId(db, publicIdParam, key);
      if (!ticket) return http.fail(c, 'Not found', 404);
      await touchVisitor(db, Number(ticket.id));
      const messages = await listMessages(db, Number(ticket.id), afterId);
      return http.ok(c, { ticket, messages, agents_online: await hasOnlineAgents(db) });
    });

    http.post('/support/tickets/:publicId/messages', async (c) => {
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;

      if (!(await db.tableExists('support_messages'))) return http.fail(c, 'capability_unavailable', 409);

      const publicIdParam = c.req.param('publicId');
      const key = sanitizeKey(String(body.visitor_key ?? ''));
      const text = sanitizeBody(String(body.body ?? body.message ?? ''));

      const ticket = await getTicketByPublicId(db, publicIdParam, key);
      if (!ticket) return supportCodeFail(c, 'Тикет не найден', 422, null);
      if (ticket.status === 'closed') {
        return supportCodeFail(c, 'Тикет закрыт', 422, 'ticket_closed');
      }
      if (ticket.status === 'awaiting_contact' && !(await hasContact(ticket))) {
        return supportCodeFail(c, 'Нужен контакт (email или соцсеть)', 409, 'contact_required');
      }
      if (!text) return supportCodeFail(c, 'Пустое сообщение', 422, null);

      const ticketId = Number(ticket.id);
      const message = await insertMessage(db, ticketId, 'visitor', text);
      const agentsOnline = await hasOnlineAgents(db);
      let botMessage: Record<string, unknown> | null = null;
      if (agentsOnline) {
        await db.run("UPDATE support_tickets SET status='waiting_agent', updated_at=? WHERE id=?", [
          nowSql(),
          ticketId,
        ]);
      } else {
        await db.run("UPDATE support_tickets SET status='bot', updated_at=? WHERE id=?", [nowSql(), ticketId]);
        botMessage = await insertMessage(
          db,
          ticketId,
          'bot',
          'Сообщение получено. Оператор ответит, когда будет онлайн.',
        );
      }
      await touchVisitor(db, ticketId);
      const updated = await db.one('SELECT * FROM support_tickets WHERE id=?', [ticketId]);
      return http.ok(c, { message, bot_message: botMessage, ticket: updated }, 201);
    });

    http.post('/support/tickets/:publicId/contact', async (c) => {
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;

      const publicIdParam = c.req.param('publicId');
      const key = sanitizeKey(String(body.visitor_key ?? ''));
      const email = body.email != null ? String(body.email).trim().toLowerCase() : '';
      const social = String(body.social ?? body.contact_social ?? '').trim();
      const socialType = String(body.social_type ?? body.contact_social_type ?? '').trim();

      const ticket = await getTicketByPublicId(db, publicIdParam, key);
      if (!ticket) return http.fail(c, 'Тикет не найден', 422);

      if (!email && !social) return http.fail(c, 'Укажите email или соцсеть', 422);

      const newStatus =
        ticket.status === 'closed' ? 'closed' : (await hasOnlineAgents(db)) ? 'waiting_agent' : 'bot';
      await db.run(
        'UPDATE support_tickets SET contact_email=?, contact_social=?, contact_social_type=?, status=?, updated_at=? WHERE id=?',
        [
          email || null,
          social ? social.slice(0, 255) : null,
          socialType ? socialType.slice(0, 40) : null,
          newStatus,
          nowSql(),
          ticket.id,
        ],
      );
      await insertMessage(db, Number(ticket.id), 'system', 'Контакт сохранён', null);
      const updated = await db.one('SELECT * FROM support_tickets WHERE id=?', [ticket.id]);
      return http.ok(c, updated);
    });

    http.post('/support/heartbeat', async (c) => {
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;

      const publicIdParam = String(body.public_id ?? '');
      const key = sanitizeKey(String(body.visitor_key ?? ''));
      const leaving = Boolean(body.leaving);
      if (!publicIdParam || !key) return http.fail(c, 'public_id and visitor_key required', 422);

      const ticket = await getTicketByPublicId(db, publicIdParam, key);
      if (!ticket) return http.fail(c, 'Not found', 404);

      const settings = await supportSettings(db);
      if (leaving && settings.require_contact_on_leave !== false && !(await hasContact(ticket))) {
        await db.run("UPDATE support_tickets SET status='awaiting_contact', updated_at=? WHERE id=?", [
          nowSql(),
          ticket.id,
        ]);
      } else {
        await touchVisitor(db, Number(ticket.id));
      }
      const updated = await db.one('SELECT * FROM support_tickets WHERE id=?', [ticket.id]);
      return http.ok(c, updated);
    });

    http.post('/admin/support/presence', ...agent, async (c) => {
      const user = getUserFromContext(c);
      if (!user || user === 'mcp') return http.fail(c, 'Unauthorized', 401);
      await touchAgent(db, Number(user.id));
      return http.ok(c, { ok: true, agents_online: await hasOnlineAgents(db) });
    });

    http.post('/admin/support/test-telegram', ...manage, async (c) => {
      const settings = await supportSettings(db);
      const token = String(settings.telegram_bot_token ?? settings.telegram_token ?? '').trim();
      const chatId = String(settings.telegram_chat_id ?? '').trim();
      if (!token || !chatId) {
        return http.fail(
          c,
          'Telegram не настроен: укажите telegram_bot_token и telegram_chat_id в настройках support',
          422,
        );
      }
      return http.ok(c, {
        ok: true,
        configured: true,
        message: 'Telegram credentials present (live send requires outbound network on VPS runtime)',
        telegram_bot_token_set: Boolean(token),
        telegram_chat_id: chatId,
      });
    });

    http.get('/admin/support/tickets', ...agent, async (c) => {
      const blocked = await ctx.plugins().softGate(c, 'GET', false);
      if (blocked) return blocked;
      // Design B: missing tables → empty list (not 409 spam)
      if (!(await db.tableExists('support_tickets'))) return http.ok(c, { items: [], total: 0 });
      const status = c.req.query('status');
      let items;
      if (status && status !== 'all') {
        items = await db.all(
          'SELECT * FROM support_tickets WHERE status=? ORDER BY updated_at DESC, id DESC LIMIT 100',
          [status],
        );
      } else {
        items = await db.all('SELECT * FROM support_tickets ORDER BY updated_at DESC, id DESC LIMIT 100');
      }
      return http.ok(c, { items, total: items.length });
    });

    http.get('/admin/support/tickets/:id', ...agent, async (c) => {
      const blocked = await ctx.plugins().softGate(c, 'GET', true);
      if (blocked) return blocked;
      if (!(await db.tableExists('support_tickets'))) return http.fail(c, 'Not found', 404);
      const ticket = await db.one('SELECT * FROM support_tickets WHERE id=? LIMIT 1', [c.req.param('id')]);
      if (!ticket) return http.fail(c, 'Not found', 404);
      const messages = await listMessages(db, Number(ticket.id), 0);
      return http.ok(c, { ticket, messages });
    });

    http.post('/admin/support/tickets/:id/messages', ...agent, async (c) => {
      const blocked = await ctx.plugins().softGate(c, 'POST', true);
      if (blocked) return blocked;
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;

      const ticketId = Number(c.req.param('id'));
      const ticket = await db.one('SELECT * FROM support_tickets WHERE id=?', [ticketId]);
      if (!ticket) return http.fail(c, 'Not found', 404);

      const user = getUserFromContext(c);
      const userId = user && user !== 'mcp' ? Number(user.id) : null;
      const text = sanitizeBody(String(body.body ?? body.message ?? ''));
      if (!text) return http.fail(c, 'Validation failed', 422, { body: 'Пустое сообщение' });

      const message = await insertMessage(db, ticketId, 'agent', text, userId);
      if (ticket.status !== 'closed') {
        await db.run(
          "UPDATE support_tickets SET status='open', assigned_user_id=COALESCE(assigned_user_id, ?), updated_at=? WHERE id=?",
          [userId, nowSql(), ticketId],
        );
      }
      return http.ok(c, message, 201);
    });

    http.post('/admin/support/tickets/:id/assign', ...agent, async (c) => {
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const ticketId = Number(c.req.param('id'));
      const user = getUserFromContext(c);
      const uid = Number(body.user_id ?? (user && user !== 'mcp' ? user.id : 0));
      if (!uid) return http.fail(c, 'Validation failed', 422);
      await db.run('UPDATE support_tickets SET assigned_user_id=?, updated_at=? WHERE id=?', [
        uid,
        nowSql(),
        ticketId,
      ]);
      const ticket = await db.one('SELECT * FROM support_tickets WHERE id=?', [ticketId]);
      if (!ticket) return http.fail(c, 'Not found', 404);
      return http.ok(c, ticket);
    });

    http.post('/admin/support/tickets/:id/close', ...agent, async (c) => {
      const ticketId = Number(c.req.param('id'));
      const ticket = await db.one('SELECT * FROM support_tickets WHERE id=?', [ticketId]);
      if (!ticket) return http.fail(c, 'Not found', 404);
      await db.run("UPDATE support_tickets SET status='closed', updated_at=? WHERE id=?", [nowSql(), ticketId]);
      await insertMessage(db, ticketId, 'system', 'Тикет закрыт', null);
      const updated = await db.one('SELECT * FROM support_tickets WHERE id=?', [ticketId]);
      return http.ok(c, updated);
    });

    http.get('/admin/support/faq', ...manage, async (c) => {
      if (!(await db.tableExists('support_faq'))) return http.ok(c, []);
      return http.ok(c, await db.all('SELECT * FROM support_faq ORDER BY sort_order ASC, id ASC'));
    });

    http.post('/admin/support/faq', ...manage, async (c) => {
      if (!(await db.tableExists('support_faq'))) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const question = String(body.question ?? '').trim();
      const answer = String(body.answer ?? '').trim();
      if (!question || !answer) return http.fail(c, 'Вопрос и ответ обязательны', 422);
      await db.run(
        'INSERT INTO support_faq (question, answer, keywords, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
        [question, answer, String(body.keywords ?? ''), Number(body.sort_order ?? 0), nowSql(), nowSql()],
      );
      const id = await db.lastInsertId();
      const item = await db.one('SELECT * FROM support_faq WHERE id=?', [id]);
      return http.ok(c, item, 201);
    });

    http.put('/admin/support/faq/:id', ...manage, async (c) => {
      if (!(await db.tableExists('support_faq'))) return http.fail(c, 'Not found', 404);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const id = Number(c.req.param('id'));
      const existing = await db.one('SELECT id FROM support_faq WHERE id=?', [id]);
      if (!existing) return http.fail(c, 'Not found', 404);

      const sets: string[] = [];
      const params: unknown[] = [];
      for (const field of ['question', 'answer', 'keywords'] as const) {
        if (body[field] !== undefined) {
          sets.push(`${field}=?`);
          params.push(String(body[field]).trim());
        }
      }
      if (body.sort_order !== undefined) {
        sets.push('sort_order=?');
        params.push(Number(body.sort_order));
      }
      if (body.is_active !== undefined) {
        sets.push('is_active=?');
        params.push(body.is_active ? 1 : 0);
      }
      if (!sets.length) return http.fail(c, 'Нет полей', 422);
      sets.push('updated_at=?');
      params.push(nowSql(), id);
      await db.run(`UPDATE support_faq SET ${sets.join(', ')} WHERE id=?`, params);
      return http.ok(c, { message: 'OK' });
    });

    http.delete('/admin/support/faq/:id', ...manage, async (c) => {
      if (!(await db.tableExists('support_faq'))) return http.fail(c, 'Not found', 404);
      await db.run('DELETE FROM support_faq WHERE id=?', [c.req.param('id')]);
      return http.ok(c, { message: 'Deleted' });
    });
  
}
