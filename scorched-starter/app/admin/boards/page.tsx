"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { vulfMono } from "@/app/fonts";

const BOARDS = [
  {
    name: "Pearson",
    fullName: "Pearson Brown",
    initials: "PB",
    label: "Operations Board",
    bg: "bg-violet-100",
    text: "text-violet-700",
    sessionKey: "projectsUser",
    href: "/admin/projects",
  },
  {
    name: "Jess",
    fullName: "Jess",
    initials: "JE",
    label: "Social Board",
    bg: "bg-sky-100",
    text: "text-sky-700",
    sessionKey: "socialUser",
    href: "/admin/social",
  },
];

export default function AdminBoardsPage() {
  const router = useRouter();

  function handleSelect(board: (typeof BOARDS)[0]) {
    sessionStorage.setItem(board.sessionKey, board.fullName);
    router.push(board.href);
  }

  return (
    <section className="container-px py-20 max-w-md mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <a
            href="/admin"
            className="text-neutral-400 hover:text-neutral-700 transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </a>
          <p className="eyebrow text-brand">Boards</p>
        </div>
        <h1 className="h2 font-bold">Choose a board</h1>
      </div>
      <div className="space-y-3">
        {BOARDS.map((board) => (
          <button
            key={board.name}
            onClick={() => handleSelect(board)}
            className="w-full flex items-center gap-4 rounded-2xl border border-black/10 bg-white p-5 shadow-sm hover:shadow-md hover:border-black/20 transition-all text-left"
          >
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${board.bg}`}
            >
              <span className={`${vulfMono.className} text-sm font-bold ${board.text}`}>
                {board.initials}
              </span>
            </div>
            <div>
              <p className="font-medium text-sm">{board.name}</p>
              <p className={`${vulfMono.className} text-xs text-neutral-400 mt-0.5`}>
                {board.label}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
