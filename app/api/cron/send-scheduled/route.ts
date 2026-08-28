import { NextResponse } from "next/server";
import { getDueCampaigns } from "@/lib/db";
import { sendCampaignNow } from "@/lib/sendCampaign";

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
