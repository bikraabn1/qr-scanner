import { describe, it, expect, beforeEach } from 'vitest';
import { setCookie, getCookie, removeCookie, saveAuthSession, getAuthSession, clearAuthSession } from './auth-cookie';

describe('Auth Cookie Helper', () => {
  beforeEach(() => {
    // Clear cookies before each test
    document.cookie.split(';').forEach((c) => {
      document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    });
  });

  it('sets and gets cookie value correctly', () => {
    setCookie('test_key', 'hello_world', 3600);
    expect(getCookie('test_key')).toBe('hello_world');
  });

  it('removes cookie', () => {
    setCookie('test_key', 'hello_world', 3600);
    removeCookie('test_key');
    expect(getCookie('test_key')).toBeNull();
  });

  it('saves and restores auth session', () => {
    const mockUser = { email: 'tester@org.com', name: 'Tester Org' };
    saveAuthSession('token-12345', mockUser, 3600);

    const session = getAuthSession();
    expect(session).not.toBeNull();
    expect(session?.token).toBe('token-12345');
    expect(session?.user?.email).toBe('tester@org.com');
  });

  it('returns null and clears expired session', () => {
    // expired 1 second ago
    saveAuthSession('token-expired', null, -1);
    const session = getAuthSession();
    expect(session).toBeNull();
  });
});
