import { NextResponse } from "next/server";
import { getCampaign, updateCampaign } from "@/lib/db";
import { computeNextSendAt } from "@/lib/schedule";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const current = await getCampaign(id);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const {
    company_name,
    subject,
    from_name,
    link_url,
    schedule_frequency,
    schedule_time,
    schedule_day_of_week,
    active,
  } = body;

  if (schedule_frequency !== undefined && !["none", "daily", "weekly"].includes(schedule_frequency)) {
    return NextResponse.json({ error: "Invalid schedule_frequency" }, { status: 400 });
  }

  let mergedLinkUrl = current.link_url;
  if (typeof link_url === "string") {
    const trimmed = link_url.trim();
    if (trimmed === "") {
      mergedLinkUrl = null;
    } else {
      // Auto-prepend https:// so a bare "example.com" still works, rather
      // than silently producing a broken relative link in the email.
      const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      try {
        new URL(withProtocol);
      } catch {
        return NextResponse.json({ error: "Invalid link URL" }, { status: 400 });
      }
      mergedLinkUrl = withProtocol;
    }
  } else if (link_url === null) {
    mergedLinkUrl = null;
  }

  const merged = {
    company_name: typeof company_name === "string" ? company_name : current.company_name,
    subject: typeof subject === "string" ? subject : current.subject,
    from_name: typeof from_name === "string" ? from_name : current.from_name,
    link_url: mergedLinkUrl,
    schedule_frequency: (schedule_frequency ?? current.schedule_frequency) as typeof current.schedule_frequency,
    schedule_time: typeof schedule_time === "string" ? schedule_time : current.schedule_time,
    schedule_day_of_week:
      schedule_day_of_week === null || typeof schedule_day_of_week === "number"
        ? schedule_day_of_week
        : current.schedule_day_of_week,
    active: typeof active === "boolean" ? active : current.active,
  };

  // Recompute next_send_at whenever the schedule itself changed, so a saved
  // schedule takes effect immediately rather than waiting for a send first.
  const scheduleChanged =
    "schedule_frequency" in body || "schedule_time" in body || "schedule_day_of_week" in body;
  const nextSendAt =
    merged.schedule_frequency === "none"
      ? null
      : scheduleChanged
        ? computeNextSendAt(merged.schedule_frequency, merged.schedule_time, merged.schedule_day_of_week)
        : current.next_send_at;

  const campaign = await updateCampaign(id, { ...merged, next_send_at: nextSendAt });
  return NextResponse.json({ campaign });
}
