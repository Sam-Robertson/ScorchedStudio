"use client";

// Pick an image for a block: upload a new one, or reuse one already uploaded.
//
// Pictures are shrunk in the browser before they are sent. A photo straight
// off a phone is several megabytes, which is larger than a serverless request
// body is allowed to be, and the server would only resize it again anyway.
// The server still re-encodes what arrives, so this is a convenience rather
// than the thing being trusted.
import { useCallback, useEffect, useState } from "react";
import { vulfMono } from "@/app/fonts";
import { Loader2, Upload, X } from "lucide-react";
import { api, upload, btnCls } from "./api";

type LibraryImage = { name: string; url: string; size: number | null; createdAt: string | null };

// Generous compared with the 1200px the server stores, so the server is
// resizing a good original rather than upscaling something already squashed.
const CLIENT_MAX_WIDTH = 1600;

async function shrink(file: File): Promise<Blob> {
  // Animated GIFs lose their animation if they go through a canvas, so they
  // are sent as they are and the 4MB limit applies.
  if (file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file);
  if (bitmap.width <= CLIENT_MAX_WIDTH) {
    bitmap.close();
    return file;
  }

  const scale = CLIENT_MAX_WIDTH / bitmap.width;
  const canvas = document.createElement("canvas");
  canvas.width = CLIENT_MAX_WIDTH;
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );
  return blob ?? file;
}

export default function MediaPicker({
  onPick,
  onClose,
}: {
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await api("/api/admin/marketing/media");
      setImages(body.images ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the image library");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleFile(file: File) {
    setBusy(true);
    setError("");
    try {
      const shrunk = await shrink(file);
      const form = new FormData();
      form.append("file", shrunk, file.name);
      const body = await upload("/api/admin/marketing/media", form);
      onPick(body.url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 my-8">
        <div className="flex justify-between items-start mb-4">
          <h2 className={`${vulfMono.className} text-sm tracking-[0.15em] uppercase`}>Choose an image</h2>
          <button onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <label
          className={`${btnCls} ${vulfMono.className} inline-flex items-center gap-2 bg-[#884A20] text-white cursor-pointer mb-4`}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {busy ? "UPLOADING…" : "UPLOAD AN IMAGE"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Cleared so choosing the same file twice still fires a change.
              e.target.value = "";
              if (file) handleFile(file);
            }}
          />
        </label>

        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

        {loading ? (
          <p className="text-sm text-neutral-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </p>
        ) : images.length === 0 ? (
          <p className="text-sm text-neutral-400">No images uploaded yet.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {images.map((img) => (
              <button
                key={img.name}
                type="button"
                onClick={() => {
                  onPick(img.url);
                  onClose();
                }}
                className="aspect-square rounded-lg border border-black/10 overflow-hidden hover:border-[#884A20]"
                title={img.name}
              >
                {/* A plain img, not next/image: these are arbitrary uploads in
                    a picker, and the optimizer adds nothing for a thumbnail. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
