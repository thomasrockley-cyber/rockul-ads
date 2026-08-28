import { NextResponse } from "next/server";
import { listRecipients, addRecipients, removeRecipient } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipients = await listRecipients(id);
  return NextResponse.json({ recipients });
}

// Accepts a raw blob of pasted text — one address per line, or separated by
// commas/semicolons/whitespace, any mix of all of those. Re-pasting a list
// that includes someone already unsubscribed does NOT re-subscribe them —
// see addRecipients() in lib/db.ts.
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

  const added = await addRecipients(id, valid);
  return NextResponse.json({ added, invalidCount });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const recipientId = body?.recipientId;
  if (typeof recipientId !== "string") return NextResponse.json({ error: "Missing recipientId" }, { status: 400 });

  await removeRecipient(recipientId, id);
  return NextResponse.json({ ok: true });
}
