"use client";

// app/account/forgot-password/page.tsx
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";

const inputCls = "w-full rounded-lg border border-black/20 bg-white px-4 py-3 outline-none focus:border-black/40";

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/account/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          redirectTo: redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      setSent(true);
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
          <h1 className="h2 text-center font-bold mt-2 mb-8">Reset Password</h1>

          {sent ? (
            <div className="rounded-2xl border border-black/10 bg-white p-6 text-center">
              <p className="font-semibold text-neutral-900 mb-1">Check your email</p>
              <p className={`${vulfMono.className} text-sm text-neutral-500 break-words`}>
                If an account exists for {email}, we sent a link to reset the password. It expires in 15 minutes.
              </p>
            </div>
          ) : (
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
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-brand text-white py-3 font-semibold disabled:opacity-50"
              >
                {loading ? "Sending…" : "Email me a reset link"}
              </button>
            </form>
          )}

          <p className="text-sm text-center mt-4">
            <Link href="/account/login" className="text-[#884A20] underline underline-offset-2 hover:opacity-70">
              Back to log in
            </Link>
          </p>
        </Container>
      </section>
    </main>
  );
}
