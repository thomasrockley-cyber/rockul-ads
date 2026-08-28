import { NextResponse } from "next/server";
import { getDueCampaigns } from "@/lib/db";
import { sendCampaignNow } from "@/lib/sendCampaign";

// 60s is the max on Vercel's Hobby plan. This route can process up to 5
// campaigns in one run (all due on the same day), so it's the more likely
// of the two send paths to actually hit a duration limit.
export const maxDuration = 60;

// Called by Vercel Cron (see vercel.json) — Vercel automatically attaches
// this same Authorization header on its own cron requests once CRON_SECRET
// is set as an env var, so this check also blocks anyone else from hitting
// the endpoint directly.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await getDueCampaigns();

  const results = [];
  for (const campaign of due) {
    const result = await sendCampaignNow(campaign.id);
    results.push({ campaignId: campaign.id, ...result });
  }

  return NextResponse.json({ checked: due.length, results });
}
