"use client";

// app/admin/page.tsx
import { useEffect, useState } from "react";
import { vulfMono } from "@/app/fonts";
import { BarChart2, ClipboardList, FileText, KanbanSquare } from "lucide-react";

const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem("adminToken");
    if (saved) setAuthed(true);
    setInitialized(true);
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    const res = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setAuthError("Incorrect password.");
      setAuthLoading(false);
      return;
    }
    const { token } = await res.json();
    sessionStorage.setItem("adminToken", token);
    setAuthed(true);
    setAuthLoading(false);
  }

  if (!initialized) return null;

  if (!authed) {
    return (
      <section className="container-px py-20 max-w-sm mx-auto">
        <p className="eyebrow text-brand mb-2">Admin</p>
        <h1 className="h2 font-bold mb-8">Login</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              className={`${inputCls} w-full py-3`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {authError && <p className="text-sm text-red-600 mt-1">{authError}</p>}
          </div>
          <button
            type="submit"
            disabled={authLoading}
            className={`${vulfMono.className} w-full rounded-xl bg-[#519A70] py-3 text-sm tracking-[0.2em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
          >
            {authLoading ? "Checking…" : "LOG IN"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="container-px py-20 max-w-sm mx-auto">
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="eyebrow text-brand">Admin</p>
          <h1 className="h2 font-bold">Dashboard</h1>
        </div>
        <button
          onClick={() => {
            sessionStorage.removeItem("adminToken");
            setAuthed(false);
            setPassword("");
          }}
          className={`${vulfMono.className} text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}
        >
          Log out
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <a
          href="/admin/bookings"
          className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-blush flex items-center justify-center">
            <ClipboardList className="w-6 h-6 text-brand" />
          </div>
          <div>
            <p className={`${vulfMono.className} font-bold text-sm`}>Bookings</p>
            <p className={`${vulfMono.className} text-xs text-neutral-500 mt-0.5`}>
              View and manage studio sessions
            </p>
          </div>
        </a>

        <a
          href="/admin/waivers"
          className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-blush flex items-center justify-center">
            <FileText className="w-6 h-6 text-brand" />
          </div>
          <div>
            <p className={`${vulfMono.className} font-bold text-sm`}>Waivers</p>
            <p className={`${vulfMono.className} text-xs text-neutral-500 mt-0.5`}>
              View signed participant waivers
            </p>
          </div>
        </a>

        <a
          href="/admin/reporting"
          className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-blush flex items-center justify-center">
            <BarChart2 className="w-6 h-6 text-brand" />
          </div>
          <div>
            <p className={`${vulfMono.className} font-bold text-sm`}>Reporting</p>
            <p className={`${vulfMono.className} text-xs text-neutral-500 mt-0.5`}>
              Referral sources and booking insights
            </p>
          </div>
        </a>

        <a
          href="/admin/projects"
          className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-blush flex items-center justify-center">
            <KanbanSquare className="w-6 h-6 text-brand" />
          </div>
          <div>
            <p className={`${vulfMono.className} font-bold text-sm`}>Projects</p>
            <p className={`${vulfMono.className} text-xs text-neutral-500 mt-0.5`}>
              Manage tasks and track progress
            </p>
          </div>
        </a>
      </div>
    </section>
  );
}
