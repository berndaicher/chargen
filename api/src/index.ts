import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { verifyEntraToken } from './auth';
import { resolveRole, resolveTenant, upsertUser } from './db';
import type { AuthContext, Bindings } from './types';

type AppContext = {
  Bindings: Bindings;
  Variables: {
    auth: AuthContext;
  };
};

const app = new Hono<AppContext>();

app.use('*', async (c, next) => {
  if (c.req.path === '/health') {
    await next();
    return;
  }

  try {
    const identity = await verifyEntraToken(c);
    const tenant = await resolveTenant(c.env, identity);
    const user = await upsertUser(c.env, identity);
    const role = await resolveRole(c.env, tenant.id, user.id);

    const auth: AuthContext = {
      tenantId: tenant.id,
      tenantExternalId: tenant.entra_tenant_id,
      userOid: identity.userOid,
      role
    };

    c.set('auth', auth);
    await next();
  } catch (error) {
    throw new HTTPException(401, { message: `Unauthorized: ${String((error as Error).message)}` });
  }
});

function requireRole(c: import('hono').Context<AppContext>, allowed: Array<'reader' | 'editor' | 'admin'>) {
  const auth = c.get('auth') as AuthContext;
  if (!allowed.includes(auth.role)) {
    throw new HTTPException(403, { message: 'Forbidden' });
  }
  return auth;
}

app.get('/health', (c) => c.json({ ok: true }));

app.get('/me', (c) => {
  const auth = requireRole(c, ['reader', 'editor', 'admin']);
  return c.json(auth);
});

app.get('/articles', async (c) => {
  const auth = requireRole(c, ['reader', 'editor', 'admin']);
  const q = (c.req.query('q') ?? '').trim();

  const rows = await c.env.DB.prepare(
    `SELECT n_article, article_name
     FROM t_articles
     WHERE tenant_id = ?
       AND (? = '' OR CAST(n_article AS TEXT) LIKE '%' || ? || '%' OR article_name LIKE '%' || ? || '%')
     ORDER BY n_article ASC`
  )
    .bind(auth.tenantId, q, q, q)
    .all<{ n_article: number; article_name: string }>();

  return c.json(rows.results ?? []);
});

app.post('/articles', async (c) => {
  const auth = requireRole(c, ['editor', 'admin']);
  const body = await c.req.json<{ n_article: number; article_name: string }>();

  if (!Number.isInteger(body.n_article) || !body.article_name?.trim()) {
    throw new HTTPException(400, { message: 'Invalid article payload' });
  }

  await c.env.DB.prepare(
    'INSERT INTO t_articles (tenant_id, n_article, article_name) VALUES (?, ?, ?)'
  )
    .bind(auth.tenantId, body.n_article, body.article_name.trim())
    .run();

  return c.json({ ok: true }, 201);
});

app.put('/articles/:nArticle', async (c) => {
  const auth = requireRole(c, ['editor', 'admin']);
  const nArticle = Number(c.req.param('nArticle'));
  const body = await c.req.json<{ article_name: string }>();

  if (!Number.isInteger(nArticle) || !body.article_name?.trim()) {
    throw new HTTPException(400, { message: 'Invalid article payload' });
  }

  const result = await c.env.DB.prepare(
    'UPDATE t_articles SET article_name = ? WHERE tenant_id = ? AND n_article = ?'
  )
    .bind(body.article_name.trim(), auth.tenantId, nArticle)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new HTTPException(404, { message: 'Article not found' });
  }

  return c.json({ ok: true });
});

app.delete('/articles/:nArticle', async (c) => {
  const auth = requireRole(c, ['admin']);
  const nArticle = Number(c.req.param('nArticle'));

  if (!Number.isInteger(nArticle)) {
    throw new HTTPException(400, { message: 'Invalid article number' });
  }

  const result = await c.env.DB.prepare(
    'DELETE FROM t_articles WHERE tenant_id = ? AND n_article = ?'
  )
    .bind(auth.tenantId, nArticle)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new HTTPException(404, { message: 'Article not found' });
  }

  return c.json({ ok: true });
});

app.get('/charges', async (c) => {
  const auth = requireRole(c, ['reader', 'editor', 'admin']);
  const q = (c.req.query('q') ?? '').trim();

  const rows = await c.env.DB.prepare(
    `SELECT c.n_charge, c.n_article, c.charge_id, c.good_to, c.first_delivery, c.last_delivery, a.article_name
     FROM t_charges c
     INNER JOIN t_articles a
       ON a.tenant_id = c.tenant_id AND a.n_article = c.n_article
     WHERE c.tenant_id = ?
       AND (? = '' OR c.charge_id LIKE '%' || ? || '%' OR CAST(c.n_article AS TEXT) LIKE '%' || ? || '%' OR a.article_name LIKE '%' || ? || '%')
     ORDER BY c.id DESC`
  )
    .bind(auth.tenantId, q, q, q, q)
    .all();

  return c.json(rows.results ?? []);
});

app.post('/charges', async (c) => {
  const auth = requireRole(c, ['editor', 'admin']);
  const body = await c.req.json<{
    n_article: number;
    charge_id: string;
    good_to?: string | null;
    first_delivery?: string | null;
    last_delivery?: string | null;
  }>();

  if (!Number.isInteger(body.n_article) || !body.charge_id?.trim()) {
    throw new HTTPException(400, { message: 'Invalid charge payload' });
  }

  await c.env.DB.prepare(
    `INSERT INTO t_charges
      (tenant_id, n_article, charge_id, good_to, first_delivery, last_delivery)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      auth.tenantId,
      body.n_article,
      body.charge_id.trim(),
      body.good_to ?? null,
      body.first_delivery ?? null,
      body.last_delivery ?? null
    )
    .run();

  return c.json({ ok: true }, 201);
});

app.put('/charges/:chargeId', async (c) => {
  const auth = requireRole(c, ['editor', 'admin']);
  const chargeId = c.req.param('chargeId').trim();
  const body = await c.req.json<{
    n_article: number;
    new_charge_id?: string;
    good_to?: string | null;
    first_delivery?: string | null;
    last_delivery?: string | null;
  }>();

  if (!chargeId || !Number.isInteger(body.n_article)) {
    throw new HTTPException(400, { message: 'Invalid charge payload' });
  }

  const result = await c.env.DB.prepare(
    `UPDATE t_charges
      SET n_article = ?,
          charge_id = COALESCE(NULLIF(?, ''), charge_id),
          good_to = ?,
          first_delivery = ?,
          last_delivery = ?
     WHERE tenant_id = ? AND charge_id = ?`
  )
    .bind(
      body.n_article,
      body.new_charge_id?.trim() ?? '',
      body.good_to ?? null,
      body.first_delivery ?? null,
      body.last_delivery ?? null,
      auth.tenantId,
      chargeId
    )
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new HTTPException(404, { message: 'Charge not found' });
  }

  return c.json({ ok: true });
});

app.delete('/charges/:chargeId', async (c) => {
  const auth = requireRole(c, ['admin']);
  const chargeId = c.req.param('chargeId').trim();

  if (!chargeId) {
    throw new HTTPException(400, { message: 'Invalid charge id' });
  }

  const result = await c.env.DB.prepare(
    'DELETE FROM t_charges WHERE tenant_id = ? AND charge_id = ?'
  )
    .bind(auth.tenantId, chargeId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new HTTPException(404, { message: 'Charge not found' });
  }

  return c.json({ ok: true });
});
// ─── User / Role management ───────────────────────────────────────────────────

app.get('/users', async (c) => {
  const auth = requireRole(c, ['admin']);
  const rows = await c.env.DB.prepare(
    `SELECT u.user_oid, u.email, u.display_name, r.role
     FROM user_tenant_roles r
     INNER JOIN app_users u ON u.id = r.user_id
     WHERE r.tenant_id = ?
     ORDER BY u.display_name ASC`
  )
    .bind(auth.tenantId)
    .all<{ user_oid: string; email: string | null; display_name: string | null; role: string }>();

  return c.json(rows.results ?? []);
});

app.put('/users/:oid/role', async (c) => {
  const auth = requireRole(c, ['admin']);
  const oid = c.req.param('oid');
  const body = await c.req.json<{ role: string }>();

  if (!['reader', 'editor', 'admin'].includes(body.role)) {
    throw new HTTPException(400, { message: 'Invalid role. Must be reader, editor, or admin' });
  }

  const user = await c.env.DB.prepare('SELECT id FROM app_users WHERE user_oid = ?')
    .bind(oid)
    .first<{ id: number }>();

  if (!user) {
    throw new HTTPException(404, { message: 'User not found in this tenant' });
  }

  await c.env.DB.prepare(
    'UPDATE user_tenant_roles SET role = ? WHERE tenant_id = ? AND user_id = ?'
  )
    .bind(body.role, auth.tenantId, user.id)
    .run();

  return c.json({ ok: true });
});

// ─── Export (CSV) ─────────────────────────────────────────────────────────────

app.get('/articles/export', async (c) => {
  const auth = requireRole(c, ['reader', 'editor', 'admin']);
  const rows = await c.env.DB.prepare(
    'SELECT n_article, article_name FROM t_articles WHERE tenant_id = ? ORDER BY n_article ASC'
  )
    .bind(auth.tenantId)
    .all<{ n_article: number; article_name: string }>();

  const csv = [
    'Artikelnummer,Bezeichnung',
    ...(rows.results ?? []).map(
      (r) => `${r.n_article},"${r.article_name.replace(/"/g, '""')}"`
    )
  ].join('\r\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="artikel.csv"'
    }
  });
});

app.get('/charges/export', async (c) => {
  const auth = requireRole(c, ['reader', 'editor', 'admin']);
  const q = (c.req.query('q') ?? '').trim();

  const rows = await c.env.DB.prepare(
    `SELECT c.n_article, a.article_name, c.charge_id, c.good_to, c.first_delivery, c.last_delivery
     FROM t_charges c
     INNER JOIN t_articles a ON a.tenant_id = c.tenant_id AND a.n_article = c.n_article
     WHERE c.tenant_id = ?
       AND (? = '' OR c.charge_id LIKE '%' || ? || '%'
            OR CAST(c.n_article AS TEXT) LIKE '%' || ? || '%'
            OR a.article_name LIKE '%' || ? || '%')
     ORDER BY c.n_article ASC, c.charge_id ASC`
  )
    .bind(auth.tenantId, q, q, q, q)
    .all<Record<string, string>>();

  const esc = (s: string | null | undefined) => `"${(s ?? '').replace(/"/g, '""')}"`;
  const csv = [
    'Artikelnummer,Bezeichnung,Chargennummer,MHD,Erste Auslieferung,Letzte Auslieferung',
    ...(rows.results ?? []).map(
      (r) =>
        `${r.n_article},${esc(r.article_name)},${esc(r.charge_id)},${r.good_to ?? ''},${r.first_delivery ?? ''},${r.last_delivery ?? ''}`
    )
  ].join('\r\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="chargen.csv"'
    }
  });
});

export default app;
