<script setup lang="ts">
const { account, signIn, signOut } = useAuth();
const api = useApi();
const role = ref('');
const canAdmin = computed(() => role.value === 'admin');

onMounted(async () => {
  if (!account.value) return;
  const me = await api.me().catch(() => null);
  if (me) role.value = me.role;
});

watch(account, async (a) => {
  if (!a) { role.value = ''; return; }
  const me = await api.me().catch(() => null);
  if (me) role.value = me.role;
});
</script>

<template>
  <nav class="navbar">
    <NuxtLink to="/" class="brand">
      <img src="/nexovis-logo.svg" alt="Nexovis" class="brand-logo" />
      <span class="brand-text">Chargenrückverfolgung</span>
    </NuxtLink>
    <div class="nav-actions">
      <NuxtLink v-if="canAdmin" to="/admin" class="nav-link">Benutzer</NuxtLink>
      <span v-if="account" class="nav-info">{{ account.username }} · {{ role }}</span>
      <button v-if="!account" @click="signIn" style="padding: 6px 12px;">Anmelden</button>
      <button v-else class="secondary" @click="signOut" style="padding: 6px 12px;">Abmelden</button>
    </div>
  </nav>
  <NuxtPage />
</template>
