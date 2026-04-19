import type { AccountInfo, AuthenticationResult } from '@azure/msal-browser';

export function useAuth() {
  const accessToken = useState<string | null>('access-token', () => null);
  const account = useState<AccountInfo | null>('account', () => null);
  const config = useRuntimeConfig();

  const devMode = config.public.devAuthBypass;

  const devAccount = computed<AccountInfo | null>(() => {
    if (!devMode) return null;
    return {
      homeAccountId: 'dev-user',
      environment: 'dev',
      tenantId: 'bodner-getraenke.at',
      username: 'dev@bodner-getraenke.at',
      name: 'Dev User',
      idToken: '',
      idTokenClaims: {},
      localAccountId: 'dev-user',
      authorityType: 'MSSTS'
    } as AccountInfo;
  });

  async function init() {
    if (devMode) {
      account.value = devAccount.value;
      accessToken.value = 'dev-token';
      return;
    }

    const { $msal } = useNuxtApp();
    await $msal.initialize();
    const result = await $msal.handleRedirectPromise();

    if (result) {
      setSession(result);
      return;
    }

    const active = $msal.getActiveAccount() ?? $msal.getAllAccounts()[0] ?? null;
    if (active) {
      account.value = active;
      await acquireTokenSilently(active);
    }
  }

  async function signIn() {
    if (devMode) {
      account.value = devAccount.value;
      accessToken.value = 'dev-token';
      return;
    }
    const { $msal } = useNuxtApp();
    await $msal.loginRedirect({
      scopes: ['openid', 'profile', 'email', `api://${config.public.entraClientId}/.default`]
    });
  }

  async function signOut() {
    if (devMode) {
      account.value = null;
      accessToken.value = null;
      return;
    }
    const { $msal } = useNuxtApp();
    await $msal.logoutRedirect();
  }

  async function acquireTokenSilently(active: AccountInfo) {
    const { $msal } = useNuxtApp();
    const tokenResult = await $msal.acquireTokenSilent({
      account: active,
      scopes: [`api://${config.public.entraClientId}/.default`]
    });
    setSession(tokenResult);
  }

  function setSession(result: AuthenticationResult) {
    if (!result.account) {
      return;
    }

    const { $msal } = useNuxtApp();
    $msal.setActiveAccount(result.account);
    account.value = result.account;
    accessToken.value = result.accessToken;
  }

  return {
    accessToken,
    account,
    init,
    signIn,
    signOut
  };
}
