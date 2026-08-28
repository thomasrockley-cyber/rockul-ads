import { NextResponse } from "next/server";
import { sendCampaignNow } from "@/lib/sendCampaign";

// 60s is the max on Vercel's Hobby plan — without this it defaults to much
// shorter, and a big recipient list would get the function killed mid-send
// (with nothing logged, since send_log is only written after the loop
// finishes) rather than actually completing. See lib/email.ts's CONCURRENCY.
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await sendCampaignNow(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
