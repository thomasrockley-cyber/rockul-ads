import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeNextSendAt } from "@/lib/schedule";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const {
    company_name,
    subject,
    from_name,
    schedule_frequency,
    schedule_time,
    schedule_day_of_week,
    active,
  } = body;

  if (schedule_frequency && !["none", "daily", "weekly"].includes(schedule_frequency)) {
    return NextResponse.json({ error: "Invalid schedule_frequency" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof company_name === "string") update.company_name = company_name;
  if (typeof subject === "string") update.subject = subject;
  if (typeof from_name === "string") update.from_name = from_name;
  if (typeof schedule_frequency === "string") update.schedule_frequency = schedule_frequency;
  if (typeof schedule_time === "string") update.schedule_time = schedule_time;
  if (schedule_day_of_week === null || typeof schedule_day_of_week === "number") {
    update.schedule_day_of_week = schedule_day_of_week;
  }
  if (typeof active === "boolean") update.active = active;

  // Recompute next_send_at whenever the schedule itself changes, so a saved
  // schedule takes effect immediately rather than waiting for a send to
  // happen first.
  if ("schedule_frequency" in update || "schedule_time" in update || "schedule_day_of_week" in update) {
    const freq = (update.schedule_frequency as string) ?? undefined;
    if (freq === "none") {
      update.next_send_at = null;
    } else {
      const { data: current } = await createAdminClient()
        .from("campaigns")
        .select("schedule_frequency, schedule_time, schedule_day_of_week")
        .eq("id", id)
        .single();
      const effectiveFreq = freq ?? current?.schedule_frequency;
      const effectiveTime = (update.schedule_time as string) ?? current?.schedule_time ?? "09:00";
      const effectiveDay =
        "schedule_day_of_week" in update
          ? (update.schedule_day_of_week as number | null)
          : current?.schedule_day_of_week;
      if (effectiveFreq && effectiveFreq !== "none") {
        update.next_send_at = computeNextSendAt(effectiveFreq, effectiveTime, effectiveDay ?? null);
      }
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("campaigns").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}
