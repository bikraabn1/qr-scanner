import { appState } from './store.svelte';
import type { GoogleUser } from './types';
import { getAuthSession, saveAuthSession } from './auth-cookie';

declare global {
  interface Window {
    google?: any;
  }
}

let tokenClientInstance: any = null;
let renewTimeoutId: any = null;

/**
 * Schedule background auto-renew before token expiration (5 minutes before expiry)
 */
export function scheduleTokenRenew(expiresInSeconds: number = 3600): void {
  if (typeof window === 'undefined') return;
  if (renewTimeoutId) clearTimeout(renewTimeoutId);

  // Trigger renew 5 minutes before expiration (or 80% of remaining time)
  const renewMs = Math.max((expiresInSeconds - 300) * 1000, 60000);

  renewTimeoutId = setTimeout(async () => {
    try {
      await requestGoogleAccessToken(true); // silent request without popup
    } catch (err) {
      console.warn('Auto silent token renewal gagal (mungkin user logout):', err);
    }
  }, renewMs);
}

/**
 * Request access token with Google Sheets spreadsheet scope
 * @param silent If true, request token without opening prompt
 */
export async function requestGoogleAccessToken(silent: boolean = false): Promise<string> {
  const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID?.trim() || appState.config.clientId?.trim();
  if (!clientId) {
    throw new Error('Google OAuth Client ID belum dikonfigurasi di file .env (VITE_GOOGLE_CLIENT_ID).');
  }

  if (typeof window === 'undefined' || !window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services SDK belum siap. Periksa koneksi internet Anda.');
  }

  return new Promise((resolve, reject) => {
    try {
      tokenClientInstance = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            reject(new Error(tokenResponse.error_description || tokenResponse.error));
            return;
          }

          const token = tokenResponse.access_token;
          const expiresIn = Number(tokenResponse.expires_in) || 3500;

          try {
            // Fetch real user info with the token
            const user = await fetchUserProfile(token);
            appState.setAuth(user, token, expiresIn);
            scheduleTokenRenew(expiresIn);
            resolve(token);
          } catch (profileErr) {
            console.warn('Gagal memuat profil Google Userinfo:', profileErr);
            const fallbackUser = appState.user || { email: 'tester@google.com', name: 'Google Tester' };
            appState.setAuth(fallbackUser, token, expiresIn);
            scheduleTokenRenew(expiresIn);
            resolve(token);
          }
        }
      });

      // If silent or already authenticated, use empty prompt (background refresh)
      tokenClientInstance.requestAccessToken({
        prompt: silent ? '' : (appState.accessToken ? '' : 'select_account')
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Check and restore session on application mount
 */
export async function initAuthSession(): Promise<boolean> {
  const session = getAuthSession();
  if (session && session.token) {
    const remainingSeconds = Math.floor((session.expiresAt - Date.now()) / 1000);
    if (remainingSeconds > 60) {
      appState.setAuth(session.user, session.token, remainingSeconds);
      scheduleTokenRenew(remainingSeconds);
      return true;
    }
  }

  // If token expired but user previously logged in, try silent renew once in background
  if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
    try {
      await requestGoogleAccessToken(true);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Sign out and revoke Google token session
 */
export function logoutGoogle(): void {
  if (renewTimeoutId) clearTimeout(renewTimeoutId);
  const token = appState.accessToken;
  if (token && typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(token, () => {});
    } catch {}
  }
  appState.signOut();
}

/**
 * Fetch basic profile info
 */
export async function fetchUserProfile(token: string): Promise<GoogleUser> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    throw new Error('Failed to fetch user profile');
  }
  const data = await res.json();
  return {
    email: data.email || 'tester@google.com',
    name: data.name || data.email?.split('@')[0] || 'Google Tester',
    picture: data.picture
  };
}
