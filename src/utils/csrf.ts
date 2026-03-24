const CSRF_TOKEN_KEY = 'csrf_token';

export function generateCSRFToken(): string {
  const token = crypto.randomUUID();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(CSRF_TOKEN_KEY, token);
  }
  return token;
}

export function getCSRFToken(): string | null {
  if (typeof sessionStorage !== 'undefined') {
    return sessionStorage.getItem(CSRF_TOKEN_KEY);
  }
  return null;
}

export function validateCSRFToken(token: string): boolean {
  const storedToken = getCSRFToken();
  return storedToken !== null && storedToken === token;
}

export function clearCSRFToken(): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(CSRF_TOKEN_KEY);
  }
}
