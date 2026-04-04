import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { verifyEntraToken } from './auth';
import { resolveRole, resolveTenant, upsertUser } from './db';
const app = new Hono();
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
        const auth = {
            tenantId: tenant.id,
            tenantExternalId: tenant.entra_tenant_id,
            userOid: identity.userOid,
            role
        };
        c.set('auth', auth);
        await next();
    }
    catch (error) {
        throw new HTTPException(401, { message: `Unauthorized: ${String(error.message)}` });
    }
});
function requireRole(c, allowed) {
    const auth = c.get('auth');
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
    const rows = await c.env.DB.prepare(`SELECT n_article, article_name
     FROM t_articles
     WHERE tenant_id = ?
       AND (? = '' OR CAST(n_article AS TEXT) LIKE '%' || ? || '%' OR article_name LIKE '%' || ? || '%')
     ORDER BY n_article ASC`)
        .bind(auth.tenantId, q, q, q)
        .all();
    return c.json(rows.results ?? []);
});
app.post('/articles', async (c) => {
    const auth = requireRole(c, ['editor', 'admin']);
    const body = await c.req.json();
    if (!Number.isInteger(body.n_article) || !body.article_name?.trim()) {
        throw new HTTPException(400, { message: 'Invalid article payload' });
    }
    await c.env.DB.prepare('INSERT INTO t_articles (tenant_id, n_article, article_name) VALUES (?, ?, ?)')
        .bind(auth.tenantId, body.n_article, body.article_name.trim())
        .run();
    return c.json({ ok: true }, 201);
});
app.get('/charges', async (c) => {
    const auth = requireRole(c, ['reader', 'editor', 'admin']);
    const q = (c.req.query('q') ?? '').trim();
    const rows = await c.env.DB.prepare(`SELECT c.n_charge, c.n_article, c.charge_id, c.good_to, c.first_delivery, c.last_delivery, a.article_name
     FROM t_charges c
     INNER JOIN t_articles a
       ON a.tenant_id = c.tenant_id AND a.n_article = c.n_article
     WHERE c.tenant_id = ?
       AND (? = '' OR c.charge_id LIKE '%' || ? || '%' OR CAST(c.n_article AS TEXT) LIKE '%' || ? || '%' OR a.article_name LIKE '%' || ? || '%')
     ORDER BY c.id DESC`)
        .bind(auth.tenantId, q, q, q, q)
        .all();
    return c.json(rows.results ?? []);
});
app.post('/charges', async (c) => {
    const auth = requireRole(c, ['editor', 'admin']);
    const body = await c.req.json();
    if (!Number.isInteger(body.n_article) || !body.charge_id?.trim()) {
        throw new HTTPException(400, { message: 'Invalid charge payload' });
    }
    await c.env.DB.prepare(`INSERT INTO t_charges
      (tenant_id, n_article, charge_id, good_to, first_delivery, last_delivery)
     VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(auth.tenantId, body.n_article, body.charge_id.trim(), body.good_to ?? null, body.first_delivery ?? null, body.last_delivery ?? null)
        .run();
    return c.json({ ok: true }, 201);
});
export default app;
