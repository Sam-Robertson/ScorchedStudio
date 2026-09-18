"use client";

// The settings panel for whichever block is selected, plus the global design
// controls. Every field writes straight back into the block, which is what the
// preview and the send both read, so there is nowhere for a setting to be
// stored and then ignored.
import { useState } from "react";
import { vulfMono } from "@/app/fonts";
import { Check, Columns2, Image as ImageIcon, PanelRight, Rows3, Trash2, X } from "lucide-react";
import {
  BLOCK_LABELS,
  EMAIL_FONTS,
  MERGE_TAGS,
  type EmailBlock,
  type EmailDesign,
} from "@/lib/marketing/email-blocks";
import RichTextEditor from "./RichTextEditor";
import InlineTextEditor from "./InlineTextEditor";
import MediaPicker from "./MediaPicker";
import { inputCls } from "./api";

const labelCls = `${vulfMono.className} block text-xs text-neutral-500 mb-1.5`;

export function BlockInspector({
  block,
  onChange,
  onWrapTextBeside,
  onSplit,
  onCombineImages,
}: {
  block: EmailBlock;
  onChange: (block: EmailBlock) => void;
  // Turns this image block into an image-and-text block, absorbing the text
  // block below it if there is one. Offered on image blocks only.
  onWrapTextBeside?: () => void;
  // The inverse, offered on image-and-text blocks and on image rows.
  onSplit?: () => void;
  // Puts this image beside the image that follows it. Offered when there is
  // one to pair with.
  onCombineImages?: () => void;
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
            <InlineTextEditor
              value={block.text}
              onChange={(text) => set({ text })}
              placeholder="Your headline"
            />
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
          <Field label={`Width (${block.width}% of the email)`}>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={block.width}
              onChange={(e) => set({ width: Number(e.target.value) })}
              className="w-full accent-[#884A20]"
            />
            <div className="flex gap-1.5 mt-1.5">
              {[
                ["Third", 33],
                ["Half", 50],
                ["Full", 100],
              ].map(([label, value]) => (
                <button
                  key={label as string}
                  type="button"
                  onClick={() => set({ width: value })}
                  className={`rounded px-2 py-1 text-xs ${
                    block.width === value
                      ? "bg-neutral-200 text-neutral-900"
                      : "text-neutral-500 hover:bg-neutral-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
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

          {(onWrapTextBeside || onCombineImages) && (
            <div className="rounded-lg bg-neutral-50 p-3 space-y-3">
              {onWrapTextBeside && (
                <div>
                  <button
                    type="button"
                    onClick={onWrapTextBeside}
                    className="flex items-center gap-1.5 text-sm text-[#884A20] hover:underline"
                  >
                    <PanelRight className="w-3.5 h-3.5" /> Put text beside this image
                  </button>
                  <p className="text-xs text-neutral-500 mt-1">
                    Converts this into an image-and-text block. If there is a text block right
                    below, its words come along.
                  </p>
                </div>
              )}
              {onCombineImages && (
                <div>
                  <button
                    type="button"
                    onClick={onCombineImages}
                    className="flex items-center gap-1.5 text-sm text-[#884A20] hover:underline"
                  >
                    <Columns2 className="w-3.5 h-3.5" /> Put beside the next image
                  </button>
                  <p className="text-xs text-neutral-500 mt-1">
                    The two sit side by side on a computer and stack on a phone.
                  </p>
                </div>
              )}
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
            <InlineTextEditor value={block.title} onChange={(title) => set({ title })} />
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
          {onSplit && (
            <div className="rounded-lg bg-neutral-50 p-3">
              <button
                type="button"
                onClick={onSplit}
                className="flex items-center gap-1.5 text-sm text-[#884A20] hover:underline"
              >
                <Rows3 className="w-3.5 h-3.5" /> Split back into separate blocks
              </button>
              <p className="text-xs text-neutral-500 mt-1">
                The image and the text become their own blocks again, stacked. A title becomes a
                heading.
              </p>
            </div>
          )}
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
            <InlineTextEditor value={block.title} onChange={(title) => set({ title })} />
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

      {block.type === "imageRow" && (
        <>
          {block.images.map((img, i) => (
            <div key={i} className="rounded-lg border border-black/10 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className={`${vulfMono.className} text-xs text-neutral-500`}>
                  Image {i + 1}
                </span>
                {block.images.length > 1 && (
                  <button
                    type="button"
                    title="Remove this image"
                    onClick={() =>
                      set({ images: block.images.filter((_, n) => n !== i) })
                    }
                    className="text-neutral-300 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <ImageField
                label=""
                value={img.src}
                onChange={(src) =>
                  set({ images: block.images.map((x, n) => (n === i ? { ...x, src } : x)) })
                }
              />
              <input
                className={inputCls}
                placeholder="Alt text"
                value={img.alt}
                onChange={(e) =>
                  set({
                    images: block.images.map((x, n) =>
                      n === i ? { ...x, alt: e.target.value } : x
                    ),
                  })
                }
              />
              <input
                className={inputCls}
                placeholder="Link (optional)"
                value={img.href}
                onChange={(e) =>
                  set({
                    images: block.images.map((x, n) =>
                      n === i ? { ...x, href: e.target.value } : x
                    ),
                  })
                }
              />
            </div>
          ))}

          {block.images.length < 3 && (
            <button
              type="button"
              onClick={() => set({ images: [...block.images, { src: "", alt: "", href: "" }] })}
              className="text-sm text-[#884A20] hover:underline"
            >
              Add another image
            </button>
          )}
          {block.images.length >= 3 && (
            <p className="text-xs text-neutral-400">
              Three is the most that fits. A fourth leaves each one too small to read.
            </p>
          )}

          {(onSplit || onCombineImages) && (
            <div className="rounded-lg bg-neutral-50 p-3 space-y-3">
              {onCombineImages && (
                <div>
                  <button
                    type="button"
                    onClick={onCombineImages}
                    className="flex items-center gap-1.5 text-sm text-[#884A20] hover:underline"
                  >
                    <Columns2 className="w-3.5 h-3.5" /> Add the image below to this row
                  </button>
                </div>
              )}
              {onSplit && (
                <div>
                  <button
                    type="button"
                    onClick={onSplit}
                    className="flex items-center gap-1.5 text-sm text-[#884A20] hover:underline"
                  >
                    <Rows3 className="w-3.5 h-3.5" /> Split back into separate blocks
                  </button>
                  <p className="text-xs text-neutral-500 mt-1">
                    Each image becomes its own block again, stacked.
                  </p>
                </div>
              )}
            </div>
          )}
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

      <FontField
        label="Body font"
        value={design.fontFamily}
        onChange={(fontFamily) => set({ fontFamily })}
      />
      <FontField
        label="Heading font"
        value={design.headingFontFamily}
        onChange={(headingFontFamily) => set({ headingFontFamily })}
      />

      <p className="text-xs text-neutral-400">
        Vulf Sans and Vulf Mono are the website&apos;s own fonts. Apple Mail and Outlook on a Mac
        show them; Gmail and Outlook on Windows ignore custom fonts in email and fall back to the
        closest thing already on the device, which is what the other options are.
      </p>

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

// next/font hashes the family name, so the admin refers to the brand faces
// through the variables it sets rather than by the name the email uses.
const ADMIN_FONT_VARS: Record<string, string> = {
  brandSans: "var(--font-sans)",
  brandMono: "var(--font-display)",
};

function adminStackFor(key: string, stack: string): string {
  const variable = ADMIN_FONT_VARS[key];
  return variable ? `${variable}, ${stack}` : stack;
}

function FontField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (key: EmailDesign["fontFamily"]) => void;
}) {
  return (
    <Field label={label}>
      <div className="space-y-1">
        {EMAIL_FONTS.map((font) => (
          <button
            key={font.key}
            type="button"
            onClick={() => onChange(font.key as EmailDesign["fontFamily"])}
            className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left ${
              value === font.key
                ? "border-[#884A20] bg-[#884A20]/5"
                : "border-black/10 hover:border-black/25"
            }`}
          >
            <span className="min-w-0">
              {/* Shown in its own face. The brand entries go through the CSS
                  variables next/font defines, because next/font rewrites the
                  family to a hashed name and the literal "Vulf Sans" the email
                  uses does not exist in this page. */}
              <span
                className="block truncate text-sm text-neutral-800"
                style={{ fontFamily: adminStackFor(font.key, font.stack) }}
              >
                {font.label}
              </span>
              <span className="block text-xs text-neutral-400">{font.note}</span>
            </span>
            {value === font.key && <Check className="h-3.5 w-3.5 shrink-0 text-[#884A20]" />}
          </button>
        ))}
      </div>
    </Field>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label ? <label className={labelCls}>{label}</label> : null}
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
