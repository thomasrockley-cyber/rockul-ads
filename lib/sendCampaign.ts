import { getCampaign, getActiveRecipientEmails, insertSendLog, markSent } from "./db";
import { sendCampaignToRecipients } from "./email";
import { computeNextSendAt } from "./schedule";

export async function sendCampaignNow(campaignId: string): Promise<
  { ok: true; sent: number; failed: number } | { ok: false; error: string }
> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return { ok: false, error: "Campaign not found" };
  if (!campaign.image_url) return { ok: false, error: "No ad image uploaded for this campaign" };
  if (!campaign.subject) return { ok: false, error: "No subject line set for this campaign" };

  const recipients = await getActiveRecipientEmails(campaignId);
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
      linkUrl: campaign.link_url,
      recipients,
      siteUrl,
    });
    sent = result.sent;
    failed = result.failed;
    status = failed === 0 ? "sent" : sent === 0 ? "failed" : "partial";
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Unknown error";
  }

  await insertSendLog({ campaignId, recipientCount: sent, status, error: errorMessage });

  const nextSendAt =
    campaign.schedule_frequency === "none"
      ? null
      : computeNextSendAt(campaign.schedule_frequency, campaign.schedule_time, campaign.schedule_day_of_week);
  await markSent(campaignId, nextSendAt);

  if (errorMessage) return { ok: false, error: errorMessage };
  return { ok: true, sent, failed };
}
