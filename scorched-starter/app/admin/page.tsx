"use client";

import { vulfMono } from "@/app/fonts";

export default function AdminDashboardPage() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="container-px py-12 max-w-4xl mx-auto">
      <p className={`${vulfMono.className} text-xs text-neutral-400 mb-1`}>{today}</p>
      <h1 className="h2 font-bold mb-2">Dashboard</h1>
      <p className="lead text-neutral-500">Welcome back. Use the sidebar to navigate.</p>
    </section>
  );
}
