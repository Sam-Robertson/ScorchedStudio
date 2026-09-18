"use client";

// The full-page email editor.
//
// Layout is a three-column workspace: the block outline on the left, the
// settings for whatever is selected in the middle, and a live preview on the
// right that is rendered by the send path rather than by anything in here.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { vulfMono } from "@/app/fonts";
import { ArrowLeft, Check, Loader2, Send, TriangleAlert } from "lucide-react";
import type { CampaignRecord } from "@/lib/supabase";
import { describeSegment } from "@/lib/marketing/segment";
import {
  DEFAULT_DESIGN,
  blocksFromLegacyHtml,
  checkDocument,
  combineImageWithText,
  parseDocument,
  splitColumns,
  type EmailBlock,
  type EmailDesign,
} from "@/lib/marketing/email-blocks";
import BlockCanvas from "./BlockCanvas";
import { BlockInspector, DesignPanel } from "./BlockInspector";
import EmailPreview from "./EmailPreview";
import { api, inputCls, btnCls } from "./api";

type Tab = "content" | "design" | "audience" | "send";

type Template = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  subject: string | null;
  preview_text: string | null;
  blocks: unknown;
  design: unknown;
};

const labelCls = `${vulfMono.className} block text-xs text-neutral-500 mb-1.5`;

// Long enough that typing a sentence is one save rather than thirty, short
// enough that closing the tab straight after an edit does not lose it.
const AUTOSAVE_MS = 1500;

export default function EmailBuilder({ campaignId }: { campaignId: string }) {
  const router = useRouter();

  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [design, setDesign] = useState<EmailDesign>(DEFAULT_DESIGN);
  const [tags, setTags] = useState("");
  const [match, setMatch] = useState<"any" | "all">("any");

  const [tab, setTab] = useState<Tab>("content");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  const [count, setCount] = useState<number | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmingSend, setConfirmingSend] = useState(false);

  // What was last written to the server. Autosave compares against this rather
  // than firing on every render.
  const savedSnapshot = useRef<string>("");
  const hydrated = useRef(false);

  // Content is locked once a campaign starts sending, because half the list
  // would already have the old version.
  const locked = campaign !== null && campaign.status !== "draft" && campaign.status !== "scheduled";

  useEffect(() => {
    (async () => {
      try {
        const body = await api(`/api/admin/marketing/campaigns/${campaignId}`);
        const record = body.campaign as CampaignRecord;
        const doc = parseDocument(record.blocks, record.design);

        // A campaign written before the builder arrives with no blocks and its
        // copy in `body`. Seeding a text block from it is what stops the first
        // autosave regenerating `body` from an empty array and wiping the
        // email. The snapshot below is taken from the seeded state, so opening
        // one changes nothing until the user actually edits it.
        const startingBlocks =
          doc.blocks.length === 0 && body.legacyHtml
            ? blocksFromLegacyHtml(body.legacyHtml as string)
            : doc.blocks;

        setCampaign(record);
        setName(record.name);
        setSubject(record.subject ?? "");
        setPreviewText(record.preview_text ?? "");
        setBlocks(startingBlocks);
        setDesign(doc.design);
        setTags((record.segment?.tags ?? []).join(", "));
        setMatch(record.segment?.match === "all" ? "all" : "any");

        savedSnapshot.current = JSON.stringify({
          name: record.name,
          subject: record.subject ?? "",
          previewText: record.preview_text ?? "",
          blocks: startingBlocks,
          design: doc.design,
          tags: (record.segment?.tags ?? []).join(", "),
          match: record.segment?.match === "all" ? "all" : "any",
        });
        hydrated.current = true;
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not load this campaign");
      } finally {
        setLoading(false);
      }
    })();
  }, [campaignId]);

  useEffect(() => {
    api("/api/admin/marketing/templates")
      .then((body) => setTemplates(body.templates ?? []))
      .catch(() => setTemplates([]));
  }, []);

  const snapshot = useMemo(
    () => JSON.stringify({ name, subject, previewText, blocks, design, tags, match }),
    [name, subject, previewText, blocks, design, tags, match]
  );

  const save = useCallback(async () => {
    setSaveState("saving");
    setSaveError("");
    const attempted = snapshot;
    try {
      const body = await api(`/api/admin/marketing/campaigns/${campaignId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          subject,
          previewText,
          blocks,
          design,
          segment: { tags: tags.split(",").map((t) => t.trim()).filter(Boolean), match },
        }),
      });
      setCampaign(body.campaign as CampaignRecord);
      savedSnapshot.current = attempted;
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setSaveError(err instanceof Error ? err.message : "Could not save");
    }
  }, [campaignId, name, subject, previewText, blocks, design, tags, match, snapshot]);

  // Autosave. Held back until the first load has populated state, so opening a
  // campaign does not immediately write it back.
  useEffect(() => {
    if (!hydrated.current || locked) return;
    if (snapshot === savedSnapshot.current) return;
    const timer = setTimeout(save, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [snapshot, save, locked]);

  // Live recipient count for the audience tab and the send checklist.
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ countFor: "preview", channel: "email", tags, match });
        const body = await api(`/api/admin/marketing/campaigns?${params}`);
        setCount(body.count);
      } catch {
        setCount(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [tags, match]);

  const issues = useMemo(
    () => checkDocument(blocks, { subject, previewText }),
    [blocks, subject, previewText]
  );
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  // Both transforms live in email-blocks.ts as pure functions, so the round
  // trip is covered by tests rather than only by clicking through the editor.
  function combineWithTextBelow(imageId: string) {
    const next = combineImageWithText(blocks, imageId);
    setBlocks(next);
    // The combined block is the one that replaced the image, so it sits where
    // the image was.
    const at = blocks.findIndex((b) => b.id === imageId);
    setSelectedId(next[at]?.id ?? null);
  }

  function separate(columnsId: string) {
    const at = blocks.findIndex((b) => b.id === columnsId);
    const next = splitColumns(blocks, columnsId);
    setBlocks(next);
    setSelectedId(next[at]?.id ?? null);
  }

  function applyTemplate(template: Template) {
    const doc = parseDocument(template.blocks, template.design);
    setBlocks(doc.blocks);
    setDesign(doc.design);
    if (template.subject) setSubject(template.subject);
    if (template.preview_text) setPreviewText(template.preview_text);
    setSelectedId(null);
  }

  async function sendTest() {
    setTestMessage("");
    try {
      // Saved first, so the test is of what is stored rather than of whatever
      // the last autosave happened to catch. Skipped once the campaign is
      // locked, since the route rejects content edits then and the saved
      // version is already the one that went out.
      if (!locked) await save();
      const body = await api(`/api/admin/marketing/campaigns/${campaignId}/test`, {
        method: "POST",
        body: JSON.stringify({ to: testTo.trim() }),
      });
      setTestMessage(
        body.suppressed
          ? "Marketing is switched off, so nothing was sent. The attempt was logged."
          : `Sent to ${testTo.trim()}.`
      );
    } catch (err) {
      setTestMessage(err instanceof Error ? err.message : "Could not send the test");
    }
  }

  async function send() {
    setSending(true);
    try {
      await save();
      await api(`/api/admin/marketing/campaigns/${campaignId}/send`, { method: "POST" });
      router.push("/admin/marketing");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not send");
      setSending(false);
      setConfirmingSend(false);
    }
  }

  if (loading) {
    return (
      <p className="p-6 text-sm text-neutral-400 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </p>
    );
  }

  if (loadError || !campaign) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-500 mb-3">{loadError || "Not found"}</p>
        <Link href="/admin/marketing" className="text-sm underline">
          Back to marketing
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-0px)]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-black/10 px-4 py-3 shrink-0">
        <Link href="/admin/marketing" className="text-neutral-400 hover:text-neutral-700">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <input
          className="flex-1 min-w-0 text-sm font-medium outline-none bg-transparent"
          value={name}
          disabled={locked}
          onChange={(e) => setName(e.target.value)}
          placeholder="Campaign name"
        />
        <SaveBadge state={saveState} error={saveError} locked={locked} />
      </div>

      {locked && (
        <p className="bg-amber-50 text-amber-700 text-xs px-4 py-2 border-b border-amber-200">
          This campaign is {campaign.status}, so its content can no longer be edited.
        </p>
      )}

      <div className="flex-1 flex min-h-0">
        {/* Left: outline */}
        <div className="w-[300px] shrink-0 border-r border-black/10 overflow-y-auto p-3">
          <BlockCanvas
            blocks={blocks}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={setBlocks}
          />

          {blocks.length === 0 && templates.length > 0 && (
            <div className="mt-4">
              <div className={`${vulfMono.className} text-xs text-neutral-500 mb-2`}>
                Or start from a template
              </div>
              <div className="space-y-1.5">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="w-full rounded-lg border border-black/10 p-2.5 text-left hover:border-[#884A20]"
                  >
                    <div className="text-sm">{t.name}</div>
                    {t.description && (
                      <div className="text-xs text-neutral-500 mt-0.5">{t.description}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Middle: settings */}
        <div className="w-[340px] shrink-0 border-r border-black/10 overflow-y-auto">
          <div className="flex border-b border-black/10 sticky top-0 bg-white z-10">
            {(["content", "design", "audience", "send"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`${vulfMono.className} flex-1 px-2 py-2.5 text-[11px] uppercase tracking-[0.1em] ${
                  tab === t ? "border-b-2 border-[#884A20] text-neutral-900" : "text-neutral-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-3">
            {tab === "content" && (
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Subject line</label>
                  <input
                    className={inputCls}
                    value={subject}
                    disabled={locked}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="What lands in the inbox"
                  />
                </div>
                <div>
                  <label className={labelCls}>Preview text</label>
                  <input
                    className={inputCls}
                    value={previewText}
                    disabled={locked}
                    onChange={(e) => setPreviewText(e.target.value)}
                    placeholder="The line shown after the subject"
                  />
                </div>

                <hr className="border-black/10" />

                {selected ? (
                  <BlockInspector
                    block={selected}
                    onChange={(next) =>
                      setBlocks(blocks.map((b) => (b.id === next.id ? next : b)))
                    }
                    onWrapTextBeside={
                      selected.type === "image" ? () => combineWithTextBelow(selected.id) : undefined
                    }
                    onSplit={selected.type === "columns" ? () => separate(selected.id) : undefined}
                  />
                ) : (
                  <p className="text-sm text-neutral-400">
                    Pick a block on the left to edit it.
                  </p>
                )}
              </div>
            )}

            {tab === "design" && <DesignPanel design={design} onChange={setDesign} />}

            {tab === "audience" && (
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Segment tags (comma separated, blank means everyone)</label>
                  <input
                    className={inputCls}
                    placeholder="legacy-import, orem"
                    value={tags}
                    disabled={locked}
                    onChange={(e) => setTags(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Match</label>
                  <select
                    className={inputCls}
                    value={match}
                    disabled={locked}
                    onChange={(e) => setMatch(e.target.value as "any" | "all")}
                  >
                    <option value="any">Any of these tags</option>
                    <option value="all">All of these tags</option>
                  </select>
                </div>
                <p className="text-sm text-neutral-600">
                  {count === null ? "Counting…" : `${count} ${count === 1 ? "person" : "people"}`} will
                  get this.
                </p>
                <p className="text-xs text-neutral-400">
                  {describeSegment({
                    tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
                    match,
                  })}
                </p>
              </div>
            )}

            {tab === "send" && (
              <div className="space-y-4">
                <div>
                  <div className={`${vulfMono.className} text-xs text-neutral-500 mb-2`}>
                    Before it goes out
                  </div>
                  {errors.length === 0 && warnings.length === 0 ? (
                    <p className="text-sm text-green-700 flex items-center gap-1.5">
                      <Check className="w-4 h-4" /> Everything checks out.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {[...errors, ...warnings].map((issue, i) => (
                        <li
                          key={i}
                          className={`text-xs flex items-start gap-1.5 ${
                            issue.level === "error" ? "text-red-600" : "text-amber-600"
                          }`}
                        >
                          <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <button
                            type="button"
                            className="text-left underline-offset-2 hover:underline"
                            onClick={() => {
                              if (issue.blockId) {
                                setSelectedId(issue.blockId);
                                setTab("content");
                              }
                            }}
                          >
                            {issue.message}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <hr className="border-black/10" />

                <div>
                  <label className={labelCls}>Send a test copy to</label>
                  <div className="flex gap-2">
                    <input
                      className={inputCls}
                      placeholder="you@example.com"
                      value={testTo}
                      onChange={(e) => setTestTo(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendTest()}
                    />
                    <button
                      type="button"
                      onClick={sendTest}
                      disabled={!testTo.trim()}
                      className={`${btnCls} ${vulfMono.className} border border-black/20 text-neutral-600 shrink-0 disabled:opacity-40`}
                    >
                      TEST
                    </button>
                  </div>
                  {testMessage && <p className="text-xs text-neutral-500 mt-1.5">{testMessage}</p>}
                </div>

                <hr className="border-black/10" />

                <div>
                  <p className="text-sm text-neutral-600 mb-2">
                    {count === null ? "Counting…" : `${count} ${count === 1 ? "person" : "people"}`} will
                    get this.
                  </p>
                  {confirmingSend ? (
                    <div className="rounded-lg border border-black/10 p-3 space-y-2">
                      <p className="text-sm">
                        Send &ldquo;{name}&rdquo; to {count ?? 0}{" "}
                        {count === 1 ? "person" : "people"}? This cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={send}
                          disabled={sending}
                          className={`${btnCls} ${vulfMono.className} bg-[#884A20] text-white disabled:opacity-50`}
                        >
                          {sending ? "SENDING…" : "YES, SEND IT"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingSend(false)}
                          className={`${btnCls} ${vulfMono.className} border border-black/20 text-neutral-600`}
                        >
                          CANCEL
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingSend(true)}
                      disabled={errors.length > 0 || locked}
                      className={`${btnCls} ${vulfMono.className} bg-[#884A20] text-white flex items-center gap-1.5 disabled:opacity-40`}
                      title={errors.length > 0 ? "Fix the errors above first" : undefined}
                    >
                      <Send className="w-3.5 h-3.5" /> SEND CAMPAIGN
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: preview */}
        <div className="flex-1 min-w-0">
          <EmailPreview blocks={blocks} design={design} subject={subject} previewText={previewText} />
        </div>
      </div>
    </div>
  );
}

function SaveBadge({
  state,
  error,
  locked,
}: {
  state: "idle" | "saving" | "saved" | "error";
  error: string;
  locked: boolean;
}) {
  if (locked) return <span className="text-xs text-neutral-400 shrink-0">Locked</span>;
  if (state === "saving") {
    return (
      <span className="text-xs text-neutral-400 flex items-center gap-1.5 shrink-0">
        <Loader2 className="w-3 h-3 animate-spin" /> Saving…
      </span>
    );
  }
  if (state === "error") return <span className="text-xs text-red-500 shrink-0">{error || "Not saved"}</span>;
  if (state === "saved") return <span className="text-xs text-neutral-400 shrink-0">Saved</span>;
  return null;
}
