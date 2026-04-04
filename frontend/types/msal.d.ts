import type { PublicClientApplication } from '@azure/msal-browser';

declare module '#app' {
  interface NuxtApp {
    $msal: PublicClientApplication;
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $msal: PublicClientApplication;
  }
}

export {};
