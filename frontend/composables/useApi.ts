export type Role = 'reader' | 'editor' | 'admin';

export interface Article {
  n_article: number;
  product_identifier: string;
  article_name: string;
}

export interface Charge {
  n_charge: number;
  n_article: number;
  product_identifier: string;
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

  return {
    me: () => call<MeResponse>('GET', '/me'),
    getArticles: (q?: string, limit?: number, offset?: number) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (limit != null) params.set('limit', String(limit));
      if (offset != null) params.set('offset', String(offset));
      return call<Article[]>('GET', `/articles?${params.toString()}`);
    },
    createArticle: (a: { product_identifier: string; article_name: string }) =>
      call<{ ok: boolean; n_article: number; product_identifier: string }>('POST', '/articles', a),
    updateArticle: (nArticle: number, payload: { product_identifier: string; article_name: string }) =>
      call<{ ok: boolean }>('PUT', `/articles/${nArticle}`, payload),
    deleteArticle: (nArticle: number) => call<{ ok: boolean }>('DELETE', `/articles/${nArticle}`),

    getCharges: (q?: string, nArticle?: number, limit?: number, offset?: number) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (nArticle != null) params.set('n_article', String(nArticle));
      if (limit != null) params.set('limit', String(limit));
      if (offset != null) params.set('offset', String(offset));
      return call<Charge[]>('GET', `/charges?${params.toString()}`);
    },
    createCharge: (c: Omit<Charge, 'n_charge' | 'article_name' | 'product_identifier'>) =>
      call<{ ok: boolean }>('POST', '/charges', c),
    updateCharge: (
      chargeId: string,
      payload: { n_article: number; new_charge_id?: string; good_to?: string | null; first_delivery?: string | null; last_delivery?: string | null }
    ) => call<{ ok: boolean }>('PUT', `/charges/${encodeURIComponent(chargeId)}`, payload),
    deleteCharge: (chargeId: string) =>
      call<{ ok: boolean }>('DELETE', `/charges/${encodeURIComponent(chargeId)}`),

    getUsers: () => call<TenantUser[]>('GET', '/users'),
    setUserRole: (oid: string, role: Role) =>
      call<{ ok: boolean }>('PUT', `/users/${oid}/role`, { role })
  };
}

export function downloadCSV(rows: Record<string, string | number | null>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => esc(r[h])).join(','))
  ].join('\r\n');

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPDFReport(articles: Article[], charges: Charge[], selectedArticle: Article | null) {
  const w = window.open('', '_blank');
  if (!w) { alert('Bitte Popup-Blocker für diese Seite deaktivieren.'); return; }

  const formatDate = (v: string | null) => {
    if (!v) return '—';
    const d = v.split('T')[0].split(' ')[0];
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : v;
  };

  const filteredCharges = selectedArticle
    ? charges.filter(c => c.n_article === selectedArticle.n_article)
    : charges;

  let chargesRows = '';
  for (const c of filteredCharges) {
    chargesRows += `<tr>
      <td>${esc(c.product_identifier ?? '')}</td>
      <td>${esc(c.article_name)}</td>
      <td>${esc(c.charge_id)}</td>
      <td>${formatDate(c.good_to)}</td>
      <td>${formatDate(c.first_delivery)}</td>
      <td>${formatDate(c.last_delivery)}</td>
    </tr>`;
  }

  let articlesRows = '';
  for (const a of articles) {
    articlesRows += `<tr><td>${esc(a.product_identifier ?? '')}</td><td>${esc(a.article_name)}</td></tr>`;
  }

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Chargenreport</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", sans-serif; margin: 24px; color: #1b1f24; }
  h1 { font-size: 1.3rem; margin-bottom: 4px; color: #0f6a64; }
  h2 { font-size: 1rem; margin: 24px 0 8px; color: #0f6a64; border-bottom: 2px solid #0f6a64; padding-bottom: 4px; }
  .meta { font-size: 0.85rem; color: #5b6470; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-bottom: 12px; }
  th, td { border: 1px solid #d9e1e6; padding: 5px 8px; text-align: left; }
  th { background: #f4f7f8; font-weight: 600; }
  tr:nth-child(even) { background: #fafcfc; }
  @media print { body { margin: 0; } .no-print { display: none; } }
</style></head><body>
<button class="no-print" onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;cursor:pointer;background:#0f6a64;color:#fff;border:none;border-radius:6px;font-weight:600;">🖨 Drucken / PDF speichern</button>
<h1>Chargenrückverfolgung — Report</h1>
<p class="meta">Erstellt am ${new Date().toLocaleDateString('de-AT')} · Mandant: bodner-getraenke.at</p>

<h2>Artikel (${articles.length})</h2>
<table><thead><tr><th>Art. Nr</th><th>Bezeichnung</th></tr></thead>
<tbody>${articlesRows || '<tr><td colspan="2">Keine Artikel</td></tr>'}</tbody></table>

<h2>Chargen (${filteredCharges.length})${selectedArticle ? ` — Artikel ${esc(selectedArticle.product_identifier ?? '')} (${esc(selectedArticle.article_name)})` : ''}</h2>
<table><thead><tr><th>Art. Nr</th><th>Bezeichnung</th><th>Chrg. Nr</th><th>MHD</th><th>Erste Ausl.</th><th>Letzte Ausl.</th></tr></thead>
<tbody>${chargesRows || '<tr><td colspan="6">Keine Chargen</td></tr>'}</tbody></table>

<script>function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}</script>
</body></html>`);
  w.document.close();
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
