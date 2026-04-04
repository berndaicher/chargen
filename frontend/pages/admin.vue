<script setup lang="ts">
import type { TenantUser, Role } from '~/composables/useApi';

const { account, accessToken } = useAuth();
const api = useApi();

const users = ref<TenantUser[]>([]);
const loading = ref(false);
const error = ref('');
const saving = ref<string | null>(null);

async function loadUsers() {
  if (!accessToken.value) return;
  loading.value = true;
  error.value = '';
  try {
    users.value = await api.getUsers();
  } catch (e) {
    error.value = String((e as Error).message);
  } finally {
    loading.value = false;
  }
}

async function changeRole(user: TenantUser, newRole: Role) {
  saving.value = user.user_oid;
  try {
    await api.setUserRole(user.user_oid, newRole);
    user.role = newRole;
  } catch (e) {
    alert(String((e as Error).message));
  } finally {
    saving.value = null;
  }
}

onMounted(async () => {
  if (!accessToken.value) return;
  const me = await api.me().catch(() => null);
  if (me?.role !== 'admin') {
    await navigateTo('/');
    return;
  }
  await loadUsers();
});

watch(accessToken, async (value) => {
  if (value) await loadUsers();
});
</script>

<template>
  <div v-if="!account" class="container" style="padding-top: 80px; text-align: center;">
    <p class="muted">Bitte anmelden.</p>
  </div>

  <div v-else class="container">
    <section class="card">
      <div class="row" style="margin-bottom: 12px;">
        <h2 style="margin: 0; flex: 1;">Benutzerverwaltung</h2>
        <NuxtLink to="/" style="color: var(--accent);">← Zurück</NuxtLink>
      </div>
      <p class="muted">Rollen gelten für diesen Mandanten ({{ account.tenantId }}).</p>

      <p v-if="error" class="error">{{ error }}</p>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>E-Mail</th>
            <th>Rolle</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="3" class="muted" style="padding: 12px;">Laden…</td>
          </tr>
          <tr v-else-if="users.length === 0">
            <td colspan="3" class="muted" style="padding: 12px;">Keine Benutzer gefunden.</td>
          </tr>
          <tr v-for="u in users" :key="u.user_oid">
            <td>{{ u.display_name ?? u.user_oid }}</td>
            <td>{{ u.email ?? '—' }}</td>
            <td>
              <select
                :value="u.role"
                :disabled="saving === u.user_oid"
                @change="(e) => changeRole(u, (e.target as HTMLSelectElement).value as Role)"
                style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border);"
              >
                <option value="reader">Leser</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
              <span v-if="saving === u.user_oid" class="muted" style="margin-left: 6px; font-size: 0.8rem;">Speichern…</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
