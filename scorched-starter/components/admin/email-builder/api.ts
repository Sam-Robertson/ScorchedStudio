// Shared fetch helper for the email builder, matching the one the marketing
// page uses: admin token on every call, errors surfaced as thrown messages.
import { getAdminToken } from "@/lib/adminAuth";

export async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAdminToken() ?? ""}`,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "Request failed");
  return body;
}

// Uploads go out as multipart, so this one must not set a Content-Type: the
// browser has to add its own boundary parameter.
export async function upload(path: string, form: FormData) {
  const res = await fetch(path, {
    method: "POST",
    body: form,
    headers: { Authorization: `Bearer ${getAdminToken() ?? ""}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "Upload failed");
  return body;
}

export const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";
export const btnCls = "rounded-lg px-4 py-2 text-xs font-semibold tracking-[0.1em]";
