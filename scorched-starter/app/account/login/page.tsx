"use client";

// app/account/login/page.tsx
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Container from "@/components/ui/Container";

const inputCls = "w-full rounded-lg border border-black/20 bg-white px-4 py-3 outline-none focus:border-black/40";

export default function AccountLoginPage() {
  return (
    <Suspense>
      <AccountLoginForm />
    </Suspense>
  );
}

function AccountLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      router.push(redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/account");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="pb-20">
      <section className="pt-12 md:pt-16">
        <Container className="max-w-sm">
          <p className="eyebrow text-center text-brand">Account</p>
          <h1 className="h2 text-center font-bold mt-2 mb-8">Log In</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                className={inputCls}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="password"
                className={inputCls}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-neutral-600 select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-black/20"
              />
              Remember me
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-brand text-white py-3 font-semibold disabled:opacity-50"
            >
              {loading ? "Logging in…" : "Log In"}
            </button>
          </form>

          <div className="flex items-center justify-between mt-4 text-sm">
            <Link
              href={redirectTo ? `/account/forgot-password?redirect=${encodeURIComponent(redirectTo)}` : "/account/forgot-password"}
              className="text-neutral-500 underline underline-offset-2 hover:text-neutral-700"
            >
              Forgot password?
            </Link>
            <Link
              href={redirectTo ? `/account/signup?redirect=${encodeURIComponent(redirectTo)}` : "/account/signup"}
              className="text-[#884A20] underline underline-offset-2 hover:opacity-70"
            >
              Create an account
            </Link>
          </div>
        </Container>
      </section>
    </main>
  );
}
