export async function resolveTenant(env, identity) {
    const existing = await env.DB.prepare('SELECT id, entra_tenant_id FROM app_tenants WHERE entra_tenant_id = ?')
        .bind(identity.tenantExternalId)
        .first();
    if (existing) {
        return existing;
    }
    const insert = await env.DB.prepare('INSERT INTO app_tenants (entra_tenant_id, display_name) VALUES (?, ?)')
        .bind(identity.tenantExternalId, identity.tenantExternalId)
        .run();
    return {
        id: Number(insert.meta.last_row_id),
        entra_tenant_id: identity.tenantExternalId
    };
}
export async function upsertUser(env, identity) {
    await env.DB.prepare('INSERT INTO app_users (user_oid, email, display_name) VALUES (?, ?, ?) ON CONFLICT(user_oid) DO UPDATE SET email = excluded.email, display_name = excluded.display_name')
        .bind(identity.userOid, identity.email ?? null, identity.displayName ?? null)
        .run();
    const user = await env.DB.prepare('SELECT id FROM app_users WHERE user_oid = ?')
        .bind(identity.userOid)
        .first();
    if (!user) {
        throw new Error('Failed to resolve user');
    }
    return user;
}
export async function resolveRole(env, tenantId, userId) {
    const row = await env.DB.prepare('SELECT role FROM user_tenant_roles WHERE tenant_id = ? AND user_id = ?')
        .bind(tenantId, userId)
        .first();
    if (row) {
        return row.role;
    }
    // Initial bootstrap: first user in a tenant gets admin.
    await env.DB.prepare('INSERT INTO user_tenant_roles (tenant_id, user_id, role) VALUES (?, ?, ?)')
        .bind(tenantId, userId, 'admin')
        .run();
    return 'admin';
}
