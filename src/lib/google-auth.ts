import { appState } from './store.svelte';
import type { GoogleUser } from './types';
import { getAuthSession, saveAuthSession } from './auth-cookie';

declare global {
  interface Window {
    google?: any;
  }
}

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SCOPES = [SHEETS_SCOPE, 'openid', 'email', 'profile'].join(' ');

let renewTimeoutId: any = null;
/** Scopes granted by the last token response. Empty = unknown (token restored from cookie). */
let grantedScopes: string[] = [];

function parseScopes(raw: unknown): string[] {
  return String(raw || '').split(/\s+/).filter(Boolean);
}

/** True only when we positively know the current token lacks the Sheets scope. */
export function isMissingSheetsScope(): boolean {
  return grantedScopes.length > 0 && !grantedScopes.includes(SHEETS_SCOPE);
}

function getClientId(): string {
  const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID?.trim() || appState.config.clientId?.trim();
  if (!clientId) {
    throw new Error('Google OAuth Client ID belum dikonfigurasi di file .env (VITE_GOOGLE_CLIENT_ID).');
  }
  return clientId;
}

function gisReady(): boolean {
  return typeof window !== 'undefined' && !!window.google?.accounts?.oauth2;
}

/** The GIS script is `async defer`; on mount it is often not loaded yet. Poll briefly instead of failing. */
function waitForGis(timeoutMs = 5000): Promise<boolean> {
  if (gisReady()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (gisReady()) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(tick, 100);
    };
    tick();
  });
}

/**
 * One GIS token request. A fresh client per call so a silent renew and a manual login
 * can't clobber each other's callback. error_callback is mandatory: without it a blocked
 * or closed popup leaves the promise pending forever.
 */
function requestToken(prompt: string, silent: boolean): Promise<any> {
  const clientId = getClientId();

  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        // Pin the account so silent renew can't silently switch Google accounts
        login_hint: appState.user?.email || undefined,
        callback: (resp: any) => {
          if (resp?.error) {
            done(() => reject(new Error(resp.error_description || resp.error)));
            return;
          }
          done(() => resolve(resp));
        },
        error_callback: (err: any) => {
          const type = err?.type || '';
          const msg =
            type === 'popup_closed'
              ? 'Popup login Google ditutup sebelum selesai. Coba lagi.'
              : type === 'popup_failed_to_open'
                ? 'Popup login Google diblokir browser. Izinkan popup untuk situs ini lalu coba lagi.'
                : err?.message || `Google OAuth gagal (${type || 'unknown'}).`;
          done(() => reject(new Error(msg)));
        }
      });
      client.requestAccessToken({ prompt });
    } catch (err) {
      done(() => reject(err instanceof Error ? err : new Error(String(err))));
    }
  });
}

/**
 * Request an access token that actually carries the Sheets scope.
 * A previous narrower grant makes silent requests return a token without `spreadsheets`,
 * which Google then rejects with 403 insufficientPermissions — so verify the granted scope
 * and re-consent once when it is missing.
 */
export async function requestGoogleAccessToken(silent: boolean = false): Promise<string> {
  getClientId();
  if (!(await waitForGis())) {
    throw new Error('Google Identity Services SDK gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.');
  }

  let resp = await requestToken(silent ? '' : 'consent', silent);
  grantedScopes = parseScopes(resp.scope);

  if (isMissingSheetsScope()) {
    if (silent) {
      appState.signOut();
      throw new Error('Izin Google Sheets belum diberikan untuk akun ini. Klik "Sign in with Google" untuk memberi izin.');
    }
    // Force the consent screen that includes the Sheets scope
    resp = await requestToken('consent', false);
    grantedScopes = parseScopes(resp.scope);
    if (isMissingSheetsScope()) {
      appState.signOut();
      throw new Error(
        'Izin Google Sheets ditolak. Pada layar persetujuan, centang akses "Lihat, edit, buat, dan hapus semua spreadsheet Anda" lalu lanjutkan.'
      );
    }
  }

  const token = resp.access_token;
  const expiresIn = Number(resp.expires_in) || 3500;

  try {
    const user = await fetchUserProfile(token);
    appState.setAuth(user, token, expiresIn);
  } catch (profileErr) {
    console.warn('Gagal memuat profil Google Userinfo:', profileErr);
    const fallbackUser = appState.user || { email: 'tester@google.com', name: 'Google Tester' };
    appState.setAuth(fallbackUser, token, expiresIn);
  }

  scheduleTokenRenew(expiresIn);
  return token;
}

/**
 * Renew in the background shortly before expiry.
 */
export function scheduleTokenRenew(expiresInSeconds: number = 3600): void {
  if (typeof window === 'undefined') return;
  if (renewTimeoutId) clearTimeout(renewTimeoutId);

  const renewMs = Math.max((expiresInSeconds - 300) * 1000, 60000);

  renewTimeoutId = setTimeout(async () => {
    try {
      await requestGoogleAccessToken(true); // silent, no popup
    } catch (err) {
      console.warn('Auto silent token renewal gagal (mungkin user logout):', err);
    }
  }, renewMs);
}

/**
 * Restore the session on mount. Never prompts: an expired session just shows the login screen.
 */
export async function initAuthSession(): Promise<boolean> {
  const session = getAuthSession();
  if (session && session.token) {
    const remainingSeconds = Math.floor((session.expiresAt - Date.now()) / 1000);
    if (remainingSeconds > 60) {
      grantedScopes = []; // unknown until the next token response; a 403 forces re-consent
      appState.setAuth(session.user, session.token, remainingSeconds);
      scheduleTokenRenew(remainingSeconds);
      return true;
    }
  }

  if (await waitForGis()) {
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
 * Sign out and revoke the Google token.
 */
export function logoutGoogle(): void {
  if (renewTimeoutId) clearTimeout(renewTimeoutId);
  const token = appState.accessToken;
  if (token && typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(token, () => {});
    } catch {}
  }
  grantedScopes = [];
  appState.signOut();
}

/**
 * Fetch basic profile info.
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
