import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

interface CampaignRow {
  id: string;
  slot_number: number;
  company_name: string;
  image_url: string | null;
  schedule_frequency: "none" | "daily" | "weekly";
  active: boolean;
  last_sent_at: string | null;
}

export default async function DashboardPage() {
  const supabase = createAdminClient();
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, slot_number, company_name, image_url, schedule_frequency, active, last_sent_at")
    .order("slot_number", { ascending: true });

  const rows = (campaigns ?? []) as CampaignRow[];

  const counts = await Promise.all(
    rows.map((c) =>
      supabase
        .from("recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", c.id)
        .is("unsubscribed_at", null)
    )
  );

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Rockul Ads</h1>
        <LogoutButton />
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((c, i) => {
          const recipientCount = counts[i].count ?? 0;
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
