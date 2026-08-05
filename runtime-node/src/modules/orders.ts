import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { ok, fail } from '../http/envelope.js';
import { nowSql, okListOrEmpty, publicId, readJsonBody } from './_helpers.js';

export const name = 'orders';

function adminUserId(c: { get: (k: 'user') => unknown }): number | null {
  const user = c.get('user') as { id?: number; sub?: number } | 'mcp' | null;
  if (user === 'mcp' || !user) return null;
  return Number(user.id ?? user.sub ?? 0) || null;
}

async function ensureCartTables(db: ModuleContext['db']): Promise<boolean> {
  return (await db.tableExists('carts')) && (await db.tableExists('cart_items'));
}

async function getOrCreateCart(db: ModuleContext['db'], cartPublicId: string | null) {
  if (!(await ensureCartTables(db))) return null;
  if (cartPublicId) {
    const existing = await db.one("SELECT * FROM carts WHERE public_id=? AND status='active' LIMIT 1", [cartPublicId]);
    if (existing) return existing;
  }
  const pid = publicId();
  await db.run(
    "INSERT INTO carts (public_id, currency, status, created_at, updated_at) VALUES (?, 'RUB', 'active', ?, ?)",
    [pid, nowSql(), nowSql()],
  );
  const id = await db.lastInsertId();
  return db.one('SELECT * FROM carts WHERE id=?', [id]);
}

async function cartPayload(db: ModuleContext['db'], cart: Record<string, unknown>) {
  const items = await db.all(
    `SELECT ci.*, p.slug AS product_slug FROM cart_items ci
     LEFT JOIN products p ON p.id=ci.product_id
     WHERE ci.cart_id=? ORDER BY ci.id`,
    [cart.id],
  );
  let total = 0;
  for (const item of items) {
    total += Number(item.unit_price ?? 0) * Number(item.quantity ?? 1);
  }
  return {
    cart_id: String(cart.public_id),
    currency: String(cart.currency ?? 'RUB'),
    items,
    total,
  };
}

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/orders/cart`, async (c) => {
      if (!(await ensureCartTables(ctx.db))) {
        return ok(c, { cart_id: null, currency: 'RUB', items: [], total: 0 });
      }
      const cartId = String(c.req.query('cart_id') ?? '').trim() || null;
      const cart = await getOrCreateCart(ctx.db, cartId);
      if (!cart) return ok(c, { cart_id: null, currency: 'RUB', items: [], total: 0 });
      return ok(c, await cartPayload(ctx.db, cart));
    });

    ctx.app.post(`${p}/orders/cart/items`, async (c) => {
      if (!(await ensureCartTables(ctx.db))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const productId = Number(body.product_id ?? 0);
      const quantity = Math.max(1, Number(body.quantity ?? 1));
      if (!productId) return fail(c, 'Validation failed', 422);
      const product = await ctx.db.one('SELECT * FROM products WHERE id=?', [productId]);
      if (!product) return fail(c, 'Not found', 404);
      const cart = await getOrCreateCart(ctx.db, String(body.cart_id ?? '').trim() || null);
      if (!cart) return fail(c, 'capability_unavailable', 409);
      const existing = await ctx.db.one('SELECT * FROM cart_items WHERE cart_id=? AND product_id=?', [
        cart.id,
        productId,
      ]);
      if (existing) {
        await ctx.db.run('UPDATE cart_items SET quantity=? WHERE id=?', [
          Number(existing.quantity ?? 0) + quantity,
          existing.id,
        ]);
      } else {
        await ctx.db.run(
          'INSERT INTO cart_items (cart_id, product_id, sku, title, quantity, unit_price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            cart.id,
            productId,
            product.sku ?? null,
            product.title ?? 'Product',
            quantity,
            product.price ?? 0,
            nowSql(),
          ],
        );
      }
      return ok(c, await cartPayload(ctx.db, cart), 201);
    });

    ctx.app.put(`${p}/orders/cart/items/:id`, async (c) => {
      if (!(await ensureCartTables(ctx.db))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const cart = await getOrCreateCart(ctx.db, String(body.cart_id ?? '').trim() || null);
      if (!cart) return fail(c, 'capability_unavailable', 409);
      const quantity = Math.max(0, Number(body.quantity ?? 1));
      const itemId = c.req.param('id');
      if (quantity === 0) {
        await ctx.db.run('DELETE FROM cart_items WHERE id=? AND cart_id=?', [itemId, cart.id]);
      } else {
        await ctx.db.run('UPDATE cart_items SET quantity=? WHERE id=? AND cart_id=?', [quantity, itemId, cart.id]);
      }
      return ok(c, await cartPayload(ctx.db, cart));
    });

    ctx.app.post(`${p}/orders/checkout`, async (c) => {
      if (!(await ctx.db.tableExists('orders'))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const cartData = await (async () => {
        if (!(await ensureCartTables(ctx.db))) return null;
        const cart = await getOrCreateCart(ctx.db, String(body.cart_id ?? '').trim() || null);
        if (!cart) return null;
        return cartPayload(ctx.db, cart);
      })();
      if (!cartData?.items?.length) return fail(c, 'Cart is empty', 422);

      const number = `ORD-${Date.now()}`;
      const amount = Number(cartData.total ?? 0);
      const cols = await ctx.db.columns('orders');
      const data: Record<string, unknown> = {
        number,
        amount,
        currency: cartData.currency ?? 'RUB',
        status: 'new',
        created_at: nowSql(),
      };
      if (cols.includes('customer_email')) data.customer_email = body.email ?? null;
      if (cols.includes('customer_name')) data.customer_name = body.name ?? null;
      if (cols.includes('email')) data.email = body.email ?? null;
      if (cols.includes('grand_total')) data.grand_total = amount;
      if (cols.includes('public_id')) data.public_id = publicId();
      if (cols.includes('items')) data.items = JSON.stringify(cartData.items);
      if (cols.includes('source')) data.source = 'cart';

      const keys = Object.keys(data);
      await ctx.db.run(
        `INSERT INTO orders (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((k) => data[k]),
      );
      const orderId = await ctx.db.lastInsertId();
      const order = await ctx.db.one('SELECT * FROM orders WHERE id=?', [orderId]);
      await ctx.events.publish('order.created', { id: orderId, order });
      return ok(c, order, 201);
    });

    ctx.app.get(`${p}/admin/orders`, admin, async (c) => {
      return okListOrEmpty(c, ctx.db, 'orders', async () => {
        const status = String(c.req.query('status') ?? '').trim();
        const q = String(c.req.query('q') ?? '').trim();
        let sql =
          'SELECT id, public_id, number, customer_name, email, customer_email, grand_total, amount, currency, status, payment_status, fulfillment_status, created_at FROM orders WHERE 1=1';
        const params: unknown[] = [];
        if (status) {
          sql += ' AND status=?';
          params.push(status);
        }
        if (q) {
          sql += ' AND (number LIKE ? OR email LIKE ? OR customer_email LIKE ?)';
          const like = `%${q}%`;
          params.push(like, like, like);
        }
        sql += ' ORDER BY id DESC LIMIT 300';
        return ctx.db.all(sql, params);
      });
    });

    // Static path before /:id so "export" is not captured as an id.
    ctx.app.get(`${p}/admin/orders/export`, admin, async (c) => {
      const header = [
        'number',
        'email',
        'customer_name',
        'status',
        'payment_status',
        'fulfillment_status',
        'grand_total',
        'currency',
        'created_at',
      ];
      const rows = (await ctx.db.tableExists('orders'))
        ? await ctx.db.all(
            'SELECT number, COALESCE(email, customer_email) AS email, customer_name, status, payment_status, fulfillment_status, grand_total, currency, created_at FROM orders ORDER BY id DESC LIMIT 10000',
          )
        : [];
      const escape = (v: unknown) => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [header.join(',')];
      for (const row of rows) {
        lines.push(header.map((k) => escape(row[k])).join(','));
      }
      const csv = '\uFEFF' + lines.join('\n');
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="orders-export.csv"',
        },
      });
    });

    ctx.app.get(`${p}/admin/orders/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('orders'))) return fail(c, 'capability_unavailable', 409);
      const order = await ctx.db.one('SELECT * FROM orders WHERE id=?', [c.req.param('id')]);
      if (!order) return fail(c, 'Not found', 404);
      let items: unknown[] = [];
      if (await ctx.db.tableExists('order_items')) {
        items = await ctx.db.all('SELECT * FROM order_items WHERE order_id=? ORDER BY id', [order.id]);
      } else if (order.items) {
        try {
          items = JSON.parse(String(order.items)) as unknown[];
        } catch {
          items = [];
        }
      }
      return ok(c, { ...order, line_items: items });
    });

    ctx.app.post(`${p}/admin/orders/:id/status`, admin, async (c) => {
      if (!(await ctx.db.tableExists('orders'))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const status = String(body.status ?? '').trim();
      if (!status) return fail(c, 'Validation failed', 422);
      const id = c.req.param('id');
      const order = await ctx.db.one('SELECT * FROM orders WHERE id=?', [id]);
      if (!order) return fail(c, 'Not found', 404);
      await ctx.db.run('UPDATE orders SET status=?, updated_at=? WHERE id=?', [status, nowSql(), id]);
      if (await ctx.db.tableExists('order_status_history')) {
        await ctx.db.run(
          'INSERT INTO order_status_history (order_id, from_status, to_status, note, created_at) VALUES (?, ?, ?, ?, ?)',
          [id, order.status ?? null, status, body.note ?? null, nowSql()],
        );
      }
      await ctx.events.publish('order.status_changed', { id, from: order.status, to: status });
      return ok(c, await ctx.db.one('SELECT * FROM orders WHERE id=?', [id]));
    });

    ctx.app.post(`${p}/admin/orders/:id/notes`, admin, async (c) => {
      if (!(await ctx.db.tableExists('orders'))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const noteBody = String(body.body ?? '').trim();
      if (!noteBody) return fail(c, 'Note is required', 422);
      const orderId = c.req.param('id');
      const order = await ctx.db.one('SELECT id FROM orders WHERE id=?', [orderId]);
      if (!order) return fail(c, 'Not found', 404);
      if (!(await ctx.db.tableExists('order_notes'))) return fail(c, 'capability_unavailable', 409);
      const authorId = adminUserId(c as { get: (k: 'user') => unknown });
      await ctx.db.run(
        'INSERT INTO order_notes (order_id, author_id, body, is_customer_visible) VALUES (?, ?, ?, ?)',
        [orderId, authorId, noteBody, body.is_customer_visible ? 1 : 0],
      );
      const id = await ctx.db.lastInsertId();
      return ok(c, await ctx.db.one('SELECT * FROM order_notes WHERE id=?', [id]), 201);
    });

    ctx.app.post(`${p}/admin/orders/:id/refunds`, admin, async (c) => {
      if (!(await ctx.db.tableExists('orders'))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const orderId = Number(c.req.param('id'));
      const order = await ctx.db.one('SELECT * FROM orders WHERE id=?', [orderId]);
      if (!order) return fail(c, 'Not found', 404);
      const amount = Math.round(Number(body.amount ?? 0) * 100) / 100;
      const grandTotal = Number(order.grand_total ?? order.amount ?? 0);
      if (amount <= 0 || amount > grandTotal) return fail(c, 'Invalid refund amount', 422);
      if (!(await ctx.db.tableExists('refunds'))) return fail(c, 'capability_unavailable', 409);
      const actorId = adminUserId(c as { get: (k: 'user') => unknown });
      const refundPublicId = publicId();
      await ctx.db.run(
        'INSERT INTO refunds (public_id, order_id, payment_id, amount, currency, status, reason, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          refundPublicId,
          orderId,
          body.payment_id != null ? Number(body.payment_id) : null,
          amount,
          order.currency ?? 'RUB',
          'recorded',
          body.reason ?? null,
          actorId,
        ],
      );
      const refund = await ctx.db.one('SELECT * FROM refunds WHERE public_id=?', [refundPublicId]);
      const refunded = await ctx.db.one('SELECT COALESCE(SUM(amount),0) AS total FROM refunds WHERE order_id=?', [orderId]);
      if (Number(refunded?.total ?? 0) >= grandTotal) {
        await ctx.db.run('UPDATE orders SET status=? WHERE id=?', ['refunded', orderId]);
      }
      await ctx.events.publish('order.refunded', { order_id: orderId, refund });
      return ok(c, refund, 201);
    });
  }
}
