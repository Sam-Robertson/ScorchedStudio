"use client";

// The live preview.
//
// Rendered on the server by the same code the send uses, then dropped into an
// iframe with srcDoc. The iframe matters: an email's HTML carries its own
// styles, and rendering it inline would let the admin page's Tailwind reset
// bleed into it, so the preview would look nothing like the real thing.
import { useEffect, useRef, useState } from "react";
import { vulfMono } from "@/app/fonts";
import { Loader2, Monitor, Moon, Smartphone, Sun } from "lucide-react";
import type { EmailBlock, EmailDesign } from "@/lib/marketing/email-blocks";
import { api } from "./api";

type Props = {
  blocks: EmailBlock[];
  design: EmailDesign;
  subject: string;
  previewText: string;
};

type Device = "desktop" | "mobile";
type Theme = "light" | "dark";

// Approximates what a dark-mode client does to a message: most of them invert
// the page around the email rather than the email itself, which is why a
// preview that only flips its own background is misleading.
const DARK_WRAPPER = `
  <style>
    html { background: #1b1b1b; }
    body { filter: invert(1) hue-rotate(180deg); background: #1b1b1b !important; }
    img { filter: invert(1) hue-rotate(180deg); }
  </style>
`;

export default function EmailPreview({ blocks, design, subject, previewText }: Props) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [device, setDevice] = useState<Device>("desktop");
  const [theme, setTheme] = useState<Theme>("light");

  // Guards against an older render landing after a newer one. Without it, a
  // fast edit followed by a slow request shows stale content.
  const requestId = useRef(0);

  useEffect(() => {
    const mine = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const body = await api("/api/admin/marketing/render", {
          method: "POST",
          body: JSON.stringify({ blocks, design, subject, previewText }),
        });
        if (mine !== requestId.current) return;
        setHtml(body.html);
        setError("");
      } catch (err) {
        if (mine !== requestId.current) return;
        setError(err instanceof Error ? err.message : "Could not render the preview");
      } finally {
        if (mine === requestId.current) setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [blocks, design, subject, previewText]);

  const shown = theme === "dark" ? html.replace("</head>", `${DARK_WRAPPER}</head>`) : html;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 border-b border-black/10 px-3 py-2">
        <div className={`${vulfMono.className} text-xs text-neutral-500 truncate`}>
          {subject.trim() || "No subject yet"}
        </div>
        <div className="flex gap-1 shrink-0">
          <Toggle on={device === "desktop"} onClick={() => setDevice("desktop")} title="Desktop width">
            <Monitor className="w-3.5 h-3.5" />
          </Toggle>
          <Toggle on={device === "mobile"} onClick={() => setDevice("mobile")} title="Phone width">
            <Smartphone className="w-3.5 h-3.5" />
          </Toggle>
          <span className="w-px bg-black/10 mx-1" />
          <Toggle on={theme === "light"} onClick={() => setTheme("light")} title="Light mode">
            <Sun className="w-3.5 h-3.5" />
          </Toggle>
          <Toggle on={theme === "dark"} onClick={() => setTheme("dark")} title="Dark mode">
            <Moon className="w-3.5 h-3.5" />
          </Toggle>
        </div>
      </div>

      {previewText.trim() && (
        <div className="px-3 py-1.5 text-xs text-neutral-400 border-b border-black/5 truncate">
          {previewText}
        </div>
      )}

      <div className="flex-1 overflow-auto bg-neutral-100 p-4">
        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : loading && !html ? (
          <p className="text-sm text-neutral-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Rendering…
          </p>
        ) : (
          <iframe
            title="Email preview"
            srcDoc={shown}
            // The preview is our own rendered HTML, but it can carry an image
            // from anywhere and links the author pasted. Sandboxing without
            // allow-scripts and allow-same-origin means it cannot reach the
            // admin page around it.
            sandbox=""
            className="bg-white border border-black/10 mx-auto block"
            style={{
              width: device === "mobile" ? 390 : "100%",
              maxWidth: device === "mobile" ? 390 : 760,
              height: "100%",
              minHeight: 520,
            }}
          />
        )}
      </div>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded p-1.5 ${on ? "bg-neutral-200 text-neutral-900" : "text-neutral-400 hover:bg-neutral-100"}`}
    >
      {children}
    </button>
  );
}
