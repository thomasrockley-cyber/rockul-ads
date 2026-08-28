import { createAdminClient } from "./supabase/admin";
import { sendCampaignToRecipients } from "./email";
import { computeNextSendAt } from "./schedule";

export async function sendCampaignNow(campaignId: string): Promise<
  { ok: true; sent: number; failed: number } | { ok: false; error: string }
> {
  const admin = createAdminClient();
  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (campaignError || !campaign) return { ok: false, error: "Campaign not found" };
  if (!campaign.image_url) return { ok: false, error: "No ad image uploaded for this campaign" };
  if (!campaign.subject) return { ok: false, error: "No subject line set for this campaign" };

  const { data: recipientRows, error: recipientsError } = await admin
    .from("recipients")
    .select("email")
    .eq("campaign_id", campaignId)
    .is("unsubscribed_at", null);
  if (recipientsError) return { ok: false, error: recipientsError.message };

  const recipients = (recipientRows ?? []).map((r) => r.email as string);
  if (recipients.length === 0) return { ok: false, error: "No recipients to send to" };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  let sent = 0;
  let failed = 0;
  let status: "sent" | "failed" | "partial" = "failed";
  let errorMessage: string | null = null;

  try {
    const result = await sendCampaignToRecipients({
      campaignId,
      companyName: campaign.company_name || "Ad",
      fromName: campaign.from_name,
      subject: campaign.subject,
      imageUrl: campaign.image_url,
      recipients,
      siteUrl,
    });
    sent = result.sent;
    failed = result.failed;
    status = failed === 0 ? "sent" : sent === 0 ? "failed" : "partial";
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Unknown error";
  }

  await admin.from("send_log").insert({
    campaign_id: campaignId,
    recipient_count: sent,
    status,
    error: errorMessage,
  });

  const update: Record<string, unknown> = { last_sent_at: new Date().toISOString() };
  if (campaign.schedule_frequency !== "none") {
    update.next_send_at = computeNextSendAt(
      campaign.schedule_frequency,
      campaign.schedule_time,
      campaign.schedule_day_of_week
    );
  }
  await admin.from("campaigns").update(update).eq("id", campaignId);

  if (errorMessage) return { ok: false, error: errorMessage };
  return { ok: true, sent, failed };
}
