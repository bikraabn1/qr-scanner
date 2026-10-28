import type { GoogleUser } from './types';

const TOKEN_COOKIE_NAME = 'qr_token_v1';
const USER_COOKIE_NAME = 'qr_user_v1';
const EXPIRY_COOKIE_NAME = 'qr_expiry_v1';

/**
 * Set a cookie with SameSite=Strict and Secure flag
 */
export function setCookie(name: string, value: string, maxAgeSeconds: number = 3600): void {
  if (typeof document === 'undefined') return;
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const secureFlag = isSecure ? '; Secure' : '';
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Strict${secureFlag}`;
}

/**
 * Get cookie value by name
 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const target = `${encodeURIComponent(name)}=`;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      try {
        return decodeURIComponent(trimmed.slice(target.length));
      } catch {
        return trimmed.slice(target.length);
      }
    }
  }
  return null;
}

/**
 * Remove a cookie by expiring it
 */
export function removeCookie(name: string): void {
  if (typeof document === 'undefined') return;
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const secureFlag = isSecure ? '; Secure' : '';
  document.cookie = `${encodeURIComponent(name)}=; path=/; max-age=0; SameSite=Strict${secureFlag}`;
}

/**
 * Save auth session (token, user, expiry) into Cookies
 */
export function saveAuthSession(token: string, user: GoogleUser | null, expiresInSeconds: number = 3500): void {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  setCookie(TOKEN_COOKIE_NAME, token, expiresInSeconds);
  setCookie(EXPIRY_COOKIE_NAME, String(expiresAt), expiresInSeconds);
  if (user) {
    setCookie(USER_COOKIE_NAME, JSON.stringify(user), expiresInSeconds);
  }
}

/**
 * Read valid stored auth session from Cookies
 */
export function getAuthSession(): { token: string; user: GoogleUser | null; expiresAt: number } | null {
  const token = getCookie(TOKEN_COOKIE_NAME);
  const expiryStr = getCookie(EXPIRY_COOKIE_NAME);
  if (!token || !expiryStr) return null;

  const expiresAt = parseInt(expiryStr, 10);
  if (isNaN(expiresAt) || Date.now() >= expiresAt) {
    clearAuthSession();
    return null;
  }

  let user: GoogleUser | null = null;
  const userJson = getCookie(USER_COOKIE_NAME);
  if (userJson) {
    try {
      user = JSON.parse(userJson);
    } catch {
      user = null;
    }
  }

  return { token, user, expiresAt };
}

/**
 * Clear all auth cookies
 */
export function clearAuthSession(): void {
  removeCookie(TOKEN_COOKIE_NAME);
  removeCookie(USER_COOKIE_NAME);
  removeCookie(EXPIRY_COOKIE_NAME);
}
