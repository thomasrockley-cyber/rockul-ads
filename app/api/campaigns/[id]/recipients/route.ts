import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("recipients")
    .select("id, email, unsubscribed_at, created_at")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recipients: data });
}

// Accepts a raw blob of pasted text — one address per line, or separated by
// commas/semicolons/whitespace, any mix of all of those. Re-pasting a list
// that includes someone already unsubscribed does NOT re-subscribe them
// (upsert with ignoreDuplicates leaves their existing row, unsubscribed_at
// included, untouched).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const raw = body?.text;
  if (typeof raw !== "string") return NextResponse.json({ error: "Missing text" }, { status: 400 });

  const candidates = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const valid = [...new Set(candidates.filter((e) => EMAIL_RE.test(e)))];
  const invalidCount = candidates.length - valid.length;

  if (valid.length === 0) {
    return NextResponse.json({ added: 0, invalidCount, error: "No valid email addresses found" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("recipients")
    .upsert(
      valid.map((email) => ({ campaign_id: id, email })),
      { onConflict: "campaign_id,email", ignoreDuplicates: true }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ added: valid.length, invalidCount });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const recipientId = body?.recipientId;
  if (typeof recipientId !== "string") return NextResponse.json({ error: "Missing recipientId" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("recipients").delete().eq("id", recipientId).eq("campaign_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
