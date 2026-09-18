// app/api/admin/marketing/render/route.ts
//
// Renders a block document to HTML for the editor's live preview.
//
// Server side on purpose. The preview has to be the same render the send uses
// or it is not evidence of anything, and @react-email/render pulled into the
// admin bundle would ship the whole email renderer to the browser.
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { normalizeDocument, DocumentError } from "@/lib/marketing/email-document";
import { renderDocument, personalize } from "@/lib/marketing/email-render";

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { blocks, design, subject, previewText } = await req.json();
    const doc = normalizeDocument(blocks, design);

    const template = await renderDocument(doc.blocks, doc.design, { subject, previewText });

    // Rendered as it would arrive for someone whose name we know, so merge
    // tags show a real name in the preview instead of raw braces. The
    // unsubscribe link points at a placeholder route: this preview is not
    // addressed to anyone, so there is no token to use.
    const shown = personalize(template, {
      firstName: "Sam",
      unsubscribeUrl: "#preview-unsubscribe",
    });

    return Response.json({ html: shown.html, text: shown.text, subject: shown.subject });
  } catch (err) {
    if (err instanceof DocumentError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error("EMAIL_RENDER_ERROR", err);
    return Response.json({ error: "Could not render this email" }, { status: 500 });
  }
}
