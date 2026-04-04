import { PublicClientApplication } from '@azure/msal-browser';

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();

  const msal = new PublicClientApplication({
    auth: {
      clientId: config.public.entraClientId,
      authority: `https://login.microsoftonline.com/${config.public.entraTenantId}`,
      redirectUri: config.public.entraRedirectUri
    },
    cache: {
      cacheLocation: 'localStorage'
    }
  });

  return {
    provide: {
      msal
    }
  };
});
