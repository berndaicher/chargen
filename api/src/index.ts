import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { verifyEntraToken } from './auth';
import { resolveRole, resolveTenant, upsertUser } from './db';
import type { AuthContext, Bindings } from './types';
import type { VerifiedIdentity } from './auth';

type AppContext = {
  Bindings: Bindings;
  Variables: {
    auth: AuthContext;
  };
};

const app = new Hono<AppContext>();

app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  if (c.req.path === '/health') {
    await next();
    return;
  }

  try {
    let identity: VerifiedIdentity;
    if (c.env.DEV_AUTH_BYPASS) {
      identity = {
        tenantExternalId: c.env.DEV_TENANT_ID ?? 'dev-tenant',
        userOid: 'dev-user-00000000-0000-0000-0000-000000000000',
        email: 'dev@bodner-getraenke.at',
        displayName: 'Dev User'
      };
    } else {
      identity = await verifyEntraToken(c);
    }

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
  } catch {
    throw new HTTPException(401, { message: 'Anmeldung abgelaufen — bitte neu anmelden.' });
  }
});

function requireRole(c: import('hono').Context<AppContext>, allowed: Array<'reader' | 'editor' | 'admin'>) {
  const auth = c.get('auth') as AuthContext;
  if (!allowed.includes(auth.role)) {
    throw new HTTPException(403, { message: 'Keine Berechtigung für diese Aktion.' });
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
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '100', 10) || 100, 1), 500);
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0);

  const rows = await c.env.DB.prepare(
    `SELECT n_article, product_identifier, article_name
     FROM t_articles
     WHERE tenant_id = ?
       AND (? = '' OR product_identifier LIKE '%' || ? || '%' OR article_name LIKE '%' || ? || '%')
     ORDER BY product_identifier ASC
     LIMIT ? OFFSET ?`
  )
    .bind(auth.tenantId, q, q, q, limit, offset)
    .all<{ n_article: number; product_identifier: string | null; article_name: string }>();

  return c.json(rows.results ?? []);
});

app.post('/articles', async (c) => {
  const auth = requireRole(c, ['editor', 'admin']);
  const body = await c.req.json<{ product_identifier: string; article_name: string }>();

  const pid = body.product_identifier?.trim();
  const name = body.article_name?.trim();
  if (!pid || !name) {
    throw new HTTPException(400, { message: 'Art. Nr. und Bezeichnung dürfen nicht leer sein.' });
  }

  const existing = await c.env.DB.prepare(
    'SELECT 1 FROM t_articles WHERE tenant_id = ? AND product_identifier = ?'
  )
    .bind(auth.tenantId, pid)
    .first<{ 1: number }>();
  if (existing) {
    throw new HTTPException(409, { message: `Art. Nr. "${pid}" ist bereits vergeben.` });
  }

  const next = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(n_article), 0) + 1 AS next_n FROM t_articles WHERE tenant_id = ?'
  )
    .bind(auth.tenantId)
    .first<{ next_n: number }>();
  const nArticle = next?.next_n ?? 1;

  await c.env.DB.prepare(
    'INSERT INTO t_articles (tenant_id, n_article, article_name, product_identifier) VALUES (?, ?, ?, ?)'
  )
    .bind(auth.tenantId, nArticle, name, pid)
    .run();

  return c.json({ ok: true, n_article: nArticle, product_identifier: pid }, 201);
});

app.put('/articles/:nArticle', async (c) => {
  const auth = requireRole(c, ['editor', 'admin']);
  const nArticle = Number(c.req.param('nArticle'));
  const body = await c.req.json<{ product_identifier: string; article_name: string }>();

  const pid = body.product_identifier?.trim();
  const name = body.article_name?.trim();
  if (!Number.isInteger(nArticle) || !pid || !name) {
    throw new HTTPException(400, { message: 'Art. Nr. und Bezeichnung dürfen nicht leer sein.' });
  }

  const conflict = await c.env.DB.prepare(
    'SELECT 1 FROM t_articles WHERE tenant_id = ? AND product_identifier = ? AND n_article <> ?'
  )
    .bind(auth.tenantId, pid, nArticle)
    .first<{ 1: number }>();
  if (conflict) {
    throw new HTTPException(409, { message: `Art. Nr. "${pid}" ist bereits vergeben.` });
  }

  const result = await c.env.DB.prepare(
    'UPDATE t_articles SET article_name = ?, product_identifier = ? WHERE tenant_id = ? AND n_article = ?'
  )
    .bind(name, pid, auth.tenantId, nArticle)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new HTTPException(404, { message: 'Artikel wurde nicht gefunden — eventuell bereits gelöscht.' });
  }

  return c.json({ ok: true });
});

app.delete('/articles/:nArticle', async (c) => {
  const auth = requireRole(c, ['admin']);
  const nArticle = Number(c.req.param('nArticle'));

  if (!Number.isInteger(nArticle)) {
    throw new HTTPException(400, { message: 'Ungültige Artikelnummer.' });
  }

  const result = await c.env.DB.prepare(
    'DELETE FROM t_articles WHERE tenant_id = ? AND n_article = ?'
  )
    .bind(auth.tenantId, nArticle)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new HTTPException(404, { message: 'Artikel wurde nicht gefunden — eventuell bereits gelöscht.' });
  }

  return c.json({ ok: true });
});

app.get('/charges', async (c) => {
  const auth = requireRole(c, ['reader', 'editor', 'admin']);
  const q = (c.req.query('q') ?? '').trim();
  const nArticle = (c.req.query('n_article') ?? '').trim();
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '100', 10) || 100, 1), 500);
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0);

  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.n_article, a.product_identifier, c.charge_id, c.good_to, c.first_delivery, c.last_delivery, a.article_name
     FROM t_charges c
     INNER JOIN t_articles a
       ON a.tenant_id = c.tenant_id AND a.n_article = c.n_article
     WHERE c.tenant_id = ?
       AND (? = '' OR c.charge_id LIKE '%' || ? || '%' OR a.product_identifier LIKE '%' || ? || '%' OR a.article_name LIKE '%' || ? || '%')
       AND (? = '' OR CAST(c.n_article AS TEXT) = ?)
     ORDER BY COALESCE(c.first_delivery, '') DESC, c.id DESC
     LIMIT ? OFFSET ?`
  )
    .bind(auth.tenantId, q, q, q, q, nArticle, nArticle, limit, offset)
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

  const chargeId = body.charge_id?.trim();
  if (!Number.isInteger(body.n_article) || !chargeId) {
    throw new HTTPException(400, { message: 'Artikel und Losnummer dürfen nicht leer sein.' });
  }

  const article = await c.env.DB.prepare(
    'SELECT product_identifier FROM t_articles WHERE tenant_id = ? AND n_article = ?'
  )
    .bind(auth.tenantId, body.n_article)
    .first<{ product_identifier: string | null }>();
  if (!article) {
    throw new HTTPException(400, { message: 'Der ausgewählte Artikel existiert nicht.' });
  }

  const existing = await c.env.DB.prepare(
    'SELECT 1 FROM t_charges WHERE tenant_id = ? AND n_article = ? AND charge_id = ?'
  )
    .bind(auth.tenantId, body.n_article, chargeId)
    .first<{ 1: number }>();
  if (existing) {
    throw new HTTPException(409, {
      message: `Losnummer "${chargeId}" ist für Artikel "${article.product_identifier ?? body.n_article}" bereits vergeben.`
    });
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO t_charges
      (tenant_id, n_article, charge_id, good_to, first_delivery, last_delivery)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`
  )
    .bind(
      auth.tenantId,
      body.n_article,
      chargeId,
      body.good_to ?? null,
      body.first_delivery ?? null,
      body.last_delivery ?? null
    )
    .first<{ id: number }>();

  return c.json({ ok: true, id: result?.id }, 201);
});

app.put('/charges/:id', async (c) => {
  const auth = requireRole(c, ['editor', 'admin']);
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{
    n_article: number;
    charge_id: string;
    good_to?: string | null;
    first_delivery?: string | null;
    last_delivery?: string | null;
  }>();

  const chargeId = body.charge_id?.trim();
  if (!Number.isInteger(id) || !Number.isInteger(body.n_article) || !chargeId) {
    throw new HTTPException(400, { message: 'Artikel und Losnummer dürfen nicht leer sein.' });
  }

  const article = await c.env.DB.prepare(
    'SELECT product_identifier FROM t_articles WHERE tenant_id = ? AND n_article = ?'
  )
    .bind(auth.tenantId, body.n_article)
    .first<{ product_identifier: string | null }>();
  if (!article) {
    throw new HTTPException(400, { message: 'Der ausgewählte Artikel existiert nicht.' });
  }

  const conflict = await c.env.DB.prepare(
    'SELECT 1 FROM t_charges WHERE tenant_id = ? AND n_article = ? AND charge_id = ? AND id <> ?'
  )
    .bind(auth.tenantId, body.n_article, chargeId, id)
    .first<{ 1: number }>();
  if (conflict) {
    throw new HTTPException(409, {
      message: `Losnummer "${chargeId}" ist für Artikel "${article.product_identifier ?? body.n_article}" bereits vergeben.`
    });
  }

  const result = await c.env.DB.prepare(
    `UPDATE t_charges
      SET n_article = ?,
          charge_id = ?,
          good_to = ?,
          first_delivery = ?,
          last_delivery = ?
     WHERE tenant_id = ? AND id = ?`
  )
    .bind(
      body.n_article,
      chargeId,
      body.good_to ?? null,
      body.first_delivery ?? null,
      body.last_delivery ?? null,
      auth.tenantId,
      id
    )
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new HTTPException(404, { message: 'Charge wurde nicht gefunden — eventuell bereits gelöscht.' });
  }

  return c.json({ ok: true });
});

app.delete('/charges/:id', async (c) => {
  const auth = requireRole(c, ['admin']);
  const id = Number(c.req.param('id'));

  if (!Number.isInteger(id)) {
    throw new HTTPException(400, { message: 'Ungültige Charge.' });
  }

  const result = await c.env.DB.prepare(
    'DELETE FROM t_charges WHERE tenant_id = ? AND id = ?'
  )
    .bind(auth.tenantId, id)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new HTTPException(404, { message: 'Charge wurde nicht gefunden — eventuell bereits gelöscht.' });
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
    throw new HTTPException(400, { message: 'Ungültige Rolle — erlaubt sind reader, editor oder admin.' });
  }

  const user = await c.env.DB.prepare('SELECT id FROM app_users WHERE user_oid = ?')
    .bind(oid)
    .first<{ id: number }>();

  if (!user) {
    throw new HTTPException(404, { message: 'Benutzer wurde in diesem Mandanten nicht gefunden.' });
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
    'SELECT product_identifier, article_name FROM t_articles WHERE tenant_id = ? ORDER BY product_identifier ASC'
  )
    .bind(auth.tenantId)
    .all<{ product_identifier: string | null; article_name: string }>();

  const csv = [
    'Artikelnummer,Bezeichnung',
    ...(rows.results ?? []).map(
      (r) => `${r.product_identifier ?? ''},"${r.article_name.replace(/"/g, '""')}"`
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
    `SELECT a.product_identifier, a.article_name, c.charge_id, c.good_to, c.first_delivery, c.last_delivery
     FROM t_charges c
     INNER JOIN t_articles a ON a.tenant_id = c.tenant_id AND a.n_article = c.n_article
     WHERE c.tenant_id = ?
       AND (? = '' OR c.charge_id LIKE '%' || ? || '%'
            OR a.product_identifier LIKE '%' || ? || '%'
            OR a.article_name LIKE '%' || ? || '%')
     ORDER BY COALESCE(c.first_delivery, '') DESC, c.id DESC`
  )
    .bind(auth.tenantId, q, q, q, q)
    .all<Record<string, string>>();

  const esc = (s: string | null | undefined) => `"${(s ?? '').replace(/"/g, '""')}"`;
  const csv = [
    'Artikelnummer,Bezeichnung,Chargennummer,MHD,Erste Auslieferung,Letzte Auslieferung',
    ...(rows.results ?? []).map(
      (r) =>
        `${r.product_identifier ?? ''},${esc(r.article_name)},${esc(r.charge_id)},${r.good_to ?? ''},${r.first_delivery ?? ''},${r.last_delivery ?? ''}`
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
