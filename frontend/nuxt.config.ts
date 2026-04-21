export default defineNuxtConfig({
  compatibilityDate: '2026-04-04',
  devtools: { enabled: true },
  devServer: { host: '127.0.0.1' },
  ssr: false,
  nitro: {
    preset: 'cloudflare-pages',
    prerender: { crawlLinks: false, routes: ['/'] }
  },
  modules: ['@vite-pwa/nuxt'],
  css: ['~/assets/main.css'],
  app: {
    head: {
      title: 'Nexovis – Chargenrückverfolgung',
      link: [
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/favicon-192x192.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'theme-color', content: '#283F37' },
      ],
    },
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Nexovis – Chargenrückverfolgung',
      short_name: 'Chargen',
      description: 'Artikel- und Chargenverwaltung mit Rückverfolgung',
      theme_color: '#283F37',
      background_color: '#fafafa',
      display: 'standalone',
      orientation: 'any',
      start_url: '/',
      icons: [
        { src: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/favicon-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/favicon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
    },
    client: {
      installPrompt: true,
    },
    devOptions: {
      enabled: true,
    },
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8787',
      entraClientId: process.env.NUXT_PUBLIC_ENTRA_CLIENT_ID ?? '',
      entraTenantId: process.env.NUXT_PUBLIC_ENTRA_TENANT_ID ?? 'common',
      entraRedirectUri: process.env.NUXT_PUBLIC_ENTRA_REDIRECT_URI ?? 'http://localhost:3000',
      devAuthBypass: process.env.NUXT_PUBLIC_DEV_AUTH_BYPASS === 'true'
    }
  }
});
