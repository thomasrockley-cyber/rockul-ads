import { NextResponse } from "next/server";
import { sendCampaignNow } from "@/lib/sendCampaign";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await sendCampaignNow(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
