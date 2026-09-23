import test from "node:test";
import assert from "node:assert/strict";
import { clearBoardUser, getBoardUser, setBoardUser } from "./boardUser.ts";

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const g = globalThis as unknown as { localStorage: unknown; sessionStorage: unknown };

test("remembered users survive in localStorage and clear sessionStorage", () => {
  g.localStorage = fakeStorage();
  g.sessionStorage = fakeStorage();
  setBoardUser("projectsUser", "Pearson Brown", false);
  setBoardUser("projectsUser", "Pearson Brown", true);
  assert.equal((g.localStorage as ReturnType<typeof fakeStorage>).getItem("projectsUser"), "Pearson Brown");
  assert.equal((g.sessionStorage as ReturnType<typeof fakeStorage>).getItem("projectsUser"), null);
  assert.equal(getBoardUser("projectsUser"), "Pearson Brown");
});

test("an unremembered choice is session-only and replaces a remembered one", () => {
  g.localStorage = fakeStorage();
  g.sessionStorage = fakeStorage();
  setBoardUser("socialUser", "Jess", true);
  setBoardUser("socialUser", "Sam", false);
  assert.equal((g.localStorage as ReturnType<typeof fakeStorage>).getItem("socialUser"), null);
  assert.equal(getBoardUser("socialUser"), "Sam");
});

test("switching user clears both stores", () => {
  g.localStorage = fakeStorage();
  g.sessionStorage = fakeStorage();
  setBoardUser("projectsUser", "Pearson Brown", true);
  clearBoardUser("projectsUser");
  assert.equal(getBoardUser("projectsUser"), null);
});

test("blocked storage does not throw", () => {
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  g.localStorage = throwing;
  g.sessionStorage = throwing;
  assert.doesNotThrow(() => setBoardUser("projectsUser", "x", true));
  assert.equal(getBoardUser("projectsUser"), null);
  assert.doesNotThrow(() => clearBoardUser("projectsUser"));
});
