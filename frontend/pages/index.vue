<script setup lang="ts">
import type { Article, Charge, MeResponse, Role } from '~/composables/useApi';
import { downloadCSV, downloadPDFReport } from '~/composables/useApi';

const { account, accessToken, signIn, signOut } = useAuth();
const api = useApi();

// ─── Date format helpers (ISO ↔ dd.mm.yyyy) ──────────────────────────────────
function isoToDE(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}
function deToISO(de: string): string | null {
  if (!de) return null;
  const m = de.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// ─── Auth / Role ─────────────────────────────────────────────────────────────
const me = ref<MeResponse | null>(null);
const role = computed<Role>(() => me.value?.role ?? 'reader');
const canWrite = computed(() => role.value === 'editor' || role.value === 'admin');
const canAdmin = computed(() => role.value === 'admin');

// ─── Articles ─────────────────────────────────────────────────────────────────
const articles = ref<Article[]>([]);
const articleFilter = ref('');
const selectedArticle = ref<Article | null>(null);
const articleLoading = ref(false);
const articleError = ref('');
const articleHasMore = ref(true);
const articleLoadingMore = ref(false);
const PAGE_SIZE = 100;

type ArticleSortKey = 'product_identifier' | 'article_name';
const articleSortKey = ref<ArticleSortKey>('product_identifier');
const articleSortAsc = ref(true);

const sortedArticles = computed(() => {
  const key = articleSortKey.value;
  const dir = articleSortAsc.value ? 1 : -1;
  return [...articles.value].sort((a, b) => {
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), 'de', { numeric: true }) * dir;
  });
});

function toggleArticleSort(key: ArticleSortKey) {
  if (articleSortKey.value === key) {
    articleSortAsc.value = !articleSortAsc.value;
  } else {
    articleSortKey.value = key;
    articleSortAsc.value = true;
  }
  articleSortLock = true;
  nextTick(() => { articleSortLock = false; });
}

function sortIcon(key: ArticleSortKey) {
  if (articleSortKey.value !== key) return '⇅';
  return articleSortAsc.value ? '↑' : '↓';
}

async function loadArticles() {
  articleLoading.value = true;
  articleError.value = '';
  try {
    const rows = await api.getArticles(articleFilter.value, PAGE_SIZE, 0);
    articles.value = rows;
    articleHasMore.value = rows.length >= PAGE_SIZE;
  } catch (e) {
    articleError.value = String((e as Error).message);
  } finally {
    articleLoading.value = false;
  }
}

async function loadMoreArticles() {
  if (articleLoadingMore.value || !articleHasMore.value) return;
  articleLoadingMore.value = true;
  try {
    const rows = await api.getArticles(articleFilter.value, PAGE_SIZE, articles.value.length);
    articles.value.push(...rows);
    articleHasMore.value = rows.length >= PAGE_SIZE;
  } catch { /* ignore */ } finally {
    articleLoadingMore.value = false;
  }
}

let articleSortLock = false;

function onArticleScroll(e: Event) {
  if (articleSortLock) return;
  const el = e.target as HTMLElement;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
    loadMoreArticles();
  }
}

function selectArticle(a: Article) {
  selectedArticle.value = selectedArticle.value?.n_article === a.n_article ? null : a;
  loadCharges();
}

// ─── Article Modal ────────────────────────────────────────────────────────────
const articleDialog = ref<HTMLDialogElement | null>(null);
const articleForm = reactive({ n_article: 0, product_identifier: '', article_name: '', isEdit: false });
const articleSaving = ref(false);
const articleFormError = ref('');

function openNewArticle() {
  articleForm.n_article = 0;
  articleForm.product_identifier = '';
  articleForm.article_name = '';
  articleForm.isEdit = false;
  articleFormError.value = '';
  articleDialog.value?.showModal();
}

function openEditArticle(a: Article) {
  articleForm.n_article = a.n_article;
  articleForm.product_identifier = a.product_identifier ?? '';
  articleForm.article_name = a.article_name;
  articleForm.isEdit = true;
  articleFormError.value = '';
  articleDialog.value?.showModal();
}

async function saveArticle() {
  const pid = articleForm.product_identifier.trim();
  const name = articleForm.article_name.trim();
  if (!pid) {
    articleFormError.value = 'Art. Nr. darf nicht leer sein.';
    return;
  }
  if (!name) {
    articleFormError.value = 'Bezeichnung darf nicht leer sein.';
    return;
  }
  const duplicate = articles.value.find(
    (a) => a.product_identifier === pid && (!articleForm.isEdit || a.n_article !== articleForm.n_article)
  );
  if (duplicate) {
    articleFormError.value = `Art. Nr. "${pid}" existiert bereits.`;
    return;
  }
  articleSaving.value = true;
  articleFormError.value = '';
  try {
    if (articleForm.isEdit) {
      await api.updateArticle(articleForm.n_article, { product_identifier: pid, article_name: name });
    } else {
      await api.createArticle({ product_identifier: pid, article_name: name });
    }
    articleDialog.value?.close();
    await loadArticles();
    if (selectedArticle.value !== null) {
      await loadCharges();
    }
  } catch (e) {
    articleFormError.value = String((e as Error).message);
  } finally {
    articleSaving.value = false;
  }
}

async function deleteArticle(a: Article) {
  if (!confirm(`Artikel ${a.product_identifier ?? a.n_article} (${a.article_name}) wirklich löschen?\nAlle zugehörigen Chargen werden ebenfalls gelöscht.`)) return;
  try {
    await api.deleteArticle(a.n_article);
    if (selectedArticle.value?.n_article === a.n_article) selectedArticle.value = null;
    await loadArticles();
    await loadCharges();
  } catch (e) {
    alert(String((e as Error).message));
  }
}

// ─── Charges ─────────────────────────────────────────────────────────────────
const charges = ref<Charge[]>([]);
const chargeFilter = ref('');
const chargeLoading = ref(false);
const chargeError = ref('');
const chargeHasMore = ref(true);
const chargeLoadingMore = ref(false);

type ChargeSortKey = 'charge_id' | 'product_identifier' | 'article_name' | 'good_to' | 'first_delivery' | 'last_delivery';
const chargeSortKey = ref<ChargeSortKey>('first_delivery');
const chargeSortAsc = ref(false);

const displayedCharges = computed(() => {
  const result = [...charges.value];
  const key = chargeSortKey.value;
  const dir = chargeSortAsc.value ? 1 : -1;
  return result.sort((a, b) => {
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), 'de', { numeric: true }) * dir;
  });
});

function toggleChargeSort(key: typeof chargeSortKey.value) {
  if (chargeSortKey.value === key) {
    chargeSortAsc.value = !chargeSortAsc.value;
  } else {
    chargeSortKey.value = key;
    chargeSortAsc.value = true;
  }
  // Prevent scroll handler from triggering loadMore after re-sort
  chargeSortLock = true;
  nextTick(() => { chargeSortLock = false; });
}

function chargeSortIcon(key: typeof chargeSortKey.value) {
  if (chargeSortKey.value !== key) return '⇅';
  return chargeSortAsc.value ? '↑' : '↓';
}

async function loadCharges() {
  chargeLoading.value = true;
  chargeError.value = '';
  try {
    const rows = await api.getCharges(
      chargeFilter.value,
      selectedArticle.value?.n_article,
      PAGE_SIZE,
      0
    );
    charges.value = rows;
    chargeHasMore.value = rows.length >= PAGE_SIZE;
  } catch (e) {
    chargeError.value = String((e as Error).message);
  } finally {
    chargeLoading.value = false;
  }
}

async function loadMoreCharges() {
  if (chargeLoadingMore.value || !chargeHasMore.value) return;
  chargeLoadingMore.value = true;
  try {
    const rows = await api.getCharges(
      chargeFilter.value,
      selectedArticle.value?.n_article,
      PAGE_SIZE,
      charges.value.length
    );
    charges.value.push(...rows);
    chargeHasMore.value = rows.length >= PAGE_SIZE;
  } catch { /* ignore */ } finally {
    chargeLoadingMore.value = false;
  }
}

let chargeSortLock = false;

function onChargeScroll(e: Event) {
  if (chargeSortLock) return;
  const el = e.target as HTMLElement;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
    loadMoreCharges();
  }
}

// ─── Charge Modal ─────────────────────────────────────────────────────────────
const chargeDialog = ref<HTMLDialogElement | null>(null);
const chargeForm = reactive({
  id: null as number | null,
  n_article: '' as string | number,
  charge_id: '',
  good_to: '',
  first_delivery: '',
  last_delivery: '',
  isEdit: false
});
const chargeSaving = ref(false);
const chargeFormError = ref('');

const articleSearch = ref('');
const articleDropdownOpen = ref(false);
const articleDropdownRef = ref<HTMLDivElement | null>(null);
const articleOptions = ref<Article[]>([]);
const articleOptionsLoading = ref(false);
let articleSearchTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchArticleOptions(q: string) {
  articleOptionsLoading.value = true;
  try {
    articleOptions.value = await api.getArticles(q || undefined, 500);
  } catch { /* ignore */ }
  articleOptionsLoading.value = false;
}

const filteredArticleOptions = computed(() => articleOptions.value);

function onArticleSearchInput() {
  articleDropdownOpen.value = true;
  if (articleSearchTimer) clearTimeout(articleSearchTimer);
  articleSearchTimer = setTimeout(() => {
    const q = articleSearch.value.trim();
    // Don't search if user picked a formatted option like "123 — Name"
    if (q.includes(' — ')) return;
    fetchArticleOptions(q);
  }, 250);
}

function articleDisplay(a: Article): string {
  return `${a.product_identifier ?? ''} — ${a.article_name}`;
}

function openArticleDropdown() {
  articleDropdownOpen.value = true;
  articleSearch.value = '';
  if (chargeForm.n_article) {
    const a = articleOptions.value.find((x) => x.n_article === chargeForm.n_article)
      ?? articles.value.find((x) => x.n_article === chargeForm.n_article);
    if (a) articleSearch.value = articleDisplay(a);
  }
  fetchArticleOptions('');
}

function selectArticleOption(a: Article) {
  chargeForm.n_article = a.n_article;
  articleSearch.value = articleDisplay(a);
  articleDropdownOpen.value = false;
}

function onArticleInput() {
  onArticleSearchInput();
}

function onArticleBlur() {
  setTimeout(() => {
    articleDropdownOpen.value = false;
    if (chargeForm.n_article) {
      const a = articleOptions.value.find((x) => x.n_article === chargeForm.n_article)
        ?? articles.value.find((x) => x.n_article === chargeForm.n_article);
      if (a) articleSearch.value = articleDisplay(a);
    }
  }, 150);
}

function openNewCharge(article?: Article) {
  const target = article ?? selectedArticle.value;
  if (target) {
    selectedArticle.value = target;
    chargeForm.n_article = target.n_article;
    const a = articleOptions.value.find((x) => x.n_article === target.n_article)
      ?? articles.value.find((x) => x.n_article === target.n_article)
      ?? target;
    articleSearch.value = articleDisplay(a);
  } else {
    chargeForm.n_article = '';
    articleSearch.value = '';
  }
  chargeForm.charge_id = '';
  chargeForm.good_to = '';
  chargeForm.first_delivery = '';
  chargeForm.last_delivery = '';
  chargeForm.isEdit = false;
  chargeForm.id = null;
  chargeFormError.value = '';
  chargeDialog.value?.showModal();
}

function openEditCharge(c: Charge) {
  chargeForm.id = c.id;
  chargeForm.n_article = c.n_article;
  const a = articles.value.find((x) => x.n_article === c.n_article);
  articleSearch.value = a ? articleDisplay(a) : (c.product_identifier ?? String(c.n_article));
  chargeForm.charge_id = c.charge_id;
  chargeForm.good_to = isoToDE(c.good_to);
  chargeForm.first_delivery = isoToDE(c.first_delivery);
  chargeForm.last_delivery = isoToDE(c.last_delivery);
  chargeForm.isEdit = true;
  chargeFormError.value = '';
  chargeDialog.value?.showModal();
}

async function saveCharge() {
  const nArticle = Number(chargeForm.n_article);
  if (!Number.isInteger(nArticle) || nArticle <= 0) {
    chargeFormError.value = 'Bitte einen gültigen Artikel auswählen.';
    return;
  }
  const newId = chargeForm.charge_id.trim();
  if (!newId) {
    chargeFormError.value = 'Losnummer darf nicht leer sein.';
    return;
  }
  const duplicate = charges.value.find(
    (c) =>
      c.n_article === nArticle &&
      c.charge_id.toLowerCase() === newId.toLowerCase() &&
      c.id !== chargeForm.id
  );
  if (duplicate) {
    chargeFormError.value = `Losnummer "${newId}" ist für diesen Artikel bereits vergeben.`;
    return;
  }
  chargeSaving.value = true;
  chargeFormError.value = '';
  try {
    if (chargeForm.isEdit && chargeForm.id != null) {
      await api.updateCharge(chargeForm.id, {
        n_article: nArticle,
        charge_id: newId,
        good_to: deToISO(chargeForm.good_to),
        first_delivery: deToISO(chargeForm.first_delivery),
        last_delivery: deToISO(chargeForm.last_delivery)
      });
    } else {
      await api.createCharge({
        n_article: nArticle,
        charge_id: newId,
        good_to: deToISO(chargeForm.good_to),
        first_delivery: deToISO(chargeForm.first_delivery),
        last_delivery: deToISO(chargeForm.last_delivery)
      });
    }
    chargeDialog.value?.close();
    await loadCharges();
  } catch (e) {
    chargeFormError.value = String((e as Error).message);
  } finally {
    chargeSaving.value = false;
  }
}

async function deleteCharge(c: Charge) {
  if (!confirm(`Charge ${c.charge_id} wirklich löschen?`)) return;
  try {
    await api.deleteCharge(c.id);
    await loadCharges();
  } catch (e) {
    alert(String((e as Error).message));
  }
}

function formatDate(val: string | null): string {
  if (!val) return '—';
  const d = val.split('T')[0].split(' ')[0];
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return val;
}

function exportArticlesCSV() {
  const rows = sortedArticles.value.map(a => ({
    Artikelnummer: a.product_identifier ?? '',
    Bezeichnung: a.article_name
  }));
  downloadCSV(rows, 'artikel.csv');
}

function exportChargesCSV() {
  const rows = displayedCharges.value.map(c => ({
    Artikelnummer: c.product_identifier ?? '',
    Bezeichnung: c.article_name,
    Chargennummer: c.charge_id,
    MHD: formatDate(c.good_to),
    'Erste Auslieferung': formatDate(c.first_delivery),
    'Letzte Auslieferung': formatDate(c.last_delivery)
  }));
  downloadCSV(rows, 'chargen.csv');
}

function exportPDFReport() {
  downloadPDFReport(articles.value, charges.value, selectedArticle.value);
}

async function printArticleList() {
  // Load all articles from server (not just paginated subset)
  let allArticles: Article[] = [];
  let offset = 0;
  const batchSize = 500;
  while (true) {
    const batch = await api.getArticles(articleFilter.value || undefined, batchSize, offset);
    allArticles = allArticles.concat(batch);
    if (batch.length < batchSize) break;
    offset += batchSize;
  }

  const w = window.open('', '_blank');
  if (!w) { alert('Bitte Popup-Blocker für diese Seite deaktivieren.'); return; }

  const escHtml = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let rows = '';
  for (const a of allArticles) {
    rows += `<tr><td>${escHtml(a.product_identifier ?? '')}</td><td>${escHtml(a.article_name)}</td></tr>\n`;
  }

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Artikelliste</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Verdana, sans-serif; margin: 24px; color: #1b1f24; }
  h1 { font-size: 1.4rem; margin-bottom: 4px; color: #283F37; }
  .meta { font-size: 0.8rem; color: #5b6470; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { border: 1px solid #d9e1e6; padding: 6px 10px; text-align: left; }
  th { background: #f4f7f8; font-weight: 600; }
  tr:nth-child(even) { background: #fafcfc; }
  @media print { body { margin: 0; } .no-print { display: none; } @page { margin: 15mm; } }
</style></head><body>
<button class="no-print" onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;cursor:pointer;background:#283F37;color:#fff;border:none;border-radius:6px;font-weight:600;">🖨 Drucken / PDF speichern</button>
<h1>Artikelliste</h1>
<p class="meta">Erstellt am ${new Date().toLocaleDateString('de-AT')} · ${allArticles.length} Artikel</p>
<table>
<thead><tr><th style="width:100px">Art. Nr</th><th>Bezeichnung</th></tr></thead>
<tbody>${rows || '<tr><td colspan="2">Keine Artikel</td></tr>'}</tbody>
</table>
</body></html>`);
  w.document.close();
}

async function printChargeList() {
  // Load all charges from server (not just paginated subset)
  let allCharges: Charge[] = [];
  let offset = 0;
  const batchSize = 500;
  const nArticle = selectedArticle.value?.n_article;
  while (true) {
    const batch = await api.getCharges(chargeFilter.value || undefined, nArticle, batchSize, offset);
    allCharges = allCharges.concat(batch);
    if (batch.length < batchSize) break;
    offset += batchSize;
  }

  const w = window.open('', '_blank');
  if (!w) { alert('Bitte Popup-Blocker für diese Seite deaktivieren.'); return; }

  const fmtDate = (v: string | null) => {
    if (!v) return '—';
    const d = v.split('T')[0].split(' ')[0];
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : v;
  };
  const e = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let rows = '';
  for (const c of allCharges) {
    rows += `<tr><td>${e(c.product_identifier ?? '')}</td><td>${e(c.article_name)}</td><td>${e(c.charge_id)}</td><td>${fmtDate(c.good_to)}</td><td>${fmtDate(c.first_delivery)}</td><td>${fmtDate(c.last_delivery)}</td></tr>\n`;
  }

  const subtitle = selectedArticle.value
    ? ` — Artikel ${e(selectedArticle.value.product_identifier ?? '')} (${e(selectedArticle.value.article_name)})`
    : '';

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Chargenliste</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Verdana, sans-serif; margin: 24px; color: #1b1f24; }
  h1 { font-size: 1.4rem; margin-bottom: 4px; color: #283F37; }
  .meta { font-size: 0.8rem; color: #5b6470; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { border: 1px solid #d9e1e6; padding: 5px 8px; text-align: left; }
  th { background: #f4f7f8; font-weight: 600; }
  tr:nth-child(even) { background: #fafcfc; }
  @media print { body { margin: 0; } .no-print { display: none; } @page { margin: 15mm; } }
</style></head><body>
<button class="no-print" onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;cursor:pointer;background:#283F37;color:#fff;border:none;border-radius:6px;font-weight:600;">🖨 Drucken / PDF speichern</button>
<h1>Chargenliste${subtitle}</h1>
<p class="meta">Erstellt am ${new Date().toLocaleDateString('de-AT')} · ${allCharges.length} Chargen</p>
<table>
<thead><tr><th>Art. Nr</th><th>Bezeichnung</th><th>Chrg. Nr</th><th>MHD</th><th>Erste Ausl.</th><th>Letzte Ausl.</th></tr></thead>
<tbody>${rows || '<tr><td colspan="6">Keine Chargen</td></tr>'}</tbody>
</table>
</body></html>`);
  w.document.close();
}

// ─── Panel collapse ──────────────────────────────────────────────────────────
const articlesCollapsed = ref(false);

// ─── Panel resize ────────────────────────────────────────────────────────────
const articlesPanelWidth = ref(420);

function startPanelResize(e: MouseEvent) {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = articlesPanelWidth.value;

  function onMove(ev: MouseEvent) {
    const delta = ev.clientX - startX;
    articlesPanelWidth.value = Math.max(200, Math.min(800, startWidth + delta));
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

// ─── Column resize ───────────────────────────────────────────────────────────
type ColWidths = Record<string, number>;

const articleColWidths = ref<ColWidths>({ 'col-art-nr': 70, 'col-art-name': 200, 'col-art-actions': 80 });
const chargeColWidths = ref<ColWidths>({ 'col-chg-nr': 70, 'col-chg-name': 220, 'col-chg-id': 110, 'col-chg-mhd': 100, 'col-chg-first': 110, 'col-chg-last': 110, 'col-chg-actions': 70 });

function startResize(table: 'article' | 'charge', colKey: string, e: MouseEvent) {
  e.preventDefault();
  const startX = e.clientX;
  const widths = table === 'article' ? articleColWidths.value : chargeColWidths.value;
  const startWidth = widths[colKey] ?? 60;

  function onMove(ev: MouseEvent) {
    const delta = ev.clientX - startX;
    widths[colKey] = Math.max(40, startWidth + delta);
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function init() {
  if (!accessToken.value) return;
  try {
    me.value = await api.me();
  } catch { /* not yet authenticated */ }
  await Promise.all([loadArticles(), loadCharges()]);
}

onMounted(init);
watch(accessToken, init);
</script>

<template>
  <div v-if="!account" class="container" style="padding-top: 80px; text-align: center;">
    <div class="card" style="max-width: 400px; margin: 0 auto;">
      <h2>Chargenrückverfolgung</h2>
      <p class="muted">Bitte mit Microsoft 365 Konto anmelden.</p>
      <button @click="signIn" style="width: 100%;">Mit Microsoft 365 anmelden</button>
    </div>
  </div>

  <div v-else class="main-layout">
    <!-- Articles Panel (left, collapsible) -->
    <section class="panel panel--articles" :class="{ 'panel--collapsed': articlesCollapsed }" :style="articlesCollapsed ? '' : { width: articlesPanelWidth + 'px', flex: 'none' }">
      <div class="panel-header">
        <span class="collapsed-label" v-show="articlesCollapsed">
          <span class="collapsed-arrows">◀</span>
          <span class="collapsed-text">Artikel</span>
          <span class="collapsed-arrows">▶</span>
        </span>
        <h2 v-show="!articlesCollapsed">Artikel</h2>
        <div class="panel-actions">
          <template v-if="!articlesCollapsed">
            <button v-if="canWrite" @click="openNewArticle" class="btn-sm">+ Neu</button>
            <button class="btn-sm secondary" @click="exportArticlesCSV()" title="CSV exportieren">↓ CSV</button>
            <button class="btn-sm secondary" @click="printArticleList()" title="Artikelliste drucken">🖨 Drucken</button>
          </template>
          <button class="btn-sm icon-btn" @click="articlesCollapsed = !articlesCollapsed" :title="articlesCollapsed ? 'Aufklappen' : 'Einklappen'">
            {{ articlesCollapsed ? '▶' : '◀' }}
          </button>
        </div>
      </div>
      <div v-if="!articlesCollapsed" class="panel-body">
        <div class="panel-search">
          <input v-model="articleFilter" placeholder="Nr. oder Bezeichnung…" class="search-input" @keyup.enter="loadArticles" />
          <button @click="loadArticles" class="btn-sm">Suchen</button>
        </div>
        <p v-if="articleError" class="error">{{ articleError }}</p>
        <div class="table-scroll" @scroll="onArticleScroll">
          <table>
            <colgroup>
              <col :style="{ width: articleColWidths['col-art-nr'] + 'px' }">
              <col :style="{ width: articleColWidths['col-art-name'] + 'px' }">
              <col :style="{ width: articleColWidths['col-art-actions'] + 'px' }">
            </colgroup>
            <thead>
              <tr>
                <th class="sortable col-art-nr" @click="toggleArticleSort('product_identifier')">
                  Art. Nr <span class="sort-icon">{{ sortIcon('product_identifier') }}</span>
                  <div class="col-resize" @mousedown="startResize('article', 'col-art-nr', $event)"></div>
                </th>
                <th class="sortable col-art-name" @click="toggleArticleSort('article_name')">
                  Bezeichnung <span class="sort-icon">{{ sortIcon('article_name') }}</span>
                  <div class="col-resize" @mousedown="startResize('article', 'col-art-name', $event)"></div>
                </th>
                <th v-if="canWrite" class="col-actions col-art-actions"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="articleLoading"><td colspan="3" class="muted" style="padding: 12px;">Laden…</td></tr>
              <tr v-else-if="sortedArticles.length === 0"><td colspan="3" class="muted" style="padding: 12px;">Keine Artikel gefunden.</td></tr>
              <tr
                v-for="a in sortedArticles" :key="a.n_article"
                :class="{ 'row-selected': selectedArticle?.n_article === a.n_article }"
                @click="selectArticle(a)"
                class="clickable-row"
              >
                <td>{{ a.product_identifier }}</td>
                <td>{{ a.article_name }}</td>
                <td v-if="canWrite" class="actions" @click.stop>
                  <button @click="openNewCharge(a)" class="action-btn" title="Charge zu diesem Artikel erfassen">＋</button>
                  <button @click="openEditArticle(a)" class="action-btn" title="Bearbeiten">✎</button>
                  <button v-if="canAdmin" @click="deleteArticle(a)" class="action-btn danger" title="Löschen">✕</button>
                </td>
              </tr>
              <tr v-if="articleLoadingMore"><td colspan="3" class="muted" style="padding: 12px; text-align: center;">Weitere laden…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Panel resize handle -->
    <div v-show="!articlesCollapsed" class="panel-resize-handle" @mousedown="startPanelResize"></div>

    <!-- Charges Panel (right, wide) -->
    <section class="panel panel--charges">
      <div class="panel-header">
        <h2>
          Chargen
          <span v-if="selectedArticle" class="filter-badge">
            · {{ selectedArticle.product_identifier }} — {{ selectedArticle.article_name }}
            <button class="clear-filter" @click="selectedArticle = null; loadCharges();" title="Filter aufheben">✕</button>
          </span>
        </h2>
        <div class="panel-actions">
          <button v-if="canWrite" @click="openNewCharge()" class="btn-sm">+ Neu</button>
          <button class="btn-sm secondary" @click="exportChargesCSV()" title="CSV exportieren">↓ CSV</button>
          <button class="btn-sm secondary" @click="printChargeList()" title="Chargenliste drucken">🖨 Drucken</button>
          <button class="btn-sm secondary" @click="exportPDFReport()" title="PDF Report">📄 Report</button>
        </div>
      </div>
      <div class="panel-search">
        <input v-model="chargeFilter" placeholder="Suche Chargennummer…" class="search-input" @keyup.enter="loadCharges" />
        <button @click="loadCharges" class="btn-sm">Suchen</button>
      </div>
      <p v-if="chargeError" class="error">{{ chargeError }}</p>
      <div class="table-scroll" @scroll="onChargeScroll">
        <table>
          <colgroup>
            <col :style="{ width: chargeColWidths['col-chg-nr'] + 'px' }">
            <col :style="{ width: chargeColWidths['col-chg-name'] + 'px' }">
            <col :style="{ width: chargeColWidths['col-chg-id'] + 'px' }">
            <col :style="{ width: chargeColWidths['col-chg-mhd'] + 'px' }">
            <col :style="{ width: chargeColWidths['col-chg-first'] + 'px' }">
            <col :style="{ width: chargeColWidths['col-chg-last'] + 'px' }">
            <col :style="{ width: chargeColWidths['col-chg-actions'] + 'px' }">
          </colgroup>
          <thead>
            <tr>
              <th class="sortable col-chg-nr" @click="toggleChargeSort('product_identifier')">
                Art. Nr <span class="sort-icon">{{ chargeSortIcon('product_identifier') }}</span>
                <div class="col-resize" @mousedown="startResize('charge', 'col-chg-nr', $event)"></div>
              </th>
              <th class="sortable col-chg-name" @click="toggleChargeSort('article_name')">
                Bezeichnung <span class="sort-icon">{{ chargeSortIcon('article_name') }}</span>
                <div class="col-resize" @mousedown="startResize('charge', 'col-chg-name', $event)"></div>
              </th>
              <th class="sortable col-chg-id" @click="toggleChargeSort('charge_id')">
                Chrg. Nr <span class="sort-icon">{{ chargeSortIcon('charge_id') }}</span>
                <div class="col-resize" @mousedown="startResize('charge', 'col-chg-id', $event)"></div>
              </th>
              <th class="sortable col-chg-mhd" @click="toggleChargeSort('good_to')">
                MHD <span class="sort-icon">{{ chargeSortIcon('good_to') }}</span>
                <div class="col-resize" @mousedown="startResize('charge', 'col-chg-mhd', $event)"></div>
              </th>
              <th class="sortable col-chg-first" @click="toggleChargeSort('first_delivery')">
                Erste Ausl. <span class="sort-icon">{{ chargeSortIcon('first_delivery') }}</span>
                <div class="col-resize" @mousedown="startResize('charge', 'col-chg-first', $event)"></div>
              </th>
              <th class="sortable col-chg-last" @click="toggleChargeSort('last_delivery')">
                Letzte Ausl. <span class="sort-icon">{{ chargeSortIcon('last_delivery') }}</span>
                <div class="col-resize" @mousedown="startResize('charge', 'col-chg-last', $event)"></div>
              </th>
              <th v-if="canWrite" class="col-actions col-chg-actions"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="chargeLoading"><td colspan="7" class="muted" style="padding: 12px;">Laden…</td></tr>
            <tr v-else-if="displayedCharges.length === 0"><td colspan="7" class="muted" style="padding: 12px;">Keine Chargen gefunden.</td></tr>
            <tr v-for="c in displayedCharges" :key="c.id">
              <td>{{ c.product_identifier }}</td>
              <td>{{ c.article_name }}</td>
              <td>{{ c.charge_id }}</td>
              <td>{{ formatDate(c.good_to) }}</td>
              <td>{{ formatDate(c.first_delivery) }}</td>
              <td>{{ formatDate(c.last_delivery) }}</td>
              <td v-if="canWrite" class="actions">
                <button @click="openEditCharge(c)" class="action-btn" title="Bearbeiten">✎</button>
                <button v-if="canAdmin" @click="deleteCharge(c)" class="action-btn danger" title="Löschen">✕</button>
              </td>
            </tr>
            <tr v-if="chargeLoadingMore"><td colspan="7" class="muted" style="padding: 12px; text-align: center;">Weitere laden…</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Article Modal -->
    <dialog ref="articleDialog" class="modal">
      <form method="dialog" @submit.prevent>
        <h3>{{ articleForm.isEdit ? 'Artikel bearbeiten' : 'Artikel anlegen' }}</h3>
        <label>
          Art. Nr.
          <input v-model="articleForm.product_identifier" type="text" placeholder="z. B. 1234" required />
        </label>
        <label>
          Bezeichnung
          <input v-model="articleForm.article_name" type="text" placeholder="Artikelname" required />
        </label>
        <p v-if="articleFormError" class="error">{{ articleFormError }}</p>
        <div class="row" style="justify-content: flex-end; margin-top: 12px;">
          <button type="button" class="secondary" @click="articleDialog?.close()">Abbrechen</button>
          <button type="button" @click="saveArticle" :disabled="articleSaving">
            {{ articleSaving ? 'Speichern…' : 'Speichern' }}
          </button>
        </div>
      </form>
    </dialog>

    <!-- Charge Modal -->
    <dialog ref="chargeDialog" class="modal modal--wide">
      <form method="dialog" @submit.prevent>
        <h3>{{ chargeForm.isEdit ? 'Charge bearbeiten' : 'Charge anlegen' }}</h3>
        <label>
          Artikel
          <div class="autocomplete-wrapper" ref="articleDropdownRef">
            <input
              v-model="articleSearch"
              type="text"
              placeholder="Artikel suchen…"
              @focus="openArticleDropdown"
              @input="onArticleInput"
              @blur="onArticleBlur"
              autocomplete="off"
            />
            <div v-if="articleDropdownOpen" class="autocomplete-dropdown">
              <div
                v-for="a in filteredArticleOptions"
                :key="a.n_article"
                class="autocomplete-item"
                @mousedown.prevent="selectArticleOption(a)"
              >
                <span class="autocomplete-num">{{ a.product_identifier }}</span>
                <span class="autocomplete-name">{{ a.article_name }}</span>
              </div>
              <div v-if="filteredArticleOptions.length === 0" class="autocomplete-empty">
                Keine Artikel gefunden
              </div>
            </div>
          </div>
        </label>
        <label>
          Chargennummer
          <input v-model="chargeForm.charge_id" type="text" placeholder="Chargen-ID" required />
        </label>
        <div class="form-row">
          <label>
            MHD
            <DateInput v-model="chargeForm.good_to" />
          </label>
          <label>
            Erste Auslieferung
            <DateInput v-model="chargeForm.first_delivery" />
          </label>
          <label>
            Letzte Auslieferung
            <DateInput v-model="chargeForm.last_delivery" />
          </label>
        </div>
        <p v-if="chargeFormError" class="error">{{ chargeFormError }}</p>
        <div class="row" style="justify-content: flex-end; margin-top: 12px;">
          <button type="button" class="secondary" @click="chargeDialog?.close()">Abbrechen</button>
          <button type="button" @click="saveCharge" :disabled="chargeSaving">
            {{ chargeSaving ? 'Speichern…' : 'Speichern' }}
          </button>
        </div>
      </form>
    </dialog>
  </div>
</template>
