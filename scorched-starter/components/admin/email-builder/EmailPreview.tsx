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
  selectedId?: string | null;
  onSelect?: (id: string) => void;
};

type Device = "desktop" | "mobile";
type Theme = "light" | "dark";

// Approximates what a dark-mode client does to a message: most of them invert
// the page around the email rather than the email itself, which is why a
// preview that only flips its own background is misleading.
// Injected into the preview only, never into anything that sends.
//
// The iframe runs this with allow-scripts but without allow-same-origin, so it
// sits in an opaque origin: it can post a message out and nothing else. It
// cannot read the admin page, its cookies, or its storage. Author content
// reaching it has already had scripts and event handlers stripped by the
// sanitizer, so this is the only code in there.
const EDITOR_SCRIPT = `
  <style>
    [data-block-id] { position: relative; cursor: pointer; }
    [data-block-id]:hover { outline: 2px solid rgba(136,74,32,.35); outline-offset: 2px; }
    [data-sc-selected] { outline: 2px solid #884A20 !important; outline-offset: 2px; }
  </style>
  <script>
    (function () {
      function idFor(target) {
        var node = target;
        while (node && node !== document.body) {
          if (node.getAttribute && node.getAttribute('data-block-id')) {
            return node.getAttribute('data-block-id');
          }
          node = node.parentNode;
        }
        return null;
      }

      document.addEventListener('click', function (event) {
        // A link in a preview should select its block, not try to navigate
        // the frame away from the email being edited.
        event.preventDefault();
        var id = idFor(event.target);
        if (id) parent.postMessage({ source: 'scorched-preview', type: 'select', id: id }, '*');
      });

      window.addEventListener('message', function (event) {
        var data = event.data;
        if (!data || data.source !== 'scorched-editor') return;
        var previous = document.querySelector('[data-sc-selected]');
        if (previous) previous.removeAttribute('data-sc-selected');
        if (!data.id) return;
        var next = document.querySelector('[data-block-id="' + data.id + '"]');
        if (next) {
          next.setAttribute('data-sc-selected', '');
          next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
    })();
  <\/script>
`;

const DARK_WRAPPER = `
  <style>
    html { background: #1b1b1b; }
    body { filter: invert(1) hue-rotate(180deg); background: #1b1b1b !important; }
    img { filter: invert(1) hue-rotate(180deg); }
  </style>
`;

export default function EmailPreview({
  blocks,
  design,
  subject,
  previewText,
  selectedId,
  onSelect,
}: Props) {
  const frame = useRef<HTMLIFrameElement | null>(null);
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

  // Clicks inside the frame come back as a message. The check on the source
  // window matters: the frame has no same-origin access, so its messages
  // arrive with a null origin, and anything on the page could otherwise post
  // one that looks the same.
  useEffect(() => {
    function handle(event: MessageEvent) {
      if (frame.current && event.source !== frame.current.contentWindow) return;
      const data = event.data as { source?: string; type?: string; id?: string } | null;
      if (data?.source !== "scorched-preview" || data.type !== "select" || !data.id) return;
      onSelect?.(data.id);
    }
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [onSelect]);

  // Mirrors the selection the other way, so picking a block in the outline
  // highlights it here and scrolls it into view.
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { source: "scorched-editor", id: selectedId ?? null },
      "*"
    );
  }, [selectedId, html, device, theme]);

  const withEditor = html ? html.replace("</body>", `${EDITOR_SCRIPT}</body>`) : html;
  const shown =
    theme === "dark" ? withEditor.replace("</head>", `${DARK_WRAPPER}</head>`) : withEditor;

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
            ref={frame}
            srcDoc={shown}
            onLoad={() =>
              frame.current?.contentWindow?.postMessage(
                { source: "scorched-editor", id: selectedId ?? null },
                "*"
              )
            }
            // allow-scripts runs the small selection script injected above.
            // allow-same-origin is deliberately still absent, which leaves the
            // frame in an opaque origin: it can post a message out and nothing
            // else, so it cannot reach the admin page, its cookies, or its
            // storage. Author content in here has already had scripts and
            // handlers stripped by the sanitizer.
            sandbox="allow-scripts"
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
