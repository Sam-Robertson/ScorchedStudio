// lib/boardUser.ts
//
// Which person is using a board (Projects, Social) on this device. Same
// shape as the admin token in lib/adminAuth.ts: "Remember me on this device"
// keeps the choice in localStorage across browser restarts; otherwise it
// lives in sessionStorage and the board asks again next time.
//
// Boards are used from shared studio devices as often as personal ones, so
// switching user always clears both stores, never just the one in use.

export type BoardKey = "projectsUser" | "socialUser";

export function getBoardUser(key: BoardKey): string | null {
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setBoardUser(key: BoardKey, name: string, remember: boolean): void {
  try {
    if (remember) {
      localStorage.setItem(key, name);
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, name);
      localStorage.removeItem(key);
    }
  } catch {
    // Storage blocked (private mode, cleared site data). The board still
    // works for this page load; it just asks again next time.
  }
}

export function clearBoardUser(key: BoardKey): void {
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
