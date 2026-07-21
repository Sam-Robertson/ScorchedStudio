// Client-side persistence for the shared admin login token.
// "Remember this device" stores the token in localStorage (survives browser
// restarts); otherwise it's sessionStorage-only, as before.

const KEY = "adminToken";

export function getAdminToken(): string | null {
  return localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY);
}

export function setAdminToken(token: string, remember: boolean) {
  if (remember) {
    localStorage.setItem(KEY, token);
    sessionStorage.removeItem(KEY);
  } else {
    sessionStorage.setItem(KEY, token);
    localStorage.removeItem(KEY);
  }
}

export function clearAdminToken() {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
}
