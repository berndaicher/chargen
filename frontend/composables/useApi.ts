export type Role = 'reader' | 'editor' | 'admin';

export interface Article {
  n_article: number;
  article_name: string;
}

export interface Charge {
  n_charge: number;
  n_article: number;
  charge_id: string;
  good_to: string | null;
  first_delivery: string | null;
  last_delivery: string | null;
  article_name: string;
}

export interface MeResponse {
  tenantId: number;
  tenantExternalId: string;
  userOid: string;
  role: Role;
}

export interface TenantUser {
  user_oid: string;
  email: string | null;
  display_name: string | null;
  role: Role;
}

export function useApi() {
  const { accessToken } = useAuth();
  const config = useRuntimeConfig();

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!accessToken.value) {
      throw new Error('Not authenticated');
    }

    return $fetch<T>(config.public.apiBaseUrl + path, {
      method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken.value}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  }

  async function download(path: string, filename: string) {
    if (!accessToken.value) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(config.public.apiBaseUrl + path, {
      headers: { Authorization: `Bearer ${accessToken.value}` }
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    me: () => call<MeResponse>('GET', '/me'),
    getArticles: (q?: string) => call<Article[]>('GET', `/articles?q=${encodeURIComponent(q ?? '')}`),
    createArticle: (a: Omit<Article, never>) => call<{ ok: boolean }>('POST', '/articles', a),
    updateArticle: (nArticle: number, article_name: string) =>
      call<{ ok: boolean }>('PUT', `/articles/${nArticle}`, { article_name }),
    deleteArticle: (nArticle: number) => call<{ ok: boolean }>('DELETE', `/articles/${nArticle}`),
    exportArticles: () => download('/articles/export', 'artikel.csv'),

    getCharges: (q?: string) => call<Charge[]>('GET', `/charges?q=${encodeURIComponent(q ?? '')}`),
    createCharge: (c: Omit<Charge, 'n_charge' | 'article_name'>) =>
      call<{ ok: boolean }>('POST', '/charges', c),
    updateCharge: (
      chargeId: string,
      payload: { n_article: number; new_charge_id?: string; good_to?: string | null; first_delivery?: string | null; last_delivery?: string | null }
    ) => call<{ ok: boolean }>('PUT', `/charges/${encodeURIComponent(chargeId)}`, payload),
    deleteCharge: (chargeId: string) =>
      call<{ ok: boolean }>('DELETE', `/charges/${encodeURIComponent(chargeId)}`),
    exportCharges: (q?: string) =>
      download(`/charges/export?q=${encodeURIComponent(q ?? '')}`, 'chargen.csv'),

    getUsers: () => call<TenantUser[]>('GET', '/users'),
    setUserRole: (oid: string, role: Role) =>
      call<{ ok: boolean }>('PUT', `/users/${oid}/role`, { role })
  };
}
