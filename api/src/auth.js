import { createRemoteJWKSet, jwtVerify } from 'jose';
const GRAPH_ISSUER_PREFIX = 'https://login.microsoftonline.com/';
const jwksCache = new Map();
function getBearerToken(headerValue) {
    if (!headerValue || !headerValue.startsWith('Bearer ')) {
        throw new Error('Missing bearer token');
    }
    return headerValue.slice('Bearer '.length).trim();
}
function getJwksForTenant(tenantExternalId) {
    const key = tenantExternalId.toLowerCase();
    const cached = jwksCache.get(key);
    if (cached) {
        return cached;
    }
    const jwksUrl = new URL(`${GRAPH_ISSUER_PREFIX}${tenantExternalId}/discovery/v2.0/keys`);
    const jwks = createRemoteJWKSet(jwksUrl);
    jwksCache.set(key, jwks);
    return jwks;
}
export async function verifyEntraToken(c) {
    const token = getBearerToken(c.req.header('authorization'));
    const decodedPayload = JSON.parse(atob(token.split('.')[1] ?? ''));
    const tenantExternalId = decodedPayload.tid;
    if (!tenantExternalId) {
        throw new Error('Token does not include tenant id claim (tid)');
    }
    const issuer = `${GRAPH_ISSUER_PREFIX}${tenantExternalId}/v2.0`;
    const jwks = getJwksForTenant(tenantExternalId);
    const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: c.env.ENTRA_AUDIENCE
    });
    const userOid = String(payload.oid ?? '');
    if (!userOid) {
        throw new Error('Token does not include oid claim');
    }
    return {
        tenantExternalId,
        userOid,
        email: payload.preferred_username ? String(payload.preferred_username) : undefined,
        displayName: payload.name ? String(payload.name) : undefined
    };
}
