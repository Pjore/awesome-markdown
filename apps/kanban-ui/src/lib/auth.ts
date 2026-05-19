import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

// ---------------------------------------------------------------------------
// Optional auth — only active when both env vars are set.
// If VITE_ZITADEL_ISSUER / VITE_CLIENT_ID are absent, the module is a no-op.
// ---------------------------------------------------------------------------

const issuer = (import.meta.env.VITE_ZITADEL_ISSUER as string | undefined) ?? '';
const clientId = (import.meta.env.VITE_CLIENT_ID as string | undefined) ?? '';

export const isAuthEnabled = Boolean(issuer && clientId);

export const userManager = isAuthEnabled
  ? new UserManager({
      authority: issuer,
      client_id: clientId,
      redirect_uri: `${window.location.origin}/auth/callback`,
      response_type: 'code',
      scope: 'openid email profile offline_access',
      userStore: new WebStorageStateStore({ store: window.localStorage }),
      automaticSilentRenew: true,
    })
  : null;

/**
 * Returns the current access token, attempting a silent refresh if expired.
 * Returns an empty string when auth is disabled or when the user is not signed in.
 */
export async function getToken(): Promise<string> {
  if (!userManager) return '';
  let user = await userManager.getUser();
  if (!user) return '';
  if (user.expired) {
    try {
      user = await userManager.signinSilent();
    } catch {
      // Silent refresh failed — token is gone; let the next request 401
      return '';
    }
  }
  return user?.access_token ?? '';
}

export async function login(): Promise<void> {
  await userManager?.signinRedirect();
}

export async function logout(): Promise<void> {
  await userManager?.signoutRedirect({ post_logout_redirect_uri: window.location.origin });
}

export async function handleCallback(): Promise<void> {
  await userManager?.signinRedirectCallback();
}
