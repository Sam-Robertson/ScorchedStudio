// app/api/admin/marketing/media/route.ts
//
// Upload and list images for the email builder.
//
// Unlike the social-post uploader, this posts the file through the server
// rather than handing the browser a signed URL. The server has to see the
// bytes: it re-encodes every upload, which resizes it for email, strips EXIF
// (phone photos carry GPS coordinates), and proves the file is actually an
// image rather than something with an image extension. The editor shrinks
// pictures in the browser first, so what arrives here is already small.
import { NextRequest } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "@/lib/admin-session";
import { getSupabase } from "@/lib/supabase";

const BUCKET = "marketing-media";

// Comfortably inside the serverless request body limit. The browser resizes
// before uploading, so a normal photo arrives at a few hundred KB.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// Wide enough to stay sharp on a retina screen at the 600px content width,
// without sending a 4000px original to every inbox.
const MAX_WIDTH = 1200;

const ALLOWED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function publicUrlFor(path: string): string {
  return getSupabase().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await getSupabase()
    .storage
    .from(BUCKET)
    .list("", { limit: 200, sortBy: { column: "created_at", order: "desc" } });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const images = (data ?? [])
    // Supabase returns a placeholder row for the folder itself; it has no id.
    .filter((item) => item.id)
    .map((item) => ({
      name: item.name,
      url: publicUrlFor(item.name),
      size: item.metadata?.size ?? null,
      createdAt: item.created_at ?? null,
    }));

  return Response.json({ images });
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "No file was uploaded" }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return Response.json({ error: "Upload a JPEG, PNG, GIF, or WebP image" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Keep it under 4MB.` },
        { status: 400 }
      );
    }

    const input = Buffer.from(await file.arrayBuffer());

    let output: Buffer;
    let contentType: string;
    let ext: string;

    if (file.type === "image/gif") {
      // Left alone. Re-encoding an animated GIF through sharp flattens it to
      // the first frame, which silently breaks the one thing a GIF is for.
      output = input;
      contentType = "image/gif";
      ext = "gif";
    } else {
      const pipeline = sharp(input, { failOn: "error" }).rotate();
      const meta = await pipeline.metadata();
      const resized = (meta.width ?? 0) > MAX_WIDTH ? pipeline.resize({ width: MAX_WIDTH }) : pipeline;

      if (file.type === "image/png") {
        output = await resized.png({ compressionLevel: 9 }).toBuffer();
        contentType = "image/png";
        ext = "png";
      } else {
        // JPEG and WebP both land as JPEG: it is the one format every email
        // client on every platform renders, and WebP is still not safe in
        // Outlook.
        output = await resized.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
        contentType = "image/jpeg";
        ext = "jpg";
      }
    }

    const base = (file.name.replace(/\.[^.]+$/, "") || "image")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    const path = `${Date.now()}-${base || "image"}.${ext}`;

    const { error } = await getSupabase()
      .storage
      .from(BUCKET)
      .upload(path, output, { contentType, cacheControl: "31536000", upsert: false });

    if (error) {
      console.error("MARKETING_MEDIA_UPLOAD_ERROR", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ url: publicUrlFor(path), path, size: output.length });
  } catch (err) {
    console.error("MARKETING_MEDIA_ERROR", err);
    return Response.json({ error: "Could not process that image" }, { status: 500 });
  }
}
