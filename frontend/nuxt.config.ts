export default defineNuxtConfig({
  compatibilityDate: '2026-04-04',
  devtools: { enabled: true },
  css: ['~/assets/main.css'],
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8787',
      entraClientId: process.env.NUXT_PUBLIC_ENTRA_CLIENT_ID ?? '',
      entraTenantId: process.env.NUXT_PUBLIC_ENTRA_TENANT_ID ?? 'common',
      entraRedirectUri: process.env.NUXT_PUBLIC_ENTRA_REDIRECT_URI ?? 'http://localhost:3000'
    }
  }
});
