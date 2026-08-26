"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/account/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button onClick={handleLogout} className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700">
      Log out
    </button>
  );
}
