<script setup lang="ts">
import type { Article, Charge, MeResponse, Role } from '~/composables/useApi';

const { account, accessToken, signIn, signOut } = useAuth();
const api = useApi();

// ─── Auth / Role ─────────────────────────────────────────────────────────────
const me = ref<MeResponse | null>(null);
const role = computed<Role>(() => me.value?.role ?? 'reader');
const canWrite = computed(() => role.value === 'editor' || role.value === 'admin');
const canAdmin = computed(() => role.value === 'admin');

// ─── Articles ─────────────────────────────────────────────────────────────────
const articles = ref<Article[]>([]);
const articleFilter = ref('');
const selectedArticle = ref<number | null>(null);
const articleLoading = ref(false);
const articleError = ref('');

async function loadArticles() {
  articleLoading.value = true;
  articleError.value = '';
  try {
    articles.value = await api.getArticles(articleFilter.value);
  } catch (e) {
    articleError.value = String((e as Error).message);
  } finally {
    articleLoading.value = false;
  }
}

function selectArticle(nArticle: number) {
  selectedArticle.value = selectedArticle.value === nArticle ? null : nArticle;
  chargeFilter.value = '';
  loadCharges();
}

// ─── Article Modal ────────────────────────────────────────────────────────────
const articleDialog = ref<HTMLDialogElement | null>(null);
const articleForm = reactive({ n_article: '' as string | number, article_name: '', isEdit: false });
const articleSaving = ref(false);
const articleFormError = ref('');

function openNewArticle() {
  articleForm.n_article = '';
  articleForm.article_name = '';
  articleForm.isEdit = false;
  articleFormError.value = '';
  articleDialog.value?.showModal();
}

function openEditArticle(a: Article) {
  articleForm.n_article = a.n_article;
  articleForm.article_name = a.article_name;
  articleForm.isEdit = true;
  articleFormError.value = '';
  articleDialog.value?.showModal();
}

async function saveArticle() {
  const nArticle = Number(articleForm.n_article);
  if (!Number.isInteger(nArticle) || nArticle <= 0 || !articleForm.article_name.trim()) {
    articleFormError.value = 'Artikelnummer (Ganzzahl) und Bezeichnung sind Pflichtfelder.';
    return;
  }
  articleSaving.value = true;
  articleFormError.value = '';
  try {
    if (articleForm.isEdit) {
      await api.updateArticle(nArticle, articleForm.article_name.trim());
    } else {
      await api.createArticle({ n_article: nArticle, article_name: articleForm.article_name.trim() });
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
  if (!confirm(`Artikel ${a.n_article} (${a.article_name}) wirklich löschen?\nAlle zugehörigen Chargen werden ebenfalls gelöscht.`)) return;
  try {
    await api.deleteArticle(a.n_article);
    if (selectedArticle.value === a.n_article) selectedArticle.value = null;
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

const displayedCharges = computed(() => {
  if (selectedArticle.value === null) return charges.value;
  return charges.value.filter((c) => c.n_article === selectedArticle.value);
});

async function loadCharges() {
  chargeLoading.value = true;
  chargeError.value = '';
  try {
    charges.value = await api.getCharges(chargeFilter.value);
  } catch (e) {
    chargeError.value = String((e as Error).message);
  } finally {
    chargeLoading.value = false;
  }
}

// ─── Charge Modal ─────────────────────────────────────────────────────────────
const chargeDialog = ref<HTMLDialogElement | null>(null);
const chargeForm = reactive({
  n_article: '' as string | number,
  charge_id: '',
  good_to: '',
  first_delivery: '',
  last_delivery: '',
  originalChargeId: '',
  isEdit: false
});
const chargeSaving = ref(false);
const chargeFormError = ref('');

function openNewCharge() {
  chargeForm.n_article = selectedArticle.value ?? '';
  chargeForm.charge_id = '';
  chargeForm.good_to = '';
  chargeForm.first_delivery = '';
  chargeForm.last_delivery = '';
  chargeForm.isEdit = false;
  chargeForm.originalChargeId = '';
  chargeFormError.value = '';
  chargeDialog.value?.showModal();
}

function openEditCharge(c: Charge) {
  chargeForm.n_article = c.n_article;
  chargeForm.charge_id = c.charge_id;
  chargeForm.good_to = c.good_to ?? '';
  chargeForm.first_delivery = c.first_delivery ?? '';
  chargeForm.last_delivery = c.last_delivery ?? '';
  chargeForm.originalChargeId = c.charge_id;
  chargeForm.isEdit = true;
  chargeFormError.value = '';
  chargeDialog.value?.showModal();
}

async function saveCharge() {
  const nArticle = Number(chargeForm.n_article);
  if (!Number.isInteger(nArticle) || nArticle <= 0 || !chargeForm.charge_id.trim()) {
    chargeFormError.value = 'Artikelnummer und Chargennummer sind Pflichtfelder.';
    return;
  }
  chargeSaving.value = true;
  chargeFormError.value = '';
  try {
    if (chargeForm.isEdit) {
      await api.updateCharge(chargeForm.originalChargeId, {
        n_article: nArticle,
        new_charge_id: chargeForm.charge_id.trim() !== chargeForm.originalChargeId ? chargeForm.charge_id.trim() : undefined,
        good_to: chargeForm.good_to || null,
        first_delivery: chargeForm.first_delivery || null,
        last_delivery: chargeForm.last_delivery || null
      });
    } else {
      await api.createCharge({
        n_article: nArticle,
        charge_id: chargeForm.charge_id.trim(),
        good_to: chargeForm.good_to || null,
        first_delivery: chargeForm.first_delivery || null,
        last_delivery: chargeForm.last_delivery || null
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
    await api.deleteCharge(c.charge_id);
    await loadCharges();
  } catch (e) {
    alert(String((e as Error).message));
  }
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

  <div v-else class="container">
    <div class="split-layout">
      <!-- Charges (left, like legacy) -->
      <section class="card panel">
        <div class="row" style="margin-bottom: 8px;">
          <h2 style="margin:0; flex:1;">Chargen</h2>
          <button v-if="canWrite" @click="openNewCharge" style="padding: 6px 10px; font-size: 0.85rem;">+ Neu</button>
          <button class="secondary" @click="api.exportCharges(chargeFilter)" style="padding: 6px 10px; font-size: 0.85rem;" title="CSV exportieren">↓ CSV</button>
        </div>
        <div class="row" style="margin-bottom: 8px;">
          <input v-model="chargeFilter" placeholder="Suche Charge / Artikel..." style="flex:1;" @keyup.enter="loadCharges" />
          <button @click="loadCharges" style="padding: 6px 10px;">Suchen</button>
          <button v-if="selectedArticle !== null" class="secondary" @click="selectedArticle = null; loadCharges()" style="padding: 6px 10px;" title="Artikelfilter aufheben">✕</button>
        </div>
        <p v-if="selectedArticle !== null" class="muted" style="margin: 0 0 6px; font-size: 0.8rem;">Gefiltert nach Artikel {{ selectedArticle }}</p>
        <p v-if="chargeError" class="error">{{ chargeError }}</p>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Art. Nr</th>
                <th>Bezeichnung</th>
                <th>Chrg. Nr</th>
                <th>MHD</th>
                <th>Erste Ausl.</th>
                <th>Letzte Ausl.</th>
                <th v-if="canWrite"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="chargeLoading"><td colspan="7" class="muted" style="padding: 12px;">Laden…</td></tr>
              <tr v-else-if="displayedCharges.length === 0"><td colspan="7" class="muted" style="padding: 12px;">Keine Chargen gefunden.</td></tr>
              <tr v-for="c in displayedCharges" :key="c.charge_id">
                <td>{{ c.n_article }}</td>
                <td>{{ c.article_name }}</td>
                <td>{{ c.charge_id }}</td>
                <td>{{ c.good_to ?? '—' }}</td>
                <td>{{ c.first_delivery ?? '—' }}</td>
                <td>{{ c.last_delivery ?? '—' }}</td>
                <td v-if="canWrite" class="actions">
                  <button @click="openEditCharge(c)" class="action-btn" title="Bearbeiten">✎</button>
                  <button v-if="canAdmin" @click="deleteCharge(c)" class="action-btn danger" title="Löschen">✕</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Articles (right, like legacy) -->
      <section class="card panel panel--narrow">
        <div class="row" style="margin-bottom: 8px;">
          <h2 style="margin:0; flex:1;">Artikel</h2>
          <button v-if="canWrite" @click="openNewArticle" style="padding: 6px 10px; font-size: 0.85rem;">+ Neu</button>
          <button class="secondary" @click="api.exportArticles()" style="padding: 6px 10px; font-size: 0.85rem;" title="CSV exportieren">↓ CSV</button>
        </div>
        <div class="row" style="margin-bottom: 8px;">
          <input v-model="articleFilter" placeholder="Nr. oder Bezeichnung…" style="flex:1;" @keyup.enter="loadArticles" />
          <button @click="loadArticles" style="padding: 6px 10px;">Suchen</button>
        </div>
        <p v-if="articleError" class="error">{{ articleError }}</p>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Art. Nr</th>
                <th>Bezeichnung</th>
                <th v-if="canWrite"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="articleLoading"><td colspan="3" class="muted" style="padding: 12px;">Laden…</td></tr>
              <tr v-else-if="articles.length === 0"><td colspan="3" class="muted" style="padding: 12px;">Keine Artikel gefunden.</td></tr>
              <tr
                v-for="a in articles" :key="a.n_article"
                :class="{ 'row-selected': selectedArticle === a.n_article }"
                @click="selectArticle(a.n_article)"
                style="cursor: pointer;"
              >
                <td>{{ a.n_article }}</td>
                <td>{{ a.article_name }}</td>
                <td v-if="canWrite" class="actions" @click.stop>
                  <button @click="openEditArticle(a)" class="action-btn" title="Bearbeiten">✎</button>
                  <button v-if="canAdmin" @click="deleteArticle(a)" class="action-btn danger" title="Löschen">✕</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- Article Modal -->
    <dialog ref="articleDialog" class="modal">
      <form method="dialog" @submit.prevent>
        <h3>{{ articleForm.isEdit ? 'Artikel bearbeiten' : 'Artikel anlegen' }}</h3>
        <label>
          Artikelnummer
          <input v-model="articleForm.n_article" type="number" :disabled="articleForm.isEdit" placeholder="z. B. 1234" required />
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
    <dialog ref="chargeDialog" class="modal">
      <form method="dialog" @submit.prevent>
        <h3>{{ chargeForm.isEdit ? 'Charge bearbeiten' : 'Charge anlegen' }}</h3>
        <label>
          Artikelnummer
          <input v-model="chargeForm.n_article" type="number" placeholder="z. B. 1234" required />
        </label>
        <label>
          Chargennummer
          <input v-model="chargeForm.charge_id" type="text" placeholder="Chargen-ID" required />
        </label>
        <label>
          MHD
          <input v-model="chargeForm.good_to" type="date" />
        </label>
        <label>
          Erste Auslieferung
          <input v-model="chargeForm.first_delivery" type="date" />
        </label>
        <label>
          Letzte Auslieferung
          <input v-model="chargeForm.last_delivery" type="date" />
        </label>
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
