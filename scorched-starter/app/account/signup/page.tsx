"use client";

// app/account/signup/page.tsx
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Container from "@/components/ui/Container";

const inputCls = "w-full rounded-lg border border-black/20 bg-white px-4 py-3 outline-none focus:border-black/40";

export default function AccountSignupPage() {
  return (
    <Suspense>
      <AccountSignupForm />
    </Suspense>
  );
}

function AccountSignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/account/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
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
          <h1 className="h2 text-center font-bold mt-2 mb-8">Create Account</h1>

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
                minLength={8}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Confirm password</label>
              <input
                type="password"
                className={inputCls}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-brand text-white py-3 font-semibold disabled:opacity-50"
            >
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className="text-sm text-center mt-4">
            <Link
              href={redirectTo ? `/account/login?redirect=${encodeURIComponent(redirectTo)}` : "/account/login"}
              className="text-[#884A20] underline underline-offset-2 hover:opacity-70"
            >
              Already have an account? Log in
            </Link>
          </p>
        </Container>
      </section>
    </main>
  );
}
