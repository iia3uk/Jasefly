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



function adminUserId(c: { get: (k: 'user') => unknown }): number | null {
  const user = c.get('user') as { id?: number; sub?: number } | 'mcp' | null;
  if (user === 'mcp' || !user) return null;
  return Number(user.id ?? user.sub ?? 0) || null;
}

async function ensureCartTables(db: DbLike): Promise<boolean> {
  return (await db.tableExists('carts')) && (await db.tableExists('cart_items'));
}

async function getOrCreateCart(db: DbLike, cartPublicId: string | null) {
  if (!(await ensureCartTables(db))) return null;
  if (cartPublicId) {
    const existing = await db.one("SELECT * FROM carts WHERE public_id=? AND status='active' LIMIT 1", [cartPublicId]);
    if (existing) return existing;
  }
  const pid = publicId();
  await db.run(
    "INSERT INTO carts (public_id, user_id, status, expires_at, currency, created_at, updated_at) VALUES (?, NULL, 'active', datetime('now', '+30 days'), 'RUB', ?, ?)",
    [pid, nowSql(), nowSql()],
  );
  const id = await db.lastInsertId();
  return db.one('SELECT * FROM carts WHERE id=?', [id]);
}

async function cartPayload(
  db: DbLike,
  cart: Record<string, unknown>,
): Promise<Record<string, unknown> & {
  items: Awaited<ReturnType<DbLike['all']>>;
  totals: {
    subtotal: number;
    discount_total: number;
    tax_total: number;
    shipping_total: number;
    grand_total: number;
  };
}> {
  const items = await db.all(
    `SELECT ci.*, p.price AS current_price, p.title AS current_title, p.sku AS current_sku
     FROM cart_items ci LEFT JOIN products p ON p.id=ci.product_id
     WHERE ci.cart_id=? ORDER BY ci.id`,
    [cart.id],
  );
  for (const item of items) {
    if (item.product_id != null && item.current_price != null) {
      item.unit_price = item.current_price;
      item.title = item.current_title;
      item.sku = item.current_sku;
      await db.run('UPDATE cart_items SET unit_price=?, title=?, sku=? WHERE id=?', [
        item.unit_price,
        item.title,
        item.sku,
        item.id,
      ]);
    }
  }
  // Key order must match PHP OrdersService::calculateTotals
  const totals = {
    subtotal: 0,
    discount_total: 0,
    tax_total: 0,
    shipping_total: 0,
    grand_total: 0,
  };
  for (const item of items) {
    totals.subtotal += Number(item.unit_price ?? 0) * Number(item.quantity ?? 1);
  }
  totals.grand_total = totals.subtotal;
  // PHP OrdersService::getCart returns the cart row + items + totals
  return {
    ...cart,
    items,
    totals,
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


    http.get('/orders/cart', async (c) => {
      if (!(await ensureCartTables(db))) {
        return http.fail(c, 'capability_unavailable', 409);
      }
      const cartId = String(c.req.query('cart_id') ?? '').trim() || null;
      const cart = await getOrCreateCart(db, cartId);
      if (!cart) return http.fail(c, 'capability_unavailable', 409);
      return http.ok(c, await cartPayload(db, cart));
    });

    http.post('/orders/cart/items', async (c) => {
      if (!(await ensureCartTables(db))) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      // PHP OrdersService::addCartItem creates the cart before product lookup (side effect on 422).
      const cart = await getOrCreateCart(db, String(body.cart_id ?? '').trim() || null);
      if (!cart) return http.fail(c, 'capability_unavailable', 409);
      const productId = Number(body.product_id ?? 0);
      const quantity = Math.max(1, Number(body.quantity ?? 1));
      const product = await db.one(
        'SELECT id, sku, title, price, currency FROM products WHERE id=? AND is_purchasable=1 AND is_visible=1 AND deleted_at IS NULL',
        [productId],
      );
      if (!product) return http.fail(c, 'Product not found', 422);
      const existing = await db.one('SELECT * FROM cart_items WHERE cart_id=? AND product_id=?', [
        cart.id,
        productId,
      ]);
      if (existing) {
        await db.run('UPDATE cart_items SET quantity=? WHERE id=?', [
          Math.max(1, Number(existing.quantity ?? 0) + quantity),
          existing.id,
        ]);
      } else {
        await db.run(
          'INSERT INTO cart_items (cart_id, product_id, sku, title, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)',
          [cart.id, productId, product.sku ?? null, product.title ?? 'Product', quantity, product.price ?? 0],
        );
      }
      // PHP reloads cart by public_id after mutate
      const refreshed = await getOrCreateCart(db, String(cart.public_id));
      return http.ok(c, await cartPayload(db, refreshed ?? cart), 201);
    });

    http.put('/orders/cart/items/:id', async (c) => {
      if (!(await ensureCartTables(db))) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      // Match PHP: updateCartItem passes the raw cart_id into getCart twice.
      // When cart_id is empty, both calls create a new cart (second response is empty).
      const cartPublicId = String(body.cart_id ?? '').trim() || null;
      const cart = await getOrCreateCart(db, cartPublicId);
      if (!cart) return http.fail(c, 'capability_unavailable', 409);
      const quantity = Number(body.quantity ?? 1);
      const itemId = Number.parseInt(String(c.req.param('id') ?? ''), 10) || 0;
      if (quantity <= 0) {
        await db.run('DELETE FROM cart_items WHERE id=? AND cart_id=?', [itemId, cart.id]);
      } else {
        await db.run('UPDATE cart_items SET quantity=? WHERE id=? AND cart_id=?', [
          Math.min(999, quantity),
          itemId,
          cart.id,
        ]);
      }
      const refreshed = await getOrCreateCart(db, cartPublicId);
      return http.ok(c, await cartPayload(db, refreshed ?? cart));
    });

    http.post('/orders/checkout', async (c) => {
      if (!(await db.tableExists('orders'))) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const cartData = await (async () => {
        if (!(await ensureCartTables(db))) return null;
        const cart = await getOrCreateCart(db, String(body.cart_id ?? '').trim() || null);
        if (!cart) return null;
        return cartPayload(db, cart);
      })();
      if (!cartData?.items?.length) return http.fail(c, 'Cart is empty', 422);

      const number = `ORD-${Date.now()}`;
      const amount = Number(cartData.totals.grand_total ?? 0);
      const cols = await db.columns('orders');
      const data: Record<string, unknown> = {
        number,
        amount,
        currency: String(cartData.currency ?? 'RUB'),
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
      await db.run(
        `INSERT INTO orders (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((k) => data[k]),
      );
      const orderId = await db.lastInsertId();
      const order = await db.one('SELECT * FROM orders WHERE id=?', [orderId]);
      await events.publish('order.created', { id: orderId, order });
      return http.ok(c, order, 201);
    });

    http.get('/admin/orders', admin, async (c) => {
      return okListOrEmpty(c, db, 'orders', async () => {
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
        return db.all(sql, params);
      }, http.ok);
    });

    // Static path before /:id so "export" is not captured as an id.
    http.get('/admin/orders/export', admin, async (c) => {
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
      const rows = (await db.tableExists('orders'))
        ? await db.all(
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
      // PHP fputcsv always ends with a newline after the last row.
      const csv = '\uFEFF' + lines.join('\n') + '\n';
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="orders-export.csv"',
        },
      });
    });

    http.get('/admin/orders/:id', admin, async (c) => {
      if (!(await db.tableExists('orders'))) return http.fail(c, 'capability_unavailable', 409);
      const order = await db.one('SELECT * FROM orders WHERE id=?', [c.req.param('id')]);
      if (!order) return http.fail(c, 'Not found', 404);
      let items: unknown[] = [];
      if (await db.tableExists('order_items')) {
        items = await db.all('SELECT * FROM order_items WHERE order_id=? ORDER BY id', [order.id]);
      } else if (order.items) {
        try {
          items = JSON.parse(String(order.items)) as unknown[];
        } catch {
          items = [];
        }
      }
      return http.ok(c, { ...order, line_items: items });
    });

    http.post('/admin/orders/:id/status', admin, async (c) => {
      if (!(await db.tableExists('orders'))) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const status = String(body.status ?? '').trim();
      if (!status) return http.fail(c, 'Validation failed', 422);
      const id = c.req.param('id');
      const order = await db.one('SELECT * FROM orders WHERE id=?', [id]);
      if (!order) return http.fail(c, 'Not found', 404);
      await db.run('UPDATE orders SET status=?, updated_at=? WHERE id=?', [status, nowSql(), id]);
      if (await db.tableExists('order_status_history')) {
        await db.run(
          'INSERT INTO order_status_history (order_id, from_status, to_status, note, created_at) VALUES (?, ?, ?, ?, ?)',
          [id, order.status ?? null, status, body.note ?? null, nowSql()],
        );
      }
      await events.publish('order.status_changed', { id, from: order.status, to: status });
      return http.ok(c, await db.one('SELECT * FROM orders WHERE id=?', [id]));
    });

    http.post('/admin/orders/:id/notes', admin, async (c) => {
      if (!(await db.tableExists('orders'))) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const noteBody = String(body.body ?? '').trim();
      if (!noteBody) return http.fail(c, 'Note is required', 422);
      const orderId = c.req.param('id');
      const order = await db.one('SELECT id FROM orders WHERE id=?', [orderId]);
      if (!order) return http.fail(c, 'Not found', 404);
      if (!(await db.tableExists('order_notes'))) return http.fail(c, 'capability_unavailable', 409);
      const authorId = adminUserId(c as { get: (k: 'user') => unknown });
      await db.run(
        'INSERT INTO order_notes (order_id, author_id, body, is_customer_visible) VALUES (?, ?, ?, ?)',
        [orderId, authorId, noteBody, body.is_customer_visible ? 1 : 0],
      );
      const id = await db.lastInsertId();
      return http.ok(c, await db.one('SELECT * FROM order_notes WHERE id=?', [id]), 201);
    });

    http.post('/admin/orders/:id/refunds', admin, async (c) => {
      if (!(await db.tableExists('orders'))) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const orderId = Number(c.req.param('id'));
      const order = await db.one('SELECT * FROM orders WHERE id=?', [orderId]);
      if (!order) return http.fail(c, 'Not found', 404);
      const amount = Math.round(Number(body.amount ?? 0) * 100) / 100;
      const grandTotal = Number(order.grand_total ?? order.amount ?? 0);
      if (amount <= 0 || amount > grandTotal) return http.fail(c, 'Invalid refund amount', 422);
      if (!(await db.tableExists('refunds'))) return http.fail(c, 'capability_unavailable', 409);
      const actorId = adminUserId(c as { get: (k: 'user') => unknown });
      const refundPublicId = publicId();
      await db.run(
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
      const refund = await db.one('SELECT * FROM refunds WHERE public_id=?', [refundPublicId]);
      const refunded = await db.one('SELECT COALESCE(SUM(amount),0) AS total FROM refunds WHERE order_id=?', [orderId]);
      if (Number(refunded?.total ?? 0) >= grandTotal) {
        await db.run('UPDATE orders SET status=? WHERE id=?', ['refunded', orderId]);
      }
      await events.publish('order.refunded', { order_id: orderId, refund });
      return http.ok(c, refund, 201);
    });
  
}
