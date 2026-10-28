import { appState } from './store.svelte';
import type { GoogleUser } from './types';

declare global {
  interface Window {
    google?: any;
  }
}

let tokenClientInstance: any = null;

/**
 * Request access token with Google Sheets spreadsheet scope
 */
export async function requestGoogleAccessToken(): Promise<string> {
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
          try {
            // Fetch real user info with the token
            const user = await fetchUserProfile(token);
            appState.setAuth(user, token);
            resolve(token);
          } catch (profileErr) {
            console.warn('Gagal memuat profil Google Userinfo:', profileErr);
            // Fallback: decode claims or default
            appState.setAuth({ email: 'tester@google.com', name: 'Google Tester' }, token);
            resolve(token);
          }
        }
      });

      tokenClientInstance.requestAccessToken({ prompt: appState.accessToken ? '' : 'select_account' });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
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
    name: data.name || data.email || 'Tester',
    picture: data.picture
  };
}

/**
 * Sign out helper
 */
export function logoutGoogle() {
  if (appState.accessToken && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(appState.accessToken, () => {});
    } catch (_) {}
  }
  appState.signOut();
}
