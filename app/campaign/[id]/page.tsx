import { notFound } from "next/navigation";
import Link from "next/link";
import { getCampaign, listRecipients, listSendLog } from "@/lib/db";
import CampaignEditor from "./CampaignEditor";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const [recipients, sendLog] = await Promise.all([listRecipients(id), listSendLog(id, 10)]);

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-8">
      <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300">
        ← All campaigns
      </Link>
      <CampaignEditor campaign={campaign} initialRecipients={recipients} initialSendLog={sendLog} />
    </div>
  );
}
