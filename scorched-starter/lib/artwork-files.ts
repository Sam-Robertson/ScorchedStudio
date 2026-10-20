// lib/artwork-files.ts — server-only
//
// The two files a piece of artwork can carry: a photo in the public
// artwork-images bucket and the signed artist agreement in the private
// artwork-contracts bucket. Both reach storage straight from the browser
// through a signed upload URL (app/api/admin/artwork/[id]/files/[kind]), so
// the app server never holds the bytes.
import { getSupabase, type ArtworkRecord } from "@/lib/supabase";

export const ARTWORK_FILE_KINDS = ["image", "contract"] as const;
export type ArtworkFileKind = (typeof ARTWORK_FILE_KINDS)[number];

export function isArtworkFileKind(v: unknown): v is ArtworkFileKind {
  return typeof v === "string" && (ARTWORK_FILE_KINDS as readonly string[]).includes(v);
}

type KindConfig = {
  bucket: string;
  maxBytes: number; // must match the bucket's file_size_limit
  label: string;
  accepts: (mime: string) => boolean;
};

export const ARTWORK_FILE_CONFIG: Record<ArtworkFileKind, KindConfig> = {
  image: {
    bucket: "artwork-images",
    maxBytes: 10 * 1024 * 1024,
    label: "photo",
    accepts: (mime) => mime.startsWith("image/"),
  },
  contract: {
    bucket: "artwork-contracts",
    maxBytes: 20 * 1024 * 1024,
    label: "contract",
    accepts: (mime) => mime === "application/pdf" || mime.startsWith("image/"),
  },
};

// Contract links expire, so the row never stores one; every response that
// returns artwork rows attaches a fresh signed URL instead.
const CONTRACT_URL_TTL_SECONDS = 60 * 60;

export type ArtworkWithFiles = ArtworkRecord & { contract_url: string | null };

export async function withContractUrls(rows: ArtworkRecord[]): Promise<ArtworkWithFiles[]> {
  const paths = rows.map((r) => r.contract_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data, error } = await getSupabase()
      .storage.from(ARTWORK_FILE_CONFIG.contract.bucket)
      .createSignedUrls(paths, CONTRACT_URL_TTL_SECONDS);
    if (error) console.error("ARTWORK_CONTRACT_SIGN_ERROR", error);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
    }
  }
  return rows.map((r) => ({ ...r, contract_url: r.contract_path ? urls.get(r.contract_path) ?? null : null }));
}

export async function withContractUrl(row: ArtworkRecord): Promise<ArtworkWithFiles> {
  return (await withContractUrls([row]))[0];
}

// Drops every stored file for a row; used when the row itself is deleted.
export async function removeArtworkFiles(row: Pick<ArtworkRecord, "image_path" | "contract_path">) {
  const sb = getSupabase();
  if (row.image_path) await sb.storage.from(ARTWORK_FILE_CONFIG.image.bucket).remove([row.image_path]);
  if (row.contract_path) await sb.storage.from(ARTWORK_FILE_CONFIG.contract.bucket).remove([row.contract_path]);
}
