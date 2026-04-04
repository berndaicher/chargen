export default defineNuxtRouteMiddleware(async () => {
  if (process.server) {
    return;
  }

  const { account, init } = useAuth();
  if (!account.value) {
    try {
      await init();
    } catch {
      // Keep route available and show login action in UI.
    }
  }
});
