import type { AccountInfo, AuthenticationResult } from '@azure/msal-browser';

const accessToken = useState<string | null>('access-token', () => null);
const account = useState<AccountInfo | null>('account', () => null);

export function useAuth() {
  const { $msal } = useNuxtApp();
  const config = useRuntimeConfig();

  async function init() {
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
    await $msal.loginRedirect({
      scopes: ['openid', 'profile', 'email', `${config.public.entraClientId}/.default`]
    });
  }

  async function signOut() {
    await $msal.logoutRedirect();
  }

  async function acquireTokenSilently(active: AccountInfo) {
    const tokenResult = await $msal.acquireTokenSilent({
      account: active,
      scopes: [`${config.public.entraClientId}/.default`]
    });
    setSession(tokenResult);
  }

  function setSession(result: AuthenticationResult) {
    if (!result.account) {
      return;
    }

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
