"use client";

import { useEffect, useRef, useState } from "react";
import { vulfMono } from "@/app/fonts";
import { CheckCircle, Upload, ChevronDown } from "lucide-react";
import type { ProductRecord } from "@/lib/supabase";

const DPI = 96;
const inputCls =
  "rounded-lg border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 w-full";

type Product = Pick<ProductRecord, "id" | "name" | "width_in" | "height_in" | "notes">;

async function scaleImageToCanvas(
  file: File,
  product: Product,
  canvas: HTMLCanvasElement
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const targetW = Math.round(product.width_in * DPI);
      const targetH = Math.round(product.height_in * DPI);
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
      const scale = Math.min(targetW / img.naturalWidth, targetH / img.naturalHeight);
      const scaledW = img.naturalWidth * scale;
      const scaledH = img.naturalHeight * scale;
      const offsetX = (targetW - scaledW) / 2;
      const offsetY = (targetH - scaledH) / 2;
      ctx.drawImage(img, offsetX, offsetY, scaledW, scaledH);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

export default function PrintDesignPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedProduct = products.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then(({ products: list }) => {
        if (list?.length) {
          setProducts(list);
          setSelectedId(list[0].id);
        }
      })
      .catch(() => setError("Failed to load products. Please refresh."));
  }, []);

  useEffect(() => {
    if (!file || !selectedProduct || !canvasRef.current) return;
    setProcessing(true);
    setPreview(null);
    setError(null);
    scaleImageToCanvas(file, selectedProduct, canvasRef.current)
      .then((dataUrl) => setPreview(dataUrl))
      .catch(() => setError("Could not process image. Please try a different file."))
      .finally(() => setProcessing(false));
  }, [file, selectedProduct]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    if (!chosen) return;
    if (!chosen.type.startsWith("image/")) {
      setError("Please upload a PNG or JPG image.");
      return;
    }
    setError(null);
    setFile(chosen);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!preview || !selectedProduct) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/print-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: selectedProduct.id, image_base64: preview }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg || "Submission failed");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <section className="container-px py-12 sm:py-20 max-w-lg mx-auto text-center">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-[#519A70]/15 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-[#519A70]" />
          </div>
        </div>
        <h1 className="h2 font-bold mb-3">Design Sent!</h1>
        <p className="lead text-neutral-600 mb-8">
          Your design has been sent to the studio. We&apos;ll take it from here — keep an eye out
          for updates.
        </p>
        <button
          onClick={() => {
            setSubmitted(false);
            setFile(null);
            setPreview(null);
            setError(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          className={`${vulfMono.className} rounded-xl bg-[#884A20] px-8 py-3 text-sm tracking-[0.2em] text-white font-semibold hover:opacity-90`}
        >
          SUBMIT ANOTHER
        </button>
      </section>
    );
  }

  return (
    <section className="container-px py-10 sm:py-16 max-w-2xl mx-auto">
      <p className="eyebrow text-brand mb-2">Scorched Studio</p>
      <h1 className="h2 font-bold mb-2">Submit Your Design</h1>
      <p className="lead text-neutral-600 mb-8 sm:mb-10">
        Upload a line drawing and choose your product. We&apos;ll scale it and have it ready to
        burn.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
        {/* Product selector */}
        <div>
          <label className={`${vulfMono.className} block text-xs font-bold uppercase tracking-widest mb-2 text-neutral-500`}>
            1. Choose your product
          </label>
          <div className="relative">
            <select
              className={`${inputCls} appearance-none pr-10 py-3 cursor-pointer`}
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.width_in}&Prime; × {p.height_in}&Prime;
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
          </div>
          {selectedProduct?.notes && (
            <p className="text-xs text-neutral-500 mt-1.5">{selectedProduct.notes}</p>
          )}
        </div>

        {/* File upload */}
        <div>
          <label className={`${vulfMono.className} block text-xs font-bold uppercase tracking-widest mb-2 text-neutral-500`}>
            2. Upload your design
          </label>
          <label
            htmlFor="design-upload"
            className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-black/20 bg-white p-8 sm:p-10 cursor-pointer hover:border-black/40 transition-colors"
          >
            <Upload className="w-8 h-8 text-neutral-400" />
            <span className="text-sm text-neutral-500">
              {file ? file.name : "Click to upload PNG or JPG"}
            </span>
            <input
              id="design-upload"
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              className="sr-only"
              onChange={handleFileChange}
            />
          </label>
        </div>

        {/* Hidden canvas for processing */}
        <canvas ref={canvasRef} className="hidden" aria-hidden />

        {/* Preview */}
        {(processing || preview) && (
          <div>
            <label className={`${vulfMono.className} block text-xs font-bold uppercase tracking-widest mb-3 text-neutral-500`}>
              3. Preview
            </label>
            <div className="rounded-2xl border border-black/10 bg-white p-6 flex flex-col items-center gap-4">
              {processing ? (
                <div className="flex items-center gap-2 text-sm text-neutral-500 py-10">
                  <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
                  Scaling your design…
                </div>
              ) : preview ? (
                <>
                  {/* Display preview at constrained size, preserving product aspect ratio */}
                  <div
                    style={{
                      aspectRatio: `${selectedProduct?.width_in ?? 1} / ${selectedProduct?.height_in ?? 1}`,
                      maxWidth: 320,
                      width: "100%",
                    }}
                    className="relative rounded-lg overflow-hidden border border-black/10 shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview}
                      alt="Scaled design preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className={`${vulfMono.className} text-xs text-neutral-400`}>
                    {selectedProduct?.name} — {selectedProduct?.width_in}&Prime;W ×{" "}
                    {selectedProduct?.height_in}&Prime;H
                  </p>
                </>
              ) : null}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={!preview || submitting}
          className={`${vulfMono.className} w-full rounded-xl bg-[#884A20] py-4 text-sm tracking-[0.2em] text-white font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity`}
        >
          {submitting ? "SENDING…" : "SEND TO STUDIO"}
        </button>
      </form>
    </section>
  );
}
