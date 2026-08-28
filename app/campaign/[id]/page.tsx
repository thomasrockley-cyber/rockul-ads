import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import CampaignEditor from "./CampaignEditor";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: campaign }, { data: recipients }, { data: sendLog }] = await Promise.all([
    admin.from("campaigns").select("*").eq("id", id).single(),
    admin
      .from("recipients")
      .select("id, email, unsubscribed_at, created_at")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("send_log")
      .select("id, sent_at, recipient_count, status, error")
      .eq("campaign_id", id)
      .order("sent_at", { ascending: false })
      .limit(10),
  ]);

  if (!campaign) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-8">
      <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300">
        ← All campaigns
      </Link>
      <CampaignEditor
        campaign={campaign}
        initialRecipients={recipients ?? []}
        initialSendLog={sendLog ?? []}
      />
    </div>
  );
}
