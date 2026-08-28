import Link from "next/link";
import { getAllCampaigns, countActiveRecipients } from "@/lib/db";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const campaigns = await getAllCampaigns();
  const counts = await Promise.all(campaigns.map((c) => countActiveRecipients(c.id)));

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Rockul Ads</h1>
        <LogoutButton />
      </div>

      <div className="flex flex-col gap-3">
        {campaigns.map((c, i) => {
          const recipientCount = counts[i];
          return (
            <Link
              key={c.id}
              href={`/campaign/${c.id}`}
              className="flex items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4 transition-colors hover:border-neutral-600"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-800 text-xs text-neutral-500">
                {c.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  "No ad"
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium">{c.company_name || `Slot ${c.slot_number}`}</p>
                <p className="text-xs text-neutral-500">
                  {recipientCount} recipient{recipientCount === 1 ? "" : "s"} ·{" "}
                  {c.schedule_frequency === "none"
                    ? "Manual send only"
                    : `${c.active ? "Auto" : "Paused"} · ${c.schedule_frequency}`}
                  {c.last_sent_at ? ` · last sent ${new Date(c.last_sent_at).toLocaleDateString("en-GB")}` : ""}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
