"use client";

// Reporting moved to two Claude dashboards on 2026-10-12. This page is the
// in-app doorway to them: it exists so the Reporting group in the sidebar
// still lands somewhere real, and so a bookmark to /admin/reporting keeps
// working. The dashboards show a snapshot of this app's data that Claude
// refreshes; the hand-entered inputs they report on are edited at
// /admin/reporting/inputs.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import { getAdminToken } from "@/lib/adminAuth";
import { DASHBOARDS } from "@/lib/dashboards";
import { ArrowUpRight, Landmark, PenLine } from "lucide-react";
import Link from "next/link";

export default function AdminReportingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getAdminToken()) { router.replace("/admin"); return; }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <section className="container-px py-10 max-w-4xl mx-auto">
      <div className="mb-8">
        <p className="eyebrow text-brand">Admin</p>
        <h1 className="h2 font-bold">Reporting</h1>
        <p className="text-sm text-neutral-500 mt-2 max-w-xl">
          Reports live in a dashboard built from this app&apos;s data, with a Financials and an Operations
          section. It opens in a new tab and shows the studio&apos;s numbers as of its last data refresh.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {DASHBOARDS.map((d) => (
          <a
            key={d.key}
            href={d.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-2xl border border-black/10 bg-white shadow-sm p-6 flex flex-col gap-3 hover:border-[#884A20]/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <p className={`${vulfMono.className} text-xs font-bold uppercase tracking-wide text-[#884A20]`}>{d.label}</p>
              <ArrowUpRight className="w-4 h-4 text-neutral-300 group-hover:text-[#884A20] transition-colors" />
            </div>
            <p className="text-sm text-neutral-600">{d.blurb}</p>
            <p className={`${vulfMono.className} text-[11px] text-neutral-400 mt-auto`}>Open dashboard</p>
          </a>
        ))}
        <Link
          href="/admin/reporting/inputs"
          className="group rounded-2xl border border-black/10 bg-white shadow-sm p-6 flex flex-col gap-3 hover:border-[#884A20]/50 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <p className={`${vulfMono.className} text-xs font-bold uppercase tracking-wide text-[#884A20]`}>Report inputs</p>
            <PenLine className="w-4 h-4 text-neutral-300 group-hover:text-[#884A20] transition-colors" />
          </div>
          <p className="text-sm text-neutral-600">Projection model months and normalized EBITDA adjustments.</p>
          <p className={`${vulfMono.className} text-[11px] text-neutral-400 mt-auto`}>Edit in the app</p>
        </Link>
      </div>

      <div className="mt-8">
        <Link
          href="/admin/accounting"
          className={`${vulfMono.className} inline-flex items-center gap-2 text-xs text-neutral-500 hover:text-[#884A20] transition-colors`}
        >
          <Landmark className="w-3.5 h-3.5" />
          Accounting (ledger, inbox, reconcile) stays in the app
        </Link>
      </div>
    </section>
  );
}
