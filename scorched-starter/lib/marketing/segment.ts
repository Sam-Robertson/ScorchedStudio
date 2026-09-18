// lib/marketing/segment.ts
//
// Turns a campaign's stored segment into the set of people it reaches. Kept
// pure and free of Supabase imports so the project's test runner can exercise
// the matching rules directly.

export type Segment = {
  tags?: string[];
  match?: "any" | "all";
};

export type SegmentCandidate = {
  tags: string[];
};

// An empty or tagless segment means everyone subscribed on the channel. That
// is deliberate: a campaign with no filter is a send to the whole list, and
// the admin UI shows the resulting count before anything goes out.
export function segmentMatches(segment: Segment | null | undefined, candidate: SegmentCandidate): boolean {
  const tags = segment?.tags ?? [];
  if (tags.length === 0) return true;

  const owned = new Set(candidate.tags ?? []);
  return (segment?.match ?? "any") === "all"
    ? tags.every((t) => owned.has(t))
    : tags.some((t) => owned.has(t));
}

// Only these statuses may be sent to. Everything else, including 'none' (on
// the list but never opted in on this channel), is excluded.
export function isSendableEmailStatus(status: string): boolean {
  return status === "subscribed";
}

export function isSendableSmsStatus(status: string): boolean {
  return status === "subscribed";
}

// Describes the segment in words for the confirm dialog, so the person
// clicking send reads what the filter means rather than raw JSON.
export function describeSegment(segment: Segment | null | undefined): string {
  const tags = segment?.tags ?? [];
  if (tags.length === 0) return "everyone subscribed on this channel";
  const joiner = (segment?.match ?? "any") === "all" ? " and " : " or ";
  return `subscribers tagged ${tags.join(joiner)}`;
}
