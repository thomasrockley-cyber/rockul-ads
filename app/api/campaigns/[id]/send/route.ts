import { NextResponse } from "next/server";
import { sendCampaignNow } from "@/lib/sendCampaign";

// 60s is the max on Vercel's Hobby plan. sendCampaignNow() is resumable —
// for a recipient list too large to finish in one call, it processes what
// it can and returns done:false; the frontend calls this same endpoint
// again to continue (see CampaignEditor.tsx's sendNow()), and each call
// picks up exactly where the last one left off without re-emailing anyone.
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await sendCampaignNow(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
