"use client";

// app/account/reset-password/page.tsx
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Container from "@/components/ui/Container";

const inputCls = "w-full rounded-lg border border-black/20 bg-white px-4 py-3 outline-none focus:border-black/40";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const redirectTo = searchParams.get("redirect");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("This reset link is invalid. Request a new one.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/account/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
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
          <h1 className="h2 text-center font-bold mt-2 mb-8">Set a New Password</h1>

          {!token ? (
            <p className="text-sm text-red-600 text-center">This reset link is invalid. Request a new one from the login page.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div>
                <label className="block text-sm font-medium mb-1">New password</label>
                <input
                  type="password"
                  className={inputCls}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoFocus
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
                {loading ? "Saving…" : "Set Password"}
              </button>
            </form>
          )}
        </Container>
      </section>
    </main>
  );
}
