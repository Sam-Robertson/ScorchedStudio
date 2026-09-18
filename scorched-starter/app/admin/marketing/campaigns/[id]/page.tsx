// The block-based email editor, on its own page rather than in a modal: it
// needs the room for an outline, a settings panel, and a live preview at once.
import EmailBuilder from "@/components/admin/email-builder/EmailBuilder";

export default async function CampaignEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EmailBuilder campaignId={id} />;
}
