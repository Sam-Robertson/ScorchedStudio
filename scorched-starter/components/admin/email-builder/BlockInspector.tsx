"use client";

// The settings panel for whichever block is selected, plus the global design
// controls. Every field writes straight back into the block, which is what the
// preview and the send both read, so there is nowhere for a setting to be
// stored and then ignored.
import { useState } from "react";
import { vulfMono } from "@/app/fonts";
import { Image as ImageIcon, PanelRight, X } from "lucide-react";
import {
  BLOCK_LABELS,
  FONT_STACKS,
  MERGE_TAGS,
  type EmailBlock,
  type EmailDesign,
} from "@/lib/marketing/email-blocks";
import RichTextEditor from "./RichTextEditor";
import MediaPicker from "./MediaPicker";
import { inputCls } from "./api";

const labelCls = `${vulfMono.className} block text-xs text-neutral-500 mb-1.5`;

export function BlockInspector({
  block,
  onChange,
  onWrapTextBeside,
}: {
  block: EmailBlock;
  onChange: (block: EmailBlock) => void;
  // Turns this image block into an image-and-text block, absorbing the text
  // block below it if there is one. Offered on image blocks only.
  onWrapTextBeside?: () => void;
}) {
  // A narrow cast in one place rather than a switch that rebuilds the whole
  // block for every field. The schema is the thing that actually guards the
  // shape, on the server, on every save.
  const set = (patch: Record<string, unknown>) => onChange({ ...block, ...patch } as EmailBlock);

  return (
    <div className="space-y-3">
      <div className={`${vulfMono.className} text-xs uppercase tracking-[0.1em] text-neutral-400`}>
        {BLOCK_LABELS[block.type]}
      </div>

      {block.type === "heading" && (
        <>
          <Field label="Text">
            <input className={inputCls} value={block.text} onChange={(e) => set({ text: e.target.value })} />
          </Field>
          <Field label="Size">
            <select
              className={inputCls}
              value={block.level}
              onChange={(e) => set({ level: Number(e.target.value) })}
            >
              <option value={1}>Large</option>
              <option value={2}>Medium</option>
              <option value={3}>Small</option>
            </select>
          </Field>
          <AlignField value={block.align} onChange={(align) => set({ align })} />
        </>
      )}

      {block.type === "text" && (
        <Field label="Text">
          <RichTextEditor value={block.html} onChange={(html) => set({ html })} />
        </Field>
      )}

      {block.type === "image" && (
        <>
          <ImageField label="Image" value={block.src} onChange={(src) => set({ src })} />
          <Field label="Alt text (what it says when images are blocked)">
            <input className={inputCls} value={block.alt} onChange={(e) => set({ alt: e.target.value })} />
          </Field>
          <Field label="Width">
            <select className={inputCls} value={block.width} onChange={(e) => set({ width: e.target.value })}>
              <option value="full">Full width</option>
              <option value="half">Half</option>
              <option value="third">A third</option>
            </select>
          </Field>
          <AlignField value={block.align} onChange={(align) => set({ align })} />
          <Field label="Link (optional)">
            <input
              className={inputCls}
              placeholder="https://"
              value={block.href}
              onChange={(e) => set({ href: e.target.value })}
            />
          </Field>

          {onWrapTextBeside && (
            <div className="rounded-lg bg-neutral-50 p-3">
              <button
                type="button"
                onClick={onWrapTextBeside}
                className="flex items-center gap-1.5 text-sm text-[#884A20] hover:underline"
              >
                <PanelRight className="w-3.5 h-3.5" /> Put text beside this image
              </button>
              <p className="text-xs text-neutral-500 mt-1">
                Converts this into an image-and-text block. If there is a text block right below,
                its words come along.
              </p>
            </div>
          )}
        </>
      )}

      {block.type === "button" && (
        <>
          <Field label="Label">
            <input className={inputCls} value={block.label} onChange={(e) => set({ label: e.target.value })} />
          </Field>
          <Field label="Link">
            <input
              className={inputCls}
              placeholder="https://scorchedstudio.com/book"
              value={block.href}
              onChange={(e) => set({ href: e.target.value })}
            />
          </Field>
          <AlignField value={block.align} onChange={(align) => set({ align })} />
        </>
      )}

      {block.type === "spacer" && (
        <Field label="Height">
          <select className={inputCls} value={block.size} onChange={(e) => set({ size: e.target.value })}>
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
          </select>
        </Field>
      )}

      {block.type === "divider" && (
        <p className="text-sm text-neutral-400">A horizontal rule. Nothing to set.</p>
      )}

      {block.type === "quote" && (
        <>
          <Field label="Quote">
            <textarea
              className={`${inputCls} min-h-[90px]`}
              value={block.text}
              onChange={(e) => set({ text: e.target.value })}
            />
          </Field>
          <Field label="Who said it">
            <input
              className={inputCls}
              value={block.attribution}
              onChange={(e) => set({ attribution: e.target.value })}
            />
          </Field>
        </>
      )}

      {block.type === "columns" && (
        <>
          <ImageField label="Image" value={block.imageSrc} onChange={(imageSrc) => set({ imageSrc })} />
          <Field label="Alt text">
            <input
              className={inputCls}
              value={block.imageAlt}
              onChange={(e) => set({ imageAlt: e.target.value })}
            />
          </Field>
          <Field label="Title">
            <input className={inputCls} value={block.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Text">
            <RichTextEditor value={block.body} onChange={(body) => set({ body })} />
          </Field>
          <Field label="Link (optional)">
            <input
              className={inputCls}
              placeholder="https://"
              value={block.href}
              onChange={(e) => set({ href: e.target.value })}
            />
          </Field>
          <Field label="Image on the">
            <select
              className={inputCls}
              value={block.imagePosition}
              onChange={(e) => set({ imagePosition: e.target.value })}
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </Field>
          <Field label="Image width">
            <select
              className={inputCls}
              value={block.imageWidth}
              onChange={(e) => set({ imageWidth: e.target.value })}
            >
              <option value="33">A third</option>
              <option value="40">Narrow</option>
              <option value="50">Half</option>
              <option value="60">Wide</option>
            </select>
            <p className="text-xs text-neutral-400 mt-1">
              On a phone these stack, with the image on top, whatever is set here.
            </p>
          </Field>
        </>
      )}

      {block.type === "card" && (
        <>
          <ImageField label="Image" value={block.imageSrc} onChange={(imageSrc) => set({ imageSrc })} />
          <Field label="Alt text">
            <input
              className={inputCls}
              value={block.imageAlt}
              onChange={(e) => set({ imageAlt: e.target.value })}
            />
          </Field>
          <Field label="Title">
            <input className={inputCls} value={block.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Details (date, length, price)">
            <input
              className={inputCls}
              placeholder="Saturday, 2:00pm  ·  2 hours  ·  $65"
              value={block.meta}
              onChange={(e) => set({ meta: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <textarea
              className={`${inputCls} min-h-[80px]`}
              value={block.body}
              onChange={(e) => set({ body: e.target.value })}
            />
          </Field>
          <Field label="Button label">
            <input
              className={inputCls}
              value={block.buttonLabel}
              onChange={(e) => set({ buttonLabel: e.target.value })}
            />
          </Field>
          <Field label="Button link">
            <input
              className={inputCls}
              placeholder="https://scorchedstudio.com/book"
              value={block.buttonHref}
              onChange={(e) => set({ buttonHref: e.target.value })}
            />
          </Field>
        </>
      )}

      {block.type === "social" && (
        <>
          <Field label="Instagram">
            <input
              className={inputCls}
              placeholder="https://instagram.com/…"
              value={block.instagram}
              onChange={(e) => set({ instagram: e.target.value })}
            />
          </Field>
          <Field label="Facebook">
            <input
              className={inputCls}
              placeholder="https://facebook.com/…"
              value={block.facebook}
              onChange={(e) => set({ facebook: e.target.value })}
            />
          </Field>
          <Field label="Website">
            <input
              className={inputCls}
              placeholder="https://scorchedstudio.com"
              value={block.website}
              onChange={(e) => set({ website: e.target.value })}
            />
          </Field>
        </>
      )}
    </div>
  );
}

export function DesignPanel({
  design,
  onChange,
}: {
  design: EmailDesign;
  onChange: (design: EmailDesign) => void;
}) {
  const set = (patch: Partial<EmailDesign>) => onChange({ ...design, ...patch });

  return (
    <div className="space-y-3">
      <ColorField label="Page background" value={design.backgroundColor} onChange={(v) => set({ backgroundColor: v })} />
      <ColorField
        label="Email background"
        value={design.contentBackgroundColor}
        onChange={(v) => set({ contentBackgroundColor: v })}
      />
      <ColorField label="Body text" value={design.textColor} onChange={(v) => set({ textColor: v })} />
      <ColorField label="Headings" value={design.headingColor} onChange={(v) => set({ headingColor: v })} />
      <ColorField label="Links" value={design.linkColor} onChange={(v) => set({ linkColor: v })} />
      <ColorField label="Buttons" value={design.buttonColor} onChange={(v) => set({ buttonColor: v })} />
      <ColorField label="Button text" value={design.buttonTextColor} onChange={(v) => set({ buttonTextColor: v })} />

      <Field label="Font">
        <select
          className={inputCls}
          value={design.fontFamily}
          onChange={(e) => set({ fontFamily: e.target.value as EmailDesign["fontFamily"] })}
        >
          {/* Only fonts already on the device: email clients do not load web
              fonts, so anything else would silently fall back anyway. */}
          {(Object.keys(FONT_STACKS) as Array<keyof typeof FONT_STACKS>).map((key) => (
            <option key={key} value={key}>
              {key === "sans" ? "Sans serif" : key === "serif" ? "Serif" : "Monospace"}
            </option>
          ))}
        </select>
      </Field>

      <Field label={`Width (${design.contentWidth}px)`}>
        <input
          type="range"
          min={480}
          max={800}
          step={20}
          value={design.contentWidth}
          onChange={(e) => set({ contentWidth: Number(e.target.value) })}
          className="w-full accent-[#884A20]"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-neutral-600">
        <input
          type="checkbox"
          checked={design.showLogo}
          onChange={(e) => set({ showLogo: e.target.checked })}
          className="h-4 w-4 accent-[#884A20]"
        />
        Show the logo at the top
      </label>

      <div className="rounded-lg bg-neutral-50 p-3">
        <div className={`${vulfMono.className} text-xs text-neutral-500 mb-1.5`}>Merge tags</div>
        <p className="text-xs text-neutral-500 mb-2">
          Paste one of these into any text and it is replaced with that person&apos;s details.
        </p>
        {MERGE_TAGS.map((t) => (
          <div key={t.tag} className="text-xs text-neutral-600">
            <code className="rounded bg-white px-1 py-0.5 border border-black/10">{t.tag}</code>{" "}
            {t.label}
            {t.fallback ? ` (shows "${t.fallback}" when we do not know it)` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function AlignField({
  value,
  onChange,
}: {
  value: "left" | "center" | "right";
  onChange: (v: "left" | "center" | "right") => void;
}) {
  return (
    <Field label="Align">
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as "left")}>
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
      </select>
    </Field>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded border border-black/20 bg-white p-0.5"
        />
        <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </Field>
  );
}

function ImageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <Field label={label}>
      {value ? (
        <div className="relative rounded-lg border border-black/10 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="w-full max-h-40 object-cover" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-1.5 right-1.5 rounded-full bg-white/90 p-1 hover:bg-white"
            title="Remove"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="w-full rounded-lg border border-dashed border-black/20 px-4 py-6 text-xs text-neutral-500 hover:border-[#884A20] hover:text-[#884A20] flex flex-col items-center gap-1.5"
        >
          <ImageIcon className="w-5 h-5" />
          Choose an image
        </button>
      )}
      {value && (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="mt-1.5 text-xs text-neutral-500 underline hover:text-neutral-900"
        >
          Replace
        </button>
      )}
      {picking && <MediaPicker onPick={onChange} onClose={() => setPicking(false)} />}
    </Field>
  );
}
