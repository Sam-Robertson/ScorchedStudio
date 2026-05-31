"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { vulfMono } from "@/app/fonts";
import { CheckCheck, Download, Inbox, Printer, RotateCcw } from "lucide-react";
import type { PrintJobRecord } from "@/lib/supabase";

type JobWithProduct = PrintJobRecord & {
  products: { name: string; width_in: number; height_in: number } | null;
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function fmtDateForFilename(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function downloadAsPng(dataUrl: string, filename: string) {
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename;
  a.click();
}

function openPrintTab(job: JobWithProduct) {
  const name = job.products?.name ?? "Product";
  const w = job.products?.width_in ?? 4;
  const h = job.products?.height_in ?? 4;
  const label = `${name} — ${w}″W × ${h}″H`;

  const win = window.open("", "_blank");
  if (!win) return;

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Print — ${name}</title>
  <style>
    @page { margin: 0; size: auto; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #fff; }
    .page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 0.375in;
    }
    img {
      display: block;
      width: ${w}in;
      height: ${h}in;
      object-fit: contain;
      border: 0.5pt solid #ddd;
    }
    .label {
      margin-top: 6pt;
      font-family: 'Courier New', Courier, monospace;
      font-size: 8pt;
      color: #555;
      text-align: center;
      letter-spacing: 0.04em;
    }
    @media print {
      @page { margin: 0; }
      .page { padding: 0.375in; }
    }
  </style>
</head>
<body>
  <div class="page">
    <img src="${job.image_base64}" alt="${name}" />
    <p class="label">${label}</p>
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 300);
    });
  </script>
</body>
</html>`);
  win.document.close();
}

export default function PrintQueuePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("adminToken");
    if (!saved) { router.replace("/admin"); return; }
    setToken(saved);
  }, [router]);

  if (!token) return null;
  return <PrintQueueDashboard token={token} />;
}

function PrintQueueDashboard({ token }: { token: string }) {
  const [jobs, setJobs] = useState<JobWithProduct[]>([]);
  const [recentlyPrinted, setRecentlyPrinted] = useState<JobWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/print-jobs", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(({ jobs: list, recentlyPrinted: printed, error: err }) => {
        if (err) throw new Error(err);
        setJobs(list ?? []);
        setRecentlyPrinted(printed ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function markPrinted(id: string) {
    setMarking(id);
    try {
      const res = await fetch(`/api/admin/print-jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to update");
      const job = jobs.find((j) => j.id === id);
      if (job) {
        setJobs((prev) => prev.filter((j) => j.id !== id));
        setRecentlyPrinted((prev) => [{ ...job, status: "printed" as const }, ...prev]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setMarking(null);
    }
  }

  async function restoreJob(id: string) {
    setRestoring(id);
    try {
      const res = await fetch(`/api/admin/print-jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restore: true }),
      });
      if (!res.ok) throw new Error("Failed to restore");
      const job = recentlyPrinted.find((j) => j.id === id);
      if (job) {
        setRecentlyPrinted((prev) => prev.filter((j) => j.id !== id));
        setJobs((prev) => [...prev, { ...job, status: "pending" as const }].sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setRestoring(null);
    }
  }

  return (
    <section className="container-px py-12 sm:py-16 max-w-4xl mx-auto">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="h2 font-bold">Print Queue</h1>
        </div>
        <button
          onClick={load}
          className={`${vulfMono.className} text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700`}
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-6">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
          <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
          Loading queue…
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-neutral-400">
          <Inbox className="w-10 h-10" />
          <p className={`${vulfMono.className} text-sm`}>Queue is empty</p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => {
            const productSlug = slugify(job.products?.name ?? "product");
            const dateSlug = fmtDateForFilename(job.created_at);
            const filename = `scorched-print-${productSlug}-${dateSlug}.png`;

            return (
              <div
                key={job.id}
                className="rounded-2xl border border-black/10 bg-white p-4 sm:p-5 shadow-sm"
              >
                {/* Top row: thumbnail + info */}
                <div className="flex gap-4 items-start">
                  <div className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden border border-black/10 bg-neutral-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={job.image_base64}
                      alt="Design thumbnail"
                      className="w-full h-full object-contain"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`${vulfMono.className} font-bold text-sm`}>
                      {job.products?.name ?? "Unknown product"}
                    </p>
                    {job.products && (
                      <p className={`${vulfMono.className} text-xs text-neutral-500 mt-0.5`}>
                        {job.products.width_in}&Prime;W × {job.products.height_in}&Prime;H
                      </p>
                    )}
                    <p className={`${vulfMono.className} text-xs text-neutral-400 mt-2`}>
                      Submitted {fmtDateTime(job.created_at)}
                    </p>
                  </div>

                  {/* Buttons: column on sm+, hidden here on mobile */}
                  <div className="hidden sm:flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => openPrintTab(job)}
                      aria-label="Print"
                      className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#884A20] px-4 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90`}
                    >
                      <Printer className="w-3.5 h-3.5" />
                      PRINT
                    </button>
                    <button
                      onClick={() => downloadAsPng(job.image_base64, filename)}
                      aria-label="Download as PNG"
                      className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl border border-black/15 bg-white px-4 py-2.5 text-xs tracking-[0.15em] text-neutral-700 font-semibold hover:bg-neutral-50`}
                    >
                      <Download className="w-3.5 h-3.5" />
                      DOWNLOAD
                    </button>
                    <button
                      onClick={() => markPrinted(job.id)}
                      disabled={marking === job.id}
                      aria-label="Mark as printed"
                      className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl bg-[#519A70] px-4 py-2.5 text-xs tracking-[0.15em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      {marking === job.id ? "SAVING…" : "MARK PRINTED"}
                    </button>
                  </div>
                </div>

                {/* Buttons: icon row on mobile only */}
                <div className="sm:hidden flex gap-2 mt-3 pt-3 border-t border-black/5">
                  <button
                    onClick={() => openPrintTab(job)}
                    aria-label="Print"
                    className={`${vulfMono.className} flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#884A20] py-2.5 text-xs tracking-[0.12em] text-white font-semibold hover:opacity-90`}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    PRINT
                  </button>
                  <button
                    onClick={() => downloadAsPng(job.image_base64, filename)}
                    aria-label="Download as PNG"
                    className={`${vulfMono.className} flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-black/15 bg-white py-2.5 text-xs tracking-[0.12em] text-neutral-700 font-semibold hover:bg-neutral-50`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    SAVE
                  </button>
                  <button
                    onClick={() => markPrinted(job.id)}
                    disabled={marking === job.id}
                    aria-label="Mark as printed"
                    className={`${vulfMono.className} flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#519A70] py-2.5 text-xs tracking-[0.12em] text-white font-semibold hover:opacity-90 disabled:opacity-60`}
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    DONE
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recently Printed */}
      {recentlyPrinted.length > 0 && (
        <div className="mt-12">
          <h2 className={`${vulfMono.className} text-xs tracking-widest uppercase text-neutral-400 mb-4`}>
            Recently Printed
          </h2>
          <div className="space-y-3">
            {recentlyPrinted.map((job) => {
              const productSlug = slugify(job.products?.name ?? "product");
              const dateSlug = fmtDateForFilename(job.created_at);
              const filename = `scorched-print-${productSlug}-${dateSlug}.png`;
              return (
                <div
                  key={job.id}
                  className="rounded-2xl border border-black/10 bg-neutral-50 p-4 sm:p-5 opacity-70"
                >
                  <div className="flex gap-4 items-center">
                    <div className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-black/10 bg-neutral-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={job.image_base64}
                        alt="Design thumbnail"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`${vulfMono.className} font-bold text-sm`}>
                        {job.products?.name ?? "Unknown product"}
                      </p>
                      <p className={`${vulfMono.className} text-xs text-neutral-400 mt-0.5`}>
                        Printed {fmtDateTime(job.printed_at ?? job.created_at)}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => downloadAsPng(job.image_base64, filename)}
                        aria-label="Download as PNG"
                        className={`${vulfMono.className} hidden sm:flex items-center gap-1.5 rounded-xl border border-black/15 bg-white px-3 py-2 text-xs tracking-[0.12em] text-neutral-600 font-semibold hover:bg-neutral-50`}
                      >
                        <Download className="w-3.5 h-3.5" />
                        DOWNLOAD
                      </button>
                      <button
                        onClick={() => restoreJob(job.id)}
                        disabled={restoring === job.id}
                        aria-label="Move back to queue"
                        className={`${vulfMono.className} flex items-center gap-1.5 rounded-xl border border-black/15 bg-white px-3 py-2 text-xs tracking-[0.12em] text-neutral-600 font-semibold hover:bg-neutral-50 disabled:opacity-60`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{restoring === job.id ? "RESTORING…" : "RESTORE"}</span>
                        <span className="sm:hidden">{restoring === job.id ? "…" : "UNDO"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className={`${vulfMono.className} text-xs text-neutral-300 text-center mt-12`}>
        Printed jobs are automatically removed after 24 hours.
      </p>
    </section>
  );
}
